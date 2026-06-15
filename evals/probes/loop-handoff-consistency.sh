#!/usr/bin/env bash
# tier: A
# source: context/rules/loop.md § 4 (executable-loop Handoff convention)
# desc: every skill ## Handoff emits a STATUS token whose exact route matches loop.md §2 and targets a real node
#
# Guards the executable-loop wiring against drift: a skill whose ## Handoff route
# points at a node that does not exist in loop.md § 2, emits a STATUS token
# loop.md has never heard of, or disagrees with the manifest's exact
# (STATUS -> next) route flips this probe REGRESSION. STATIC-coupled to the § 2
# node table and the per-skill route-table format; a deliberate rename of
# either MUST update both.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOOP="$ROOT/context/rules/loop.md"

# Not applicable when the manifest is absent (cold runner / pre-merge main).
[ -f "$LOOP" ] || { echo "loop.md manifest absent — Handoff convention not in play" >&2; exit 2; }

section2="$(awk '/^## 2\./{f=1} /^## 3\./{f=0} f' "$LOOP")"

# Valid node names = first-column bold cells of the § 2 decision-tree table,
# scoped between the "## 2." and "## 3." headings (so § 1/§ 5/§ 7 tables don't leak in).
nodes="$(printf '%s\n' "$section2" \
  | grep -oE '^\| \*\*[^*]+\*\*' | sed -E 's/^\| \*\*//; s/\*\*$//; s/\\//g')"
[ -n "$nodes" ] || { echo "could not extract node set from loop.md § 2 table" >&2; exit 1; }
is_node() { printf '%s\n' "$nodes" | grep -qxF "$1"; }

# Manifest routes = token + target pairs declared in § 2. The target must be a
# real node; prose such as "(after revert)" is ignored after the first word.
manifest_routes="$(printf '%s\n' "$section2" | grep -E '^\| \*\*' | while IFS= read -r row; do
  printf '%s\n' "$row" \
    | grep -oE '`[A-Z][A-Z-]*`[[:space:]]*→[[:space:]]*`?[a-z][a-z-]*`?' \
    | while IFS= read -r route; do
        tok="$(printf '%s\n' "$route" | sed -E 's/^`([A-Z][A-Z-]*)`.*/\1/')"
        target="$(printf '%s\n' "$route" | sed -E 's/^`[A-Z][A-Z-]*`[[:space:]]*→[[:space:]]*`?([a-z][a-z-]*)`?.*/\1/')"
        printf '%s %s\n' "$tok" "$target"
      done
done | sort -u)"
[ -n "$manifest_routes" ] || { echo "could not extract STATUS routes from loop.md § 2 table" >&2; exit 1; }
manifest_has_route() { printf '%s\n' "$manifest_routes" | grep -qxF "$1 $2"; }
manifest_has_token() { printf '%s\n' "$manifest_routes" | awk '{print $1}' | grep -qxF "$1"; }

fails=""
while IFS= read -r route; do
  [ -n "$route" ] || continue
  target="${route#* }"
  is_node "$target" || fails="${fails}; loop.md §2: route target '$target' is not a loop node"
done <<EOF
$manifest_routes
EOF

wired=0
for sk in "$ROOT"/.claude/skills/*/SKILL.md; do
  grep -q '^## Handoff' "$sk" || continue
  name="$(basename "$(dirname "$sk")")"
  wired=$((wired + 1))
  # The ## Handoff section runs from its heading to EOF (convention: it is last).
  sect="$(awk '/^## Handoff/{f=1} f{print}' "$sk")"

  # (a) must declare at least one route-table token (the handoff convention's
  # executable representation of possible final STATUS emissions). Ignore
  # prose mentions such as ralph's historical `STATUS: COMPLETE` sentinel.
  routes="$(printf '%s\n' "$sect" | grep -E '^\| `[A-Z][A-Z-]*` \| `[a-z][a-z-]*` \|' || true)"
  if [ -z "$routes" ]; then
    fails="${fails}; ${name}: ## Handoff has no executable STATUS route rows"
    continue
  fi

  # (b) every route-table token must appear in loop.md §2.
  tokens="$(printf '%s\n' "$routes" | sed -E 's/^\| `([A-Z][A-Z-]*)` \|.*/\1/' | sort -u)"
  while IFS= read -r tok; do
    [ -n "$tok" ] || continue
    manifest_has_token "$tok" || fails="${fails}; ${name}: token '$tok' absent from loop.md §2 routes"
  done <<EOF
$tokens
EOF

  # (c) every route-table Next-node ( | `TOKEN` | `node` | ) must be a real node
  # and exactly match the manifest's token -> target pair.
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    tok="$(printf '%s\n' "$row" | sed -E 's/^\| `([A-Z][A-Z-]*)` \| `[a-z][a-z-]*` \|.*/\1/')"
    nextn="$(printf '%s\n' "$row" | sed -E 's/^\| `[A-Z][A-Z-]*` \| `([a-z][a-z-]*)` \|.*/\1/')"
    [ -n "$nextn" ] || continue
    is_node "$nextn" || fails="${fails}; ${name}: route target '$nextn' is not a loop-§2 node"
    manifest_has_route "$tok" "$nextn" || fails="${fails}; ${name}: route '$tok -> $nextn' does not match loop.md §2"
  done <<EOF
$routes
EOF
done

[ "$wired" -gt 0 ] || { echo "no skill carries a ## Handoff section yet" >&2; exit 2; }

if [ -n "$fails" ]; then
  echo "loop Handoff drift (${wired} wired)${fails}" | cut -c1-600 >&2
  exit 1
fi

echo "PASS: loop Handoff routes match loop.md §2 exactly across ${wired} wired skill(s)" >&2
exit 0
