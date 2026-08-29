#!/usr/bin/env bash
# tier: A
# desc: the oh.json/.env split loses no variable — every compose-interpolated var is either a documented oh.json field or an allow-listed secret, and neither surface holds the other's keys
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

SECRETS_EXAMPLE="$ROOT/.env.example"
SECRETS_TEMPLATE="$ROOT/.oh/templates/.env.example"
CONFIG_DOC="$ROOT/docs/configuration.md"
SECRETS_SRC="$ROOT/.oh/cli/src/lib/secrets.ts"
RENDER_SRC="$ROOT/.oh/cli/src/lib/config-render.ts"

for f in "$SECRETS_EXAMPLE" "$SECRETS_TEMPLATE" "$CONFIG_DOC" "$SECRETS_SRC" "$RENDER_SRC"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: ${f#"$ROOT"/} absent on this branch — the oh.json config split has not landed here" >&2
    exit 2
  fi
done

RETIRED=(WORKTREES_DIR PROJECTS_DIR CRONS_DIR)

env_keys() {
  grep -oE '^[[:space:]]*#?[[:space:]]*[A-Z_][A-Z0-9_]*=' "$1" | tr -d '# \t=' | sort -u
}

allowlisted_secrets() {
  sed -n '/^export const SECRET_KEYS = \[/,/^\] as const;/p' "$SECRETS_SRC" \
    | grep -oE '"[A-Z_][A-Z0-9_]*"' | tr -d '"' | sort -u
}

documented_fields() {
  sed 's/\\|/§/g' "$CONFIG_DOC" \
    | awk -F'|' 'NF>=7 && $2 ~ /^ `[a-zA-Z]/ { print $5 }' \
    | grep -oE '[A-Z_][A-Z0-9_]*' | sort -u
}

rendered_vars() {
  grep -oE 'put\("[A-Z_][A-Z0-9_]*"' "$RENDER_SRC" | sed 's/put("//;s/"//' | sort -u
}

compose_vars() {
  grep -ohE '\$\{[A-Z_][A-Z0-9_]*' "$ROOT"/.devcontainer/docker-compose*.yml 2>/dev/null \
    | sed 's/${//' | sort -u
}

secrets="$(allowlisted_secrets)"
fields="$(documented_fields)"
example_keys="$(env_keys "$SECRETS_EXAMPLE")"

if [[ -z "$secrets" || -z "$fields" ]]; then
  echo "SKIPPED: could not extract the secret allow-list or the oh.json field table — file shapes changed" >&2
  exit 2
fi

fails=()
join_list() { printf '%s' "$(paste -sd, -)"; }

for old in "$ROOT/.devcontainer/.example.env" "$ROOT/.oh/templates/.devcontainer/.example.env"; do
  [[ -f "$old" ]] && fails+=("retired configuration surface still present: ${old#"$ROOT"/}")
done

only_root="$(comm -23 <(echo "$example_keys") <(env_keys "$SECRETS_TEMPLATE") | join_list)"
only_tmpl="$(comm -13 <(echo "$example_keys") <(env_keys "$SECRETS_TEMPLATE") | join_list)"
[[ -z "$only_root" ]] || fails+=("in .env.example but not in .oh/templates/.env.example: $only_root")
[[ -z "$only_tmpl" ]] || fails+=("in .oh/templates/.env.example but not in .env.example: $only_tmpl")

missing_secret="$(comm -23 <(echo "$secrets") <(echo "$example_keys") | join_list)"
extra_secret="$(comm -13 <(echo "$secrets") <(echo "$example_keys") | join_list)"
[[ -z "$missing_secret" ]] || fails+=("allow-listed in secrets.ts but undocumented in .env.example: $missing_secret")
[[ -z "$extra_secret" ]] || fails+=("documented in .env.example but not an allow-listed secret — a non-secret must live in oh.json: $extra_secret")

leaked="$(comm -12 <(echo "$secrets") <(echo "$fields") | join_list)"
[[ -z "$leaked" ]] || fails+=("secret documented as a tracked oh.json field in docs/configuration.md: $leaked")

undocumented=()
while read -r var; do
  [[ -n "$var" ]] || continue
  grep -qxF "$var" <<<"$fields" && continue
  grep -qxF "$var" <<<"$secrets" && continue
  undocumented+=("$var")
done < <(compose_vars)
(( ${#undocumented[@]} == 0 )) \
  || fails+=("interpolated by a docker-compose file but neither a documented oh.json field nor an allow-listed secret: ${undocumented[*]}")

unrendered=()
while read -r var; do
  [[ -n "$var" ]] || continue
  grep -qxF "$var" <<<"$fields" || unrendered+=("$var")
done < <(rendered_vars)
(( ${#unrendered[@]} == 0 )) \
  || fails+=("rendered by config-render.ts but undocumented in docs/configuration.md: ${unrendered[*]}")

for var in "${RETIRED[@]}"; do
  grep -qxF "$var" <<<"$fields" && fails+=("retired variable $var reintroduced as an oh.json field")
  grep -qxF "$var" <<<"$example_keys" && fails+=("retired variable $var reintroduced in .env.example")
done

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: oh.json/.env config split broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: config schema parity — .env.example matches the secrets.ts allow-list and its template, docs/configuration.md documents every rendered oh.json field, and every compose-interpolated var lands in exactly one surface" >&2
exit 0
