#!/usr/bin/env bash
# tier: A
# desc: the two authored config surfaces stay honest — tracked oh.json holds no allow-listed secret, the root dotenv is gitignored/0600 and holds nothing but allow-listed secrets, .devcontainer/.env is a symlink to ../.env, no live file still depends on the retired .devcontainer/.example.env, and no CLI source relocates config into $HOME
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

SECRETS_SRC="$ROOT/.oh/cli/src/lib/secrets.ts"
CONFIG_DOC="$ROOT/docs/configuration.md"
CLI_SRC="$ROOT/.oh/cli/src"

if [[ ! -f "$SECRETS_SRC" || ! -f "$CONFIG_DOC" ]]; then
  echo "SKIPPED: the oh.json/.env config split has not landed here (secrets.ts and/or docs/configuration.md absent)" >&2
  exit 2
fi
if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "SKIPPED: not a git checkout — tracked/ignored state is unreadable" >&2
  exit 2
fi

secret_keys() {
  sed -n '/^export const SECRET_KEYS = \[/,/^\] as const;/p' "$SECRETS_SRC" \
    | grep -oE '"[A-Z_][A-Z0-9_]*"' | tr -d '"' | sort -u
}

SECRETS="$(secret_keys)"
if [[ -z "$SECRETS" ]]; then
  echo "SKIPPED: could not extract SECRET_KEYS from .oh/cli/src/lib/secrets.ts — file shape changed" >&2
  exit 2
fi

fails=()

OH_JSON="$ROOT/oh.json"
if ! git -C "$ROOT" ls-files --error-unmatch oh.json >/dev/null 2>&1; then
  fails+=("oh.json is not tracked at the repository root — it is the authored home for every non-secret setting (docs/configuration.md)")
fi
if [[ -f "$OH_JSON" ]]; then
  if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$OH_JSON" >/dev/null 2>&1; then
    fails+=("oh.json is not valid JSON")
  fi
  while read -r key; do
    [[ -n "$key" ]] || continue
    grep -Fq "$key" "$OH_JSON" \
      && fails+=("allow-listed secret $key appears in the TRACKED oh.json — secrets belong in the gitignored root dotenv")
  done <<<"$SECRETS"
fi

DOTENV="$ROOT/.env"
if ! git -C "$ROOT" check-ignore -q .env 2>/dev/null; then
  fails+=("the root dotenv is not gitignored — a secrets file must never be committable")
fi
if git -C "$ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
  fails+=("the root dotenv is TRACKED — it holds secrets and must stay out of git")
fi
if [[ -f "$DOTENV" ]]; then
  mode="$(stat -c '%a' "$DOTENV" 2>/dev/null || stat -f '%Lp' "$DOTENV" 2>/dev/null || echo '?')"
  [[ "$mode" == "600" ]] \
    || fails+=("the root dotenv is mode $mode — a secrets file must be 0600")
  while read -r key; do
    [[ -n "$key" ]] || continue
    grep -qxF "$key" <<<"$SECRETS" \
      || fails+=("the root dotenv holds $key, which is not an allow-listed secret — non-secret settings live in oh.json")
  done < <(grep -oE '^[[:space:]]*[A-Z_][A-Z0-9_]*=' "$DOTENV" | tr -d ' \t=' | sort -u)
fi

DEVC_ENV="$ROOT/.devcontainer/.env"
if [[ -e "$DEVC_ENV" || -L "$DEVC_ENV" ]]; then
  if [[ ! -L "$DEVC_ENV" ]]; then
    fails+=(".devcontainer/.env is a real file — it must be a symlink to ../.env so VS Code 'Reopen in Container' reads the one secrets file")
  else
    target="$(readlink "$DEVC_ENV")"
    [[ "$target" == "../.env" ]] \
      || fails+=(".devcontainer/.env points at '$target' — it must be a symlink to ../.env")
  fi
fi

stale=()
while read -r f; do
  [[ -n "$f" ]] || continue
  case "$f" in
    CHANGELOG.md|docs/rfcs/*|.oh/evals/probes/*) continue ;;
  esac
  stale+=("$f")
done < <(git -C "$ROOT" grep -lF 'devcontainer/.example.env' -- . 2>/dev/null || true)
(( ${#stale[@]} == 0 )) \
  || fails+=("tracked files still reference the retired .devcontainer/.example.env: ${stale[*]}")

home_config=()
while read -r hit; do
  [[ -n "$hit" ]] || continue
  home_config+=("$hit")
done < <(grep -rlE 'XDG_CONFIG_HOME|OH_CONFIG_DIR|OH_CLOUD_CONFIG|homedir\(\)' "$CLI_SRC" 2>/dev/null \
  | sed "s#^$ROOT/##" | sort || true)
(( ${#home_config[@]} == 0 )) \
  || fails+=("CLI sources still resolve config out of \$HOME (XDG_CONFIG_HOME/OH_CONFIG_DIR/OH_CLOUD_CONFIG/homedir()) — every authored setting lives at the repository root: ${home_config[*]}")

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: the oh.json/root-dotenv config surfaces are not honest:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: config surfaces — tracked oh.json is secret-free, the root dotenv is gitignored/0600 and allow-listed-only, .devcontainer/.env symlinks to ../.env, nothing live references .devcontainer/.example.env, and no CLI source relocates config into \$HOME" >&2
exit 0
