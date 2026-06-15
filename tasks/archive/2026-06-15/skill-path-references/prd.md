# PRD: Correct Stale apps/ and Roadmap Path References in Skills

## Introduction

Four orchestrator skills still reference repository paths that no longer exist
after the `apps/ → packages/` monorepo rename. Merged PR #44
(`harness-audit-stale-paths`) corrected the heartbeat/docs/wiki references but
missed the `apps/docs` rename, and two skills additionally point at a
`src/data/roadmap.ts` write target that does not exist.

Skills are executable context: a stale path inside a skill does not error
loudly — it degrades silently (a `2>/dev/null` no-op, a blank report section,
or a write to a non-existent file). These specific paths corrupt the output of
`/harness-audit` (docs-app section silently blank) and `/strategic-proposal`
(roadmap written to a non-existent path / self-contradiction). This task is a
mechanical, grep-verifiable, non-destructive correction across skill `SKILL.md`
docs only.

## Goals

- Remove every stale `apps/docs`, `apps/*`, and `apps/README` reference from the
  four affected skills, replacing each with the correct `packages/` path.
- Reconcile `strategic-proposal`'s roadmap write target to the path the skill
  actually writes to (`docs/roadmap.md`).
- Leave a clean grep gate: `grep -rn "apps/docs\|apps/README\|src/data/roadmap"
  .claude/skills/` returns zero matches.
- Touch skill-doc text only — no runtime code, no CI YAML, no other skills.

## User Stories

### US-001: Fix harness-audit/SKILL.md stale paths

**Description:** As an operator running `/harness-audit`, I want the skill to
reference `packages/docs/` so the docs-app context gather and the
test-coverage / package-health checks actually run instead of silently no-oping.

**Acceptance Criteria:**

- [ ] `apps/docs/package.json` → `packages/docs/package.json` (context-gather command; leave the `/home/sandbox/harness/` absolute prefix unchanged — normalizing it is out of scope)
- [ ] `apps/docs:` snapshot-template label → `packages/docs:`
- [ ] Both `apps/docs/` occurrences on the Implementer auditor prompt line → `packages/docs/` (use a global, not first-match, replace — the line holds two occurrences)
- [ ] `apps/*/package.json` → `packages/*/package.json`
- [ ] Key Paths table "Docs app" row → `packages/docs/`
- [ ] `grep -n 'apps/docs\|apps/\*' .claude/skills/harness-audit/SKILL.md` (single-quoted) returns zero matches
- [ ] Token-swap only: `packages/docs/src/__tests__/` does not exist on disk — this is unchanged in intent from the original `apps/docs/src/__tests__/` (a `2>/dev/null`-guarded probe); fixing the test-coverage check logic is out of scope (see Non-Goals)

### US-002: Fix strategic-proposal/SKILL.md stale paths

**Description:** As an operator running `/strategic-proposal`, I want the skill
to name its real roadmap write target so the run doesn't target a non-existent
`src/data/roadmap.ts` or self-contradict.

**Acceptance Criteria:**

- [ ] Both `src/data/roadmap.ts` occurrences (intro prose + mermaid node) → `docs/roadmap.md`
- [ ] `apps/docs/` (key-paths/structure reference) → `packages/docs/`
- [ ] The line-6 `/roadmap page data` prose is left unchanged (not a file path; out of scope)
- [ ] `grep -n "apps/docs\|src/data/roadmap" .claude/skills/strategic-proposal/SKILL.md` returns zero matches

### US-003: Fix ci-status/SKILL.md docs.yml trigger doc

**Description:** As an operator reading `/ci-status`, I want the documented
`docs.yml` trigger paths to match the real workflow filter.

**Acceptance Criteria:**

- [ ] The `docs.yml` trigger list `docs/**, apps/docs/**, blog/**` → `packages/docs/**, docs/**, blog/**` (matching `.github/workflows/docs.yml`)
- [ ] `grep -n "apps/docs" .claude/skills/ci-status/SKILL.md` returns zero matches

### US-004: Fix harness-context/SKILL.md stale README path

**Description:** As an operator reading `/harness-context`, I want the cited
README path to point at the file that exists.

**Acceptance Criteria:**

- [ ] `apps/README.md` → `packages/README.md`
- [ ] `grep -n "apps/README" .claude/skills/harness-context/SKILL.md` returns zero matches

