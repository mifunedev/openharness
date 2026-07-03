#!/usr/bin/env bash
# tier: A
# source: issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13
# desc: the autopilot §1 dirty-tree guard and restore are scoped to the OWNED
#       surface, not the whole tree, using the ARRAY form — the §1 MAIN clean check
#       uses `git diff --quiet -- "${OWNED_PATHS[@]}"` (the only tree-wide
#       `git diff --quiet` left is the §1 self-heal), a dirty owned surface emits
#       BLOCKED-OWNED-WIP, and the restore is the scoped
#       `git checkout development -- "${OWNED_PATHS[@]}"` two-step with a
#       `rev-parse --abbrev-ref HEAD` HEAD assertion. The array form word-splits to
#       10 pathspecs under BOTH bash and zsh; the broken bare `$OWNED_PATHS` form
#       (which collapses to one pathspec under zsh — no SH_WORD_SPLIT) must NOT
#       return. So a stray foreign edit neither blocks a run nor is destroyed by the
#       restore.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: autopilot skill absent: $SKILL" >&2
  exit 2
fi

# --- reintroduction guard: the broken bare (zsh-collapsing) form must NOT return -----
# zsh has no SH_WORD_SPLIT by default, so a bare `-- $OWNED_PATHS` collapses to ONE
# bogus pathspec and the guard is vacuously satisfied (issue #81). Both the plain and
# the `--cached` variant are equally broken — fail on EITHER.
# shellcheck disable=SC2016  # the literal $OWNED_PATHS must NOT expand — it is matched verbatim
if grep -Fq 'git diff --quiet -- $OWNED_PATHS' "$SKILL" \
   || grep -Fq 'git diff --cached --quiet -- $OWNED_PATHS' "$SKILL"; then
  echo "REGRESSION: broken bare '-- \$OWNED_PATHS' form present — collapses to ONE pathspec under zsh (no SH_WORD_SPLIT); use the array form '\"\${OWNED_PATHS[@]}\"'" >&2
  exit 1
fi

# --- (a) the §1 MAIN clean check is path-scoped to the owned surface (array form) ----
# Literal match REQUIRES `grep -F`: the `[`/`]`/`@` in `${OWNED_PATHS[@]}` are BRE
# metacharacters and a non-`-F` grep would silently mis-match. On an UNMODIFIED skill
# the §1 check is still tree-wide, so this scoped array form is absent → exit 1.
# shellcheck disable=SC2016  # the literal ${OWNED_PATHS[@]} must NOT expand — it is matched verbatim
if ! grep -Fq 'git diff --quiet -- "${OWNED_PATHS[@]}"' "$SKILL"; then
  echo "REGRESSION: §1 MAIN clean check is not owned-scoped (missing 'git diff --quiet -- \"\${OWNED_PATHS[@]}\"')" >&2
  exit 1
fi

# No UNSCOPED tree-wide `git diff --quiet` survives outside the §1 self-heal. Strategy:
# list every `git diff --quiet` line, drop the scoped `-- "${OWNED_PATHS[@]}"` lines,
# then drop the self-heal line (distinguished by its `BRANCH != development` / `rev-parse`
# context). Anything left is an unscoped owned-surface leak.
# shellcheck disable=SC2016  # the literal ${OWNED_PATHS[@]} must NOT expand — it is matched verbatim
unscoped="$(grep -n 'git diff --quiet' "$SKILL" \
  | grep -vF -- '-- "${OWNED_PATHS[@]}"' \
  | grep -vE 'BRANCH" != "development"|rev-parse --abbrev-ref HEAD' \
  || true)"
if [[ -n "$unscoped" ]]; then
  echo "REGRESSION: unscoped tree-wide 'git diff --quiet' outside the §1 self-heal:" >&2
  echo "$unscoped" >&2
  exit 1
fi

# --- (b) a dirty owned surface emits the distinct BLOCKED-OWNED-WIP liveness token ---
if ! grep -q 'BLOCKED-OWNED-WIP' "$SKILL"; then
  echo "REGRESSION: BLOCKED-OWNED-WIP token missing from autopilot SKILL.md" >&2
  exit 1
fi

# --- (c) the restore is the scoped two-step with a HEAD-on-development assertion -----
# shellcheck disable=SC2016  # the literal ${OWNED_PATHS[@]} must NOT expand — it is matched verbatim
if ! grep -Fq 'git checkout development -- "${OWNED_PATHS[@]}"' "$SKILL"; then
  echo "REGRESSION: scoped restore ('git checkout development -- \"\${OWNED_PATHS[@]}\"') missing from autopilot SKILL.md" >&2
  exit 1
fi
if ! grep -q 'rev-parse --abbrev-ref HEAD' "$SKILL"; then
  echo "REGRESSION: HEAD assertion ('rev-parse --abbrev-ref HEAD') missing from autopilot SKILL.md" >&2
  exit 1
fi

# --- zsh-fidelity: the declared array word-splits to >= 2 pathspecs under zsh --------
# Closes the bash-only fidelity gap (issue #81). The bug only manifests under zsh, so
# exercise the literal declaration under a real zsh. Guard on `command -v zsh` first.
if ! command -v zsh >/dev/null 2>&1; then
  echo "SKIPPED: zsh not available — cannot verify zsh word-split fidelity of OWNED_PATHS" >&2
  exit 2
fi
# Defensive PCRE guard: the extraction below uses `grep -oP` (PCRE \K). GNU grep on
# ubuntu-latest is compiled with PCRE, but a grep without it errors on `-P`; the
# `|| true` would then leave $decl empty and falsely REGRESS. Detect real PCRE
# support (match a known string) and SKIP if absent so a missing tool can never
# masquerade as a regression. NB: the `grep -P . /dev/null` idiom is NOT used — an
# empty file yields exit 1 even when -P IS supported, which would always-skip.
if ! printf 'x\n' | grep -qP 'x' 2>/dev/null; then
  echo "SKIPPED: grep -P (PCRE) unavailable — cannot extract OWNED_PATHS for the zsh word-split check" >&2
  exit 2
fi
# Anchored extraction: only the real declaration starts at column 0 (comment lines that
# mention OWNED_PATHS begin with '#'); pull the tokens between the array parens.
decl="$(grep -oP '^OWNED_PATHS=\(\K[^)]+' "$SKILL" || true)"
if [[ -z "$decl" ]]; then
  echo "REGRESSION: could not extract the 'OWNED_PATHS=(...)' array declaration from SKILL.md" >&2
  exit 1
fi
# Run the declared form under zsh; capture the count EXPLICITLY (do NOT rely on set -e
# propagation through the command substitution).
zcount="$(zsh -c "OWNED_PATHS=($decl); set -- \"\${OWNED_PATHS[@]}\"; echo \$#" 2>/dev/null || echo 0)"
if [[ ! "$zcount" =~ ^[0-9]+$ ]] || (( zcount < 2 )); then
  echo "REGRESSION: under zsh the OWNED_PATHS array expands to '$zcount' pathspec(s) (expected >= 2) — zsh word-split fidelity broken" >&2
  exit 1
fi

echo "PASS: autopilot §1 guard + restore scoped to \"\${OWNED_PATHS[@]}\" (array form, $zcount-way split under zsh); BLOCKED-OWNED-WIP emitted; HEAD asserted; no bare \$OWNED_PATHS form; no unscoped tree-wide diff outside the self-heal" >&2
exit 0
