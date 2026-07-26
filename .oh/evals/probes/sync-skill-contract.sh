#!/usr/bin/env bash
# tier: A
# source: issue #331 — /sync dispatcher skill (bidirectional origin↔upstream sync)
# desc: the /sync dispatcher (.oh/skills/sync/SKILL.md) routes publish|catchup|status
#       to references/{publish,catchup}.md; topology lives in references/topology.md;
#       the dispatcher composes /audit drift, /eval, and /audit pr rather than
#       reimplementing any of their logic; neither SKILL.md nor any reference doc may
#       contain git rev-list divergence logic (`/audit drift` owns that); catchup must
#       unconditionally prohibit 'git merge upstream/development'; both publish and
#       catchup must invoke the eval oracle (eval/run.sh).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILLS="$ROOT/.oh/skills"
SYNC="$SKILLS/sync"

# Not applicable when the /sync dispatcher is absent (cold runner / pre-merge main).
if [ ! -f "$SYNC/SKILL.md" ]; then
  echo "SKIPPED: /sync dispatcher absent (no .oh/skills/sync/SKILL.md)" >&2
  exit 2
fi

missing=()

# (1) all four required files must exist.
for f in \
  "$SYNC/SKILL.md" \
  "$SYNC/references/publish.md" \
  "$SYNC/references/catchup.md" \
  "$SYNC/references/topology.md"
do
  [ -f "$f" ] || missing+=("${f#"$ROOT"/}: required file absent")
done

# (2) all three subcommand routes must appear in SKILL.md.
for sub in publish catchup status; do
  grep -qF "$sub" "$SYNC/SKILL.md" || \
    missing+=("SKILL.md: '$sub' subcommand route not present")
done

# (3) composition declarations must be present in SKILL.md.
grep -qiF 'composes /audit drift' "$SYNC/SKILL.md" || \
  missing+=("SKILL.md: 'composes /audit drift' declaration absent (dispatcher must name the composition)")

grep -qiF 'composes /eval' "$SYNC/SKILL.md" || \
  missing+=("SKILL.md: 'composes /eval' declaration absent")

grep -qiF 'composes /audit pr' "$SYNC/SKILL.md" || \
  missing+=("SKILL.md: 'composes /audit pr' declaration absent")
grep -qF '.draftStatus == "promotable"' "$SYNC/SKILL.md" || \
  missing+=("SKILL.md: top-level draft gate must consume draftStatus promotable")
if grep -qiE 'audit pr.*ready bucket|confirm it is in the ready bucket' "$SYNC/SKILL.md"; then
  missing+=("SKILL.md: top-level focused draft semantics incorrectly use the non-draft ready bucket")
fi

# (4) drift detection must NOT be reimplemented in SKILL.md or any reference doc.
#     /audit drift uses 'git rev-list --left-right --count' as its canonical
#     divergence command; its presence anywhere in the sync skill indicates
#     reimplementation rather than composition.
if grep -qF 'git rev-list --left-right --count' "$SYNC/SKILL.md"; then
  missing+=("SKILL.md: contains 'git rev-list --left-right --count' — drift detection reimplemented (must compose /audit drift instead)")
fi
for ref_f in "$SYNC/references/"*.md; do
  [ -f "$ref_f" ] || continue
  if grep -qF 'git rev-list --left-right --count' "$ref_f"; then
    missing+=("${ref_f#"$ROOT"/}: contains 'git rev-list --left-right --count' — drift detection reimplemented in reference doc (must compose /audit drift)")
  fi
done

# (5) topology.md must document both remote names (origin and upstream).
if [ -f "$SYNC/references/topology.md" ]; then
  grep -qF 'origin' "$SYNC/references/topology.md" || \
    missing+=("references/topology.md: 'origin' remote not documented")
  grep -qF 'upstream' "$SYNC/references/topology.md" || \
    missing+=("references/topology.md: 'upstream' remote not documented")
  grep -qiE 'operator fork|origin-owner|private workspace' "$SYNC/references/topology.md" || \
    missing+=("references/topology.md: origin fork is not described generically")
  grep -qF 'mifunedev' "$SYNC/references/topology.md" || \
    missing+=("references/topology.md: upstream repo (mifunedev) not named")
fi

# (6) catchup.md must UNCONDITIONALLY prohibit 'git merge upstream/development'.
#     This is an independent assertion — it does NOT require the merge command
#     itself to be present in the file (stripping the example must not let this pass).
if [ -f "$SYNC/references/catchup.md" ]; then
  grep -qiE '(NEVER|never|must not|Do NOT|do not).*(git merge upstream|merge upstream/development)' \
    "$SYNC/references/catchup.md" || \
    missing+=("references/catchup.md: must explicitly prohibit 'git merge upstream/development' (catchup must use cherry-pick, not a full merge)")
fi

# Focused promotion gates must include the required PR number and repository.
grep -qF '/audit pr <N> --repo mifunedev/openharness' "$SYNC/references/publish.md" || \
  missing+=("references/publish.md: focused /audit pr invocation lacks PR number/repo")
grep -qF "/audit pr <N> --repo \"\$ORIGIN_REPO\"" "$SYNC/references/catchup.md" || \
  missing+=("references/catchup.md: focused /audit pr invocation lacks PR number/repo")
# The draft classifier gate must precede the mutation and key on draftStatus,
# not the non-draft ready bucket.
for proc_f in "$SYNC/references/publish.md" "$SYNC/references/catchup.md"; do
  audit_line=$(grep -nF '/audit pr <N> --repo' "$proc_f" | head -1 | cut -d: -f1)
  ready_line=$(grep -nF 'gh pr ready <N>' "$proc_f" | head -1 | cut -d: -f1)
  [ -n "$audit_line" ] && [ -n "$ready_line" ] && [ "$audit_line" -lt "$ready_line" ] || \
    missing+=("${proc_f#"$ROOT"/}: focused audit must run before gh pr ready")
  grep -qF '.draftStatus == "promotable"' "$proc_f" || \
    missing+=("${proc_f#"$ROOT"/}: undraft gate must consume draftStatus promotable")
  # shellcheck disable=SC2016 # literal Markdown backticks
  ready_bucket_pattern='confirm.*ready bucket|in the `ready` bucket'
  if grep -qiE "$ready_bucket_pattern" "$proc_f"; then
    missing+=("${proc_f#"$ROOT"/}: draft gate incorrectly keys on non-draft ready bucket")
  fi
done

# (7) both publish.md and catchup.md must invoke the eval oracle (eval/run.sh).
#     The eval gate is non-negotiable in both directions.
for proc_f in "$SYNC/references/publish.md" "$SYNC/references/catchup.md"; do
  [ -f "$proc_f" ] || continue
  rel="${proc_f#"$ROOT"/}"
  grep -qF 'eval/run.sh' "$proc_f" || \
    missing+=("$rel: does not invoke eval/run.sh — the eval oracle step is required in both publish and catchup procedures")
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: /sync dispatcher contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /sync dispatcher present with publish|catchup|status routes; four files exist; composes /audit drift + /eval + /audit pr; no drift reimplementation in SKILL.md or references/; topology names both remotes; catchup unconditionally prohibits full merge; both procedures invoke eval/run.sh" >&2
exit 0