### US-005: Repo-wide verification gate

**Description:** As a reviewer, I want a single command proving no stale path
references remain across all skills.

**Acceptance Criteria:**

- [ ] `grep -rnE "apps/docs|apps/README|apps/\*|src/data/roadmap" .claude/skills/` returns zero matches (pattern broadened from the original to include the `apps/*` wildcard token per critic findings — `apps/*/package.json` on harness-audit:155 would otherwise survive the authoritative gate)
- [ ] `/eval` probe suite shows no NEW (green→red) regression vs the base

### US-006: Add a regression guard so the fix can't silently reappear (critic-driven)

**Description:** As the orchestrator, I want `evals/probes/skill-paths.sh` to
guard the just-fixed tokens so a future PR cannot reintroduce them silently —
the exact failure mode that let PR #44 fix some `apps/` refs while missing
`apps/docs`. This also makes US-005's `/eval` gate meaningful (today the probe
explicitly excludes `apps/docs`, so it is a no-op for this change).

**Acceptance Criteria:**

- [ ] `evals/probes/skill-paths.sh` greps `.claude/skills/` for `apps/docs|apps/README|apps/\*|src/data/roadmap` and exits `1` (REGRESSION) if any reappears; exits `0` (PASS) when clean
- [ ] The stale comment block (lines ~15-19) that claims `apps/docs/` "has legitimate or intentional uses in other skills" is replaced — the `apps/→packages/` rename is complete, so no legitimate `apps/` use remains under `.claude/skills/`
- [ ] The probe's existing `docs/wiki/` + `workspace/heartbeats/` guard and the `harness-context/SKILL.md` full-path exclusion are preserved unchanged
- [ ] `bash evals/probes/skill-paths.sh` exits `0` after US-001..US-004 land (probe is GREEN, no green→red regression vs base)
- [ ] Scope: `evals/` is harness-infra and is NOT listed in this PRD's Non-Goals (which name only `scripts/`, CI YAML, and compose/Docker)

## Functional Requirements

- FR-1: All replacements are exact text substitutions within the named
  `SKILL.md` files; no logic, structure, or new functionality is added.
- FR-2: Each replacement target path must be the correct, current repo path.
  `packages/docs/` and `packages/README.md` exist on disk today; `docs/roadmap.md`
  is the canonical write target named by `strategic-proposal` §9, which creates the
  file on first run (so its absence on disk today is expected, not a defect).
- FR-3: The final verification grep (US-005) is authoritative for "done".

## Non-Goals

- No changes to runtime code (`scripts/`), CI workflow YAML, or any compose/Docker file.
- No changes to any skill not named in US-001..US-004.
- No change to the `strategic-proposal` line-6 `/roadmap page data` prose (it is
  a descriptive phrase, not a file path).
- No deletion of any skill or file.

## Technical Considerations

- Ground truth verified 2026-06-12: `packages/docs/` exists, `apps/docs/` does
  not; `packages/README.md` exists, `apps/README.md` does not; the real
  `docs.yml` filter is `packages/docs/**, docs/**, blog/**`; `strategic-proposal`
  §9 already writes to `docs/roadmap.md`.
- Line numbers in the plan are indicative; match on the literal stale string,
  not the line number (other edits may shift lines).

## Success Metrics

- `/harness-audit` runs populate the docs-app section instead of leaving it blank.
- Zero stale `apps/docs`/`apps/README`/`src/data/roadmap` references repo-wide in skills.
- No `/eval` probe regression; CI green.

## Open Questions

- None — scope and ground truth are fully resolved.

## Critic Review (ship-spec stage 3-4)

Two critics (implementer + user lens) reviewed this PRD before any branch/issue
state was created. **Recommendation: PROCEED** — 0 high-severity findings, 0
protected-path violations. The 3 medium findings were folded into the
implementation rather than deferred: US-003 replaces the `docs.yml` trigger list
atomically (it is a reorder, not a token swap); the authoritative US-005 gate was
broadened to include the `apps/*` wildcard; and US-006 was added to extend
`evals/probes/skill-paths.sh` into a permanent re-introduction guard (which also
makes US-005's `/eval` criterion non-vacuous). See `critique.md` for the full
review.
