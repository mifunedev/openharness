#!/usr/bin/env bash
# tier: A
# source: issue #879 — `oh` becomes the only front door, so `make destroy` must
#         survive as `oh destroy` without becoming one typo away from wiping
#         the provider-auth volumes
# desc: `oh destroy` never reaches docker-compose.sh without confirmation — it refuses
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
MARKER="COMPOSE-SCRIPT-RAN"

mkdir -p "$WORK/.oh/scripts" "$WORK/.devcontainer"
cat >"$WORK/.oh/scripts/docker-compose.sh" <<EOF
#!/usr/bin/env bash
echo "$MARKER \$*"
EOF
chmod +x "$WORK/.oh/scripts/docker-compose.sh"
cat >"$WORK/.devcontainer/docker-compose.yml" <<'EOF'
name: ${SANDBOX_NAME:-openharness}

services:
  sandbox:
    volumes:
      - claude-auth:/home/sandbox/.claude

volumes:
  claude-auth:
  ssh-config:
EOF

fails=()

code=0
out="$(cd "$WORK" && SANDBOX_NAME="$SANDBOX_NAME" node "$OH" destroy </dev/null 2>&1)" || code=$?
[[ $code -eq 1 ]] || fails+=("non-interactive \`oh destroy\` exited $code, not 1 — it must refuse without --yes")
grep -qF -- '--yes' <<<"$out" \
  || fails+=("the non-interactive refusal does not name --yes, so there is no way forward: $out")
grep -qF "$MARKER" <<<"$out" \
  && fails+=("non-interactive \`oh destroy\` reached docker-compose.sh — the --yes gate is gone")

if command -v script >/dev/null 2>&1; then
  pty_out="$(printf 'not-the-name\n' \
    | (cd "$WORK" && SANDBOX_NAME="$SANDBOX_NAME" script -qec "node '$OH' destroy" /dev/null 2>&1) || true)"

  grep -qF "$MARKER" <<<"$pty_out" \
    && fails+=("a wrong answer still reached docker-compose.sh — the confirmation is not enforced")
  grep -qF "$SANDBOX_NAME" <<<"$pty_out" \
    || fails+=("the prompt does not name the sandbox, so there is nothing specific to type")
  grep -qF 'claude-auth' <<<"$pty_out" \
    || fails+=("the prompt does not name the volumes it will delete")

  blank_out="$(printf '\n' \
    | (cd "$WORK" && SANDBOX_NAME="$SANDBOX_NAME" script -qec "node '$OH' destroy" /dev/null 2>&1) || true)"
  grep -qF "$MARKER" <<<"$blank_out" \
    && fails+=("a bare Enter still reached docker-compose.sh — the confirmation defaults to yes")

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
