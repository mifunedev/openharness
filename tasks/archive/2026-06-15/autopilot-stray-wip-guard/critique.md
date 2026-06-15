# Critique — autopilot-stray-wip-guard

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph (issue #63).

## Critic A — Implementer lens

[SEVERITY: H] [US-004] `git restore --source=development -- $OWNED_PATHS` updates file
content but does NOT switch HEAD; branch stays on feat/63-foo. Next fire's §1 branch
guard fails "not on development" → infinite FAIL loop (the very failure this PRD
prevents). The post-restore assertion checks content only, not HEAD.
→ Remove the `git restore` alternative; mandate the two-step `git checkout development`
(switch HEAD) form; add an AC asserting HEAD == development after restore.

[SEVERITY: H] [US-007] Probe AC only requires exit 0 against the updated SKILL.md; a
trivially-true `exit 0` probe satisfies it. US-006 (correctly) requires exit 1 against
an unmodified SKILL.md; US-007 must match.
→ Add: probe exits 1 (REGRESSION) against an unmodified SKILL.md.

[SEVERITY: M] [US-004] Restore-site count: PRD names 4 sites but the skill has 5
`git checkout -f development` occurrences (incl. line 69 self-heal). After the change
exactly 1 (self-heal) should remain.
→ Add AC: `grep -c 'git checkout -f development' SKILL.md` returns exactly 1.

[SEVERITY: M] [US-002/US-007] The self-heal guard (line 68) uses tree-wide
`git diff --quiet` and is intentionally left unchanged; a naive "no tree-wide
git diff --quiet" probe assertion would false-positive on it.
→ Probe must distinguish the self-heal (by `BRANCH`/`rev-parse` context) from the
owned-surface check.

[SEVERITY: M] [US-001] `$OWNED_PATHS` MUST be passed unquoted; quoting (`"$OWNED_PATHS"`)
collapses the list to a single pathspec that matches nothing → vacuous pass.
→ Add AC mandating unquoted use + a skill comment warning against quoting.

[SEVERITY: M] [US-004] Scoped restore (`git checkout development -- $OWNED_PATHS`) only
restores tracked files; an untracked owned-path orphan (e.g. partial `tasks/<slug>/`
from a mid-run crash) is not cleaned.
→ Document as accepted trade-off (do NOT add `git clean` — too destructive across
owned surface incl. tasks/, memory/, .claude/).

[SEVERITY: M] [US-004] Stranded-branch + foreign-dirty combo: self-heal (tree-wide,
needs fully-clean tree) skips, scoped §1 passes, then branch check FAILs — contradicts
the "stray foreign file no longer FAILs §1" goal.
→ Footnote the Goal: it holds when HEAD is on development; the rare stranded+foreign
double-fault remains a (non-destructive) FAIL.

[SEVERITY: L] [US-006] Self-heal vs restore-site disambiguation strategy unspecified.
→ Assert exactly 1 `git checkout -f development` remains (the self-heal) + 0 unscoped
restore sites.

[SEVERITY: L] [US-008] "not hand-faked" RESULTS.md is unverifiable by CI; process-only.
→ Accept as process constraint (reviewer runs `/eval`).

## Critic B — User lens

[SEVERITY: H] [US-004] (Same as Critic A H) scoped checkout does not switch HEAD; the
tree-wide `-f` previously fixed files AND HEAD in one command.
→ Two-step: `git checkout development` then `git checkout development -- $OWNED_PATHS`;
add AC asserting HEAD on development.

[SEVERITY: H] [US-001] The self-heal's tree-wide clean predicate and the new
owned-scoped predicate are now DIFFERENT; the PRD treats them as the same. The self-heal
still force-checks-out tree-wide and would clobber a foreign file in a path that falls
outside the owned set IF it ever fired with foreign dirt present (it can't, since it
needs a fully-clean tree — but the divergence must be documented).
→ US-002 AC#3 must explicitly state the two predicates differ and why the self-heal
cannot fire while foreign WIP is present (so it never destroys it).

[SEVERITY: M] [US-004] Staged foreign change (outside owned paths): scoped restore
leaves it in the index; the scoped post-restore assertion + §1 check correctly ignore
it, so it persists across runs (non-destructively). No story covers the staged case.
→ Add an AC + repro for the staged-foreign-file case (behavior: left staged, ignored).

[SEVERITY: M] [US-003] `BLOCKED-OWNED-WIP` is passive (log + .cron.log only); in the
single-user context a blocked loop with no GitHub artifact is invisible until manual
log inspection. No notification path, no Non-Goal excluding one.
→ Either Non-Goal "no push notification" (passive logging + heartbeat watch suffices),
or have the heartbeat surface a prolonged block. (Chosen: Non-Goal; heartbeat already
watches logs.)

[SEVERITY: M] [US-001] Verify every path autopilot writes in §4–§7 is in OWNED_PATHS,
handled by Ralph's own commits, or under /tmp.
→ Add a cross-check AC enumerating the write surface.

[SEVERITY: M] [US-006] Dropping the `>=3 forced` count removes the "fires at every exit
path" guarantee; a future edit removing a restore site would be a silent regression.
→ Rewritten probe must keep a count assertion on the scoped-restore form (>=3).

[SEVERITY: L] [*] `.cron.log` writability not guarded; a missing/unwritable log makes
the new token invisible.
→ Guard the liveness append (`touch` first / `|| true`).

[SEVERITY: L] [US-007] Probe grep patterns unspecified; a different expansion form
(`${OWNED_PATHS}`) could slip past.
→ US-006/US-007 must specify exact literal grep patterns.

## Synthesis

- **High-severity findings**: 4 (US-004 HEAD-switch ×2 [same root], US-007 exit-1
  symmetry, US-001 self-heal predicate divergence) — ALL have AC-level mitigations.
- **Medium-severity findings**: 8 — all addressed by AC additions below.
- **Low-severity findings**: 4 — folded into probe-precision and liveness-guard ACs.
- **Recommendation**: REVISE-PRD → PROCEED. No HIGH finding lacks an AC-level
  mitigation; no `[PROTECTED-PATH]` deletion proposed (the autopilot SKILL.md is edited
  in place, not deleted; `clean-restore.sh` is rewritten in place, justified by #63).
  prd.md revised to incorporate every H/M mitigation and the key L items before
  proceeding to issue/branch/PR creation.
