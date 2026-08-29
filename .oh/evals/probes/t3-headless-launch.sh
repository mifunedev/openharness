#!/usr/bin/env bash
# tier: A
# source: issue #858 — /t3 launched a bare `npx --yes t3`, which is the local GUI and
#         never prints a pairing URL, and docs claimed T3 listens on 0.0.0.0:3773.
#         Mobile access has to come from the tailnet, not from a wide bind, and the
#         server has to survive the operator's terminal going away.
# desc: .oh/skills/t3/scripts/t3-code.sh launches the headless `t3 serve` inside
#       `tmux new-session -d`, maps --tailscale to --tailscale-serve, offers `t3 pair`,
#       checks the Node floor, never binds 0.0.0.0, and refuses the tailscale path with
#       an actionable error when the tailscale binary is absent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
SCRIPT=".oh/skills/t3/scripts/t3-code.sh"

[ -f "$SCRIPT" ] || { echo "SKIPPED: $SCRIPT absent" >&2; exit 2; }

BASH_BIN="$(command -v bash)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

missing=()

mapfile -t invocations < <(grep -oE 'npx --yes t3([[:space:]]+[a-z-]+)?' "$SCRIPT" | sort -u)
if ((${#invocations[@]} == 0)); then
  missing+=("$SCRIPT: no 'npx --yes t3' invocation at all")
fi
for inv in "${invocations[@]}"; do
  case "$inv" in
    "npx --yes t3 serve"|"npx --yes t3 pair") ;;
    *) missing+=("$SCRIPT: '$inv' is not a headless subcommand — bare 't3' is the local GUI and never prints a pairing URL") ;;
  esac
done
grep -qF 'npx --yes t3 serve' "$SCRIPT" \
  || missing+=("$SCRIPT: no 'npx --yes t3 serve' — the headless server is how a phone pairs")
grep -qF 'npx --yes t3 pair' "$SCRIPT" \
  || missing+=("$SCRIPT: no 'npx --yes t3 pair' — a second device cannot be added without a restart")
grep -qF -- '--tailscale-serve' "$SCRIPT" \
  || missing+=("$SCRIPT: --tailscale is not mapped to t3's --tailscale-serve")
grep -qE 'tmux new-session -d' "$SCRIPT" \
  || missing+=("$SCRIPT: the server is not launched with 'tmux new-session -d' — it would die with the terminal")
grep -qF '0.0.0.0' "$SCRIPT" \
  && missing+=("$SCRIPT: mentions 0.0.0.0 — T3 Code must stay on loopback and be reached through the tailnet")
grep -qF '22.16' "$SCRIPT" \
  || missing+=("$SCRIPT: no Node 22.16 floor check — t3 serve fails opaquely on the base image's older 22.x")

stub_absent="$WORK/stub-absent"
mkdir -p "$stub_absent"
printf '#!/bin/sh\necho v22.16.0\n' > "$stub_absent/node"
printf '#!/bin/sh\nexit 0\n' > "$stub_absent/npx"
printf '#!/bin/sh\nexit 1\n' > "$stub_absent/tmux"
chmod 0755 "$stub_absent"/*

if command -v tailscale >/dev/null 2>&1 && PATH="$stub_absent" command -v tailscale >/dev/null 2>&1; then
  echo "SKIPPED: a real tailscale binary is unavoidable on PATH; the absent-binary branch cannot be exercised" >&2
  exit 2
fi

set +e
doctor_out="$(env -i PATH="$stub_absent" "$BASH_BIN" "$SCRIPT" doctor --tailscale 2>&1)"
doctor_code=$?
set -e
if ((doctor_code == 0)); then
  missing+=("$SCRIPT: 'doctor --tailscale' succeeded with no tailscale binary on PATH — the preflight is not load-bearing")
fi
grep -qF 'oh tool install tailscale' <<<"$doctor_out" \
  || missing+=("$SCRIPT: 'doctor --tailscale' does not name 'oh tool install tailscale' as the fix (got: ${doctor_out//$'\n'/ })")

stub_present="$WORK/stub-present"
mkdir -p "$stub_present"
printf '#!/usr/bin/env bash\necho v22.16.0\n' > "$stub_present/node"
printf '#!/usr/bin/env bash\nexit 0\n' > "$stub_present/npx"
printf '#!/usr/bin/env bash\necho "{\\"BackendState\\":\\"Running\\"}"\n' > "$stub_present/tailscale"
cat > "$stub_present/tmux" <<'STUB'
#!/usr/bin/env bash
case "${1:-}" in
  has-session)  [ -f "$T3_PROBE_STATE/session" ] ;;
  new-session)  shift; printf '%s\n' "$*" > "$T3_PROBE_STATE/launch"; : > "$T3_PROBE_STATE/session" ;;
  capture-pane) echo "pairing url: https://box.example-tailnet.ts.net/pair?token=probe" ;;
  kill-session) rm -f "$T3_PROBE_STATE/session" ;;
  *) : ;;
esac
STUB
chmod 0755 "$stub_present"/*

state="$WORK/state"
mkdir -p "$state"
set +e
T3_PROBE_STATE="$state" PATH="$stub_present:$PATH" "$BASH_BIN" "$SCRIPT" start --tailscale \
  --session t3-probe --log "$WORK/t3-probe.log" >"$WORK/start.out" 2>&1
start_code=$?
set -e
if ((start_code != 0)); then
  missing+=("$SCRIPT: 'start --tailscale' failed under stubbed tmux/node/npx/tailscale (${start_code}): $(tr '\n' ' ' < "$WORK/start.out")")
elif [ ! -f "$state/launch" ]; then
  missing+=("$SCRIPT: 'start --tailscale' never reached 'tmux new-session -d'")
else
  launch="$(cat "$state/launch")"
  grep -qE '^-d -s t3-probe ' <<<"$launch" \
    || missing+=("$SCRIPT: the tmux session is not detached and named (got: $launch)")
  grep -qF 'npx --yes t3 serve --tailscale-serve' <<<"$launch" \
    || missing+=("$SCRIPT: 'start --tailscale' does not launch 'npx --yes t3 serve --tailscale-serve' (got: $launch)")
  grep -qF '0.0.0.0' <<<"$launch" \
    && missing+=("$SCRIPT: the launch command binds 0.0.0.0 (got: $launch)")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /t3 launches detached 't3 serve', maps --tailscale to --tailscale-serve, offers 't3 pair', and never binds 0.0.0.0" >&2
