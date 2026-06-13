# Critique — skill-path-references

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph (ship-spec stage 3).

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
- [SEVERITY: M] [STORY: US-003] docs.yml trigger fix is a list *reorder*, not a single token swap — `docs/**` moves from position 1 to 2 and `apps/docs/**` is replaced. | EVIDENCE: current `docs/**, apps/docs/**, blog/**` → target `packages/docs/**, docs/**, blog/**` | RECOMMENDATION: replace the entire trigger-list string atomically, not two independent token replaces.
- [SEVERITY: M] [STORY: US-005] `/eval` AC is vacuous — `evals/probes/skill-paths.sh` guards only `docs/wiki/` + `workspace/heartbeats/`; its comment explicitly EXCLUDES `apps/docs/`, so the probe passes whether or not the fix lands. | EVIDENCE: skill-paths.sh:15-19 | RECOMMENDATION: extend the probe to guard the fixed tokens (evals/ is not in Non-Goals) OR drop the no-op `/eval` claim from US-005.
- [SEVERITY: L] [STORY: US-005] final grep gate omits `apps/*` — `apps/*/package.json` (harness-audit:155) is not in the `apps/docs|apps/README|src/data/roadmap` pattern. | RECOMMENDATION: broaden the authoritative gate to include `apps/\*`.
- [SEVERITY: L] [STORY: US-002] `docs/roadmap.md` absent on disk — acceptable; skill §9 creates it on first run. No action.
- [SEVERITY: L] [STORY: *] no regression guard added post-fix; a future PR could reintroduce `apps/docs`. | RECOMMENDATION: a follow-on probe update (now folded into US-006).

## Critic B — User lens

CRITIC_B — USER LENS
- [SEVERITY: M] [STORY: US-005] authoritative final gate (FR-3) omits the `apps/*` wildcard token; a missed harness-audit:155 yields a false green. | RECOMMENDATION: add `\|apps/\*` to the US-005 pattern.
- [SEVERITY: L] [STORY: *] FR-2 falsely claims `docs/roadmap.md` is an existing path; skill §9 creates it on first run. | RECOMMENDATION: soften FR-2 wording.
- [SEVERITY: L] [STORY: *] `skill-paths.sh:18` comment ("apps/docs has legitimate uses") goes stale/misleading after the fix. | RECOMMENDATION: update the comment in the same PR.
- [SEVERITY: L] [STORY: *] no probe guards the new `packages/docs`/`docs/roadmap.md` targets against future drift (PR #44 missed apps/docs the same way). | RECOMMENDATION: add a re-introduction guard (folded into US-006).

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 3 (US-003 atomic-reorder; US-005 vacuous `/eval` gate; US-005 gate omits `apps/*`)
- **Low-severity findings**: 6
- **Protected-path violations**: 0 (no deletions; pure text substitution)
- **Recommendation**: PROCEED

### Mitigations folded into implementation
1. US-003: replace the whole `docs.yml` trigger-list string atomically → `packages/docs/**, docs/**, blog/**`.
2. US-001: harness-audit:151 holds two `apps/docs` occurrences on one line → global (not first-match) replace; preserve the `/home/sandbox/harness/` absolute prefix on :65.
3. US-005: broaden the authoritative final gate to `apps/docs|apps/README|apps/\*|src/data/roadmap`.
4. **US-006 (new, critic-driven)**: extend `evals/probes/skill-paths.sh` to guard `apps/docs|apps/README|apps/\*|src/data/roadmap` in `.claude/skills/` and replace the now-false "apps/docs has legitimate uses" comment — turns the one-time fix into a permanent regression guard and makes the `/eval` gate meaningful for this bug class. `evals/` is outside the PRD Non-Goals.
5. FR-2 wording softened: `docs/roadmap.md` is the canonical write target (created on first `/strategic-proposal` run), not an asserted-existing file.
