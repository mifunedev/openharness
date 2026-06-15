#!/usr/bin/env bash
# tier: A
# source: context/rules/loop.md § 4 (executable-loop Handoff convention)
# desc: every skill ## Handoff emits a STATUS token known to loop.md and routes only to real loop-§2 nodes
#
# Guards the executable-loop wiring against drift: a skill whose ## Handoff route
# points at a node that does not exist in loop.md § 2, or that emits a STATUS
# token loop.md has never heard of, or that has a ## Handoff with no STATUS
# emission line at all, flips this probe REGRESSION. This is the § 4 "declared
# routes MUST match § 2 exactly" guard. STATIC-coupled to the § 2 node table and
# the per-skill route-table format; a deliberate rename of either MUST update both.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOOP="$ROOT/context/rules/loop.md"

# Not applicable when the manifest is absent (cold runner / pre-merge main).
[ -f "$LOOP" ] || { echo "loop.md manifest absent — Handoff convention not in play" >&2; exit 2; }

# Valid node names = first-column bold cells of the § 2 decision-tree table,
# scoped between the "## 2." and "## 3." headings (so § 1/§ 5/§ 7 tables don't leak in).
nodes="$(awk '/^## 2\./{f=1} /^## 3\./{f=0} f' "$LOOP" \
  | grep -oE '^\| \*\*[^*]+\*\*' | sed -E 's/^\| \*\*//; s/\*\*$//; s/\\//g')"
[ -n "$nodes" ] || { echo "could not extract node set from loop.md § 2 table" >&2; exit 1; }
is_node() { printf '%s\n' "$nodes" | grep -qxF "$1"; }

fails=""
wired=0
for sk in "$ROOT"/.claude/skills/*/SKILL.md; do
  grep -q '^## Handoff' "$sk" || continue
  name="$(basename "$(dirname "$sk")")"
  wired=$((wired + 1))
  # The ## Handoff section runs from its heading to EOF (convention: it is last).
  sect="$(awk '/^## Handoff/{f=1} f{print}' "$sk")"

  # (a) must emit at least one `STATUS: <TOKEN>` line.
  tokens="$(printf '%s\n' "$sect" | grep -oE 'STATUS: [A-Z][A-Z-]+' | sed 's/STATUS: //' | sort -u)"
  if [ -z "$tokens" ]; then
    fails="${fails}; ${name}: ## Handoff has no 'STATUS: <TOKEN>' emission"
    continue
  fi

  # (b) every emitted token must appear in loop.md (known to the manifest).
  while IFS= read -r tok; do
    [ -n "$tok" ] || continue
    grep -qF "$tok" "$LOOP" || fails="${fails}; ${name}: token '$tok' absent from loop.md"
  done <<EOF
$tokens
EOF

  # (c) every route-table Next-node ( | \`TOKEN\` | \`node\` | ) must be a real node.
  routes="$(printf '%s\n' "$sect" | grep -E '^\| `[A-Z][A-Z-]*` \| `[a-z][a-z|-]*` \|' || true)"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    nextn="$(printf '%s\n' "$row" | sed -E 's/^\| `[A-Z][A-Z-]*` \| `([a-z][a-z|-]*)` \|.*/\1/')"
    [ -n "$nextn" ] || continue
    is_node "$nextn" || fails="${fails}; ${name}: route target '$nextn' is not a loop-§2 node"
  done <<EOF
$routes
EOF
done

[ "$wired" -gt 0 ] || { echo "no skill carries a ## Handoff section yet" >&2; exit 2; }

if [ -n "$fails" ]; then
  echo "loop Handoff drift (${wired} wired)${fails}" | cut -c1-400 >&2
  exit 1
fi
exit 0
