#!/usr/bin/env bash
# tier: A
# source: issue #879 — `oh` becomes the only front door, so `make destroy` must
#         survive as `oh destroy` without becoming one typo away from wiping
#         the provider-auth volumes
# desc: `oh destroy` never reaches the container engine without confirmation — it refuses
#       outright when stdin is not a TTY and --yes is absent, and it aborts on any
#       answer that is not the sandbox name when it does prompt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OH="$ROOT/.oh/cli/dist/oh.js"

if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node is not on PATH — the oh CLI cannot be exercised" >&2
  exit 2
fi

if [[ ! -f "$OH" ]]; then
  echo "SKIPPED: .oh/cli/dist/oh.js is not built — run \`cd .oh/cli && npm install && npm run build\`" >&2
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SANDBOX_NAME=oh-destroy-guard
MARKER="DOCKER-ENGINE-RAN"

OH_HOME="$WORK/home"
ENTRY="$OH_HOME/sandboxes/$SANDBOX_NAME"
mkdir -p "$ENTRY" "$WORK/bin"
printf '{ "version": 1, "name": "%s" }\n' "$SANDBOX_NAME" >"$ENTRY/oh.json"
cat >"$WORK/bin/docker" <<EOF
#!/usr/bin/env bash
echo "$MARKER \$*"
EOF
chmod +x "$WORK/bin/docker"

VOLUME="$(awk '/^volumes:/ { f = 1; next } f && /^  [A-Za-z]/ { sub(/:.*$/, ""); gsub(/ /, ""); print; exit }' \
  "$ROOT/.devcontainer/docker-compose.image-only.yml")"
[[ -n "$VOLUME" ]] || VOLUME=workspace

oh_destroy() {
  env -u SANDBOX_SSH PATH="$WORK/bin:$PATH" OH_HOME="$OH_HOME" SANDBOX_NAME="$SANDBOX_NAME" \
    node "$OH" destroy "$SANDBOX_NAME" "$@"
}

fails=()

code=0
out="$(oh_destroy </dev/null 2>&1)" || code=$?
[[ $code -eq 1 ]] || fails+=("non-interactive \`oh destroy\` exited $code, not 1 — it must refuse without --yes")
grep -qF -- '--yes' <<<"$out" \
  || fails+=("the non-interactive refusal does not name --yes, so there is no way forward: $out")
grep -qF "$MARKER" <<<"$out" \
  && fails+=("non-interactive \`oh destroy\` reached the container engine — the --yes gate is gone")

if command -v script >/dev/null 2>&1; then
  pty() {
    printf '%s' "$1" | env -u SANDBOX_SSH PATH="$WORK/bin:$PATH" OH_HOME="$OH_HOME" \
      SANDBOX_NAME="$SANDBOX_NAME" \
      script -qec "node '$OH' destroy '$SANDBOX_NAME'" /dev/null 2>&1 || true
  }

  pty_out="$(pty 'not-the-name
')"
  grep -qF "$MARKER" <<<"$pty_out" \
    && fails+=("a wrong answer still reached the container engine — the confirmation is not enforced")
  grep -qF "$SANDBOX_NAME" <<<"$pty_out" \
    || fails+=("the prompt does not name the sandbox, so there is nothing specific to type")
  grep -qF "${SANDBOX_NAME}_${VOLUME}" <<<"$pty_out" \
    || fails+=("the prompt does not name the volumes it will delete (expected ${SANDBOX_NAME}_${VOLUME})")

  blank_out="$(pty '
')"
  grep -qF "$MARKER" <<<"$blank_out" \
    && fails+=("a bare Enter still reached the container engine — the confirmation defaults to yes")

  if ((${#fails[@]})); then
    printf 'REGRESSION: %s\n' "${fails[@]}" >&2
    exit 1
  fi
  echo "PASS: \`oh destroy\` refuses without a TTY and without --yes, and aborts on a wrong or blank answer" >&2
  exit 0
fi

if ((${#fails[@]})); then
  printf 'REGRESSION: %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "SKIPPED: \`script\` is unavailable — the --yes gate passed, the interactive prompt was not exercised" >&2
exit 2
