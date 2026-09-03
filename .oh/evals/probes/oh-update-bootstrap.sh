#!/usr/bin/env bash
# tier: A
# source: issue #950 US-003 / D5 — the scaffolding init verb is retired; `oh update` is the bootstrap that equips a checkout
# desc: `oh update --from <checkout>` equips an empty directory with .oh/ and crons/ only — it prompts zero
#       times, writes no oh.json, .env, .env.example, AGENTS.md, .gitignore, .devcontainer/ or provider
#       directory, and a second run reports the payload already up to date
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI_DIR="$ROOT/.oh/cli"

if [[ ! -d "$CLI_DIR" ]]; then
  echo "SKIPPED: oh CLI not present (.oh/cli absent)" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH — cannot exercise oh update" >&2
  exit 2
fi
if [[ ! -f "$CLI_DIR/dist/oh.js" ]]; then
  if [[ -d "$CLI_DIR/node_modules" ]] && command -v npm >/dev/null 2>&1; then
    npm --prefix "$CLI_DIR" run build >/dev/null 2>&1 || true
  fi
fi
if [[ ! -f "$CLI_DIR/dist/oh.js" ]]; then
  echo "SKIPPED: $CLI_DIR/dist/oh.js not built — run 'npm --prefix .oh/cli run build'" >&2
  exit 2
fi

fails=()

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

run_update() {
  (cd "$work" && env -u SANDBOX_NAME -u SANDBOX_SSH node "$CLI_DIR/dist/oh.js" update --from "$ROOT" </dev/null 2>&1)
}

set +e
first="$(run_update)"
rc=$?
set -e

if ((rc != 0)); then
  fails+=("oh update --from <checkout> exited $rc in an empty directory (it must bootstrap it): ${first##*$'\n'}")
else
  if grep -qiE 'Configure your harness|\[y/N\]|\[Y/n\]|blank to skip|press Enter to accept' <<<"$first"; then
    fails+=("oh update emitted a wizard prompt — the bootstrap is never interactive")
  fi

  [[ -d "$work/.oh" ]] || fails+=("oh update did not create .oh/ — the control plane is the whole payload")
  [[ -d "$work/crons" ]] || fails+=("oh update did not create crons/ — the payload ships the schedule directory")
  [[ -f "$work/.oh/manifest.json" ]] || fails+=("oh update wrote no .oh/manifest.json — the payload marker is missing")

  for unwanted in oh.json .env .env.example AGENTS.md CLAUDE.md .gitignore .devcontainer .claude .pi .codex .hermes; do
    [[ -e "$work/$unwanted" ]] \
      && fails+=("oh update wrote $unwanted — the bootstrap ships only .oh/ and crons/; the operator owns every other root file")
  done

  set +e
  second="$(run_update)"
  rc2=$?
  set -e
  if ((rc2 != 0)); then
    fails+=("the second oh update exited $rc2 — re-running the bootstrap must be a no-op: ${second##*$'\n'}")
  elif ! grep -qF 'already up to date' <<<"$second"; then
    fails+=("the second oh update did not report 'already up to date' (said: ${second##*$'\n'})")
  fi
fi

if ((${#fails[@]} > 0)); then
  echo "REGRESSION: oh update bootstrap contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: oh update bootstrap — an empty directory gains .oh/ and crons/ with zero prompts, no oh.json/.env/AGENTS.md/.gitignore/.devcontainer/provider scaffold, and the second run reports already up to date" >&2
exit 0
