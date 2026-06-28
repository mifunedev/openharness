# Critique — rlm-weighted-trajectories

Generated 2026-06-27; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [STORY: US-007] /critique SKILL.md edit indirectly mutates the implementation of a protected skill (spec-critique in .claude/protected-paths.txt) without an override note | EVIDENCE: /spec critique routes to /critique; Non-Goals only gate spec-execute/ship-spec | RECOMMENDATION: add an explicit override note that the edit changes critic behavior additively, NOT the critique.md schema ship-spec Stage 4 / /approve parse.
[SEVERITY: H] [STORY: US-007] "if one exists" probe condition is a no-op — zero coverage for a live-seam SKILL.md edit (no critique eval probe exists) | RECOMMENDATION: require a concrete structural assertion in an existing critique-guarding probe (spec-family-contract.sh) OR HALT until coverage exists.
[SEVERITY: M] [STORY: US-001] --now omission breaks the purity guarantee / non-deterministic tests | RECOMMENDATION: when --now is absent the scorer throws (no Date.now() fallback); add a test.
[SEVERITY: M] [STORY: US-003] probe greps SKILL.md literal phrases — repeats eval-probe-literal-token-coupling MEMORY lesson | RECOMMENDATION: assert structural facts (scorer exports + method names in the .mjs), not SKILL.md prose.
[SEVERITY: M] [STORY: US-007] "one-line posture change" misrepresents scope — K-sample critics is a multi-turn sub-loop with no K defined/capped | RECOMMENDATION: K defaults to 1 (no-op, backward-compatible); K>1 opt-in + capped.
[SEVERITY: M] [STORY: US-002] allowed-tools: Read,Grep,Bash conflicts with the sampling procedure that spawns agents | RECOMMENDATION: add Agent to allowed-tools.
[SEVERITY: M] [STORY: US-001] TrajectorySchema undefined across ACs — no single source of truth | RECOMMENDATION: define + export TrajectorySchema alongside DEFAULT_WEIGHTS.
[SEVERITY: M] [STORY: US-008] no probe guards the raw-snapshot force-add (corpus gitignored-by-default) | RECOMMENDATION: assert git ls-files includes the raw snapshot.
[SEVERITY: M] [STORY: US-005] /rlm depends on /weigh; confirm strict priority ordering + SKIP (not REGRESSION) if weigh absent | RECOMMENDATION: add dependency note; US-006 probe SKIPs if scorer absent.
[SEVERITY: L] [STORY: US-001] NO-SELECTION return shape underspecified | RECOMMENDATION: select() returns {selected:null, reason:"NO-SELECTION", floorViolations:[...]}; test it.
[SEVERITY: L] [STORY: US-003/006] a scorer syntax/runtime error exits 1 (REGRESSION) not 2 — but a broken committed scorer IS a real regression | RECOMMENDATION: keep REGRESSION for runtime error; SKIP only on file-absence (clarify).
[SEVERITY: L] [STORY: US-001] import.meta.url symlink-guard trap (prompt-miner-engine-symlink-guard-bug MEMORY) | RECOMMENDATION: detect CLI entrypoint by basename match, not import.meta.url === pathToFileURL(argv[1]).
```
Recommendation: REVISE-PRD.

## Critic B — User lens

```
[SEVERITY: H] [STORY: *] 9 stories / 2 skills / ~15 files in one PR contradicts the small-PR preference | RECOMMENDATION: split into feat/weigh + feat/rlm.
[SEVERITY: H] [STORY: US-004/005/006] /rlm is speculative — no current caller; the PRD names the weighting primitive as the one gap | RECOMMENDATION: defer /rlm until a real long-context task.
[SEVERITY: H] [STORY: US-007] "Run K samples per lens" multiplies every /critique by K×2 with no K/cap defined; /critique runs on every spec | RECOMMENDATION: define K (cap 2) + Non-Goal of no unbounded expansion, or defer.
[SEVERITY: M] [STORY: US-001] judge:25 leaves 25% opaque; no calibration guidance | RECOMMENDATION: Non-Goal: judge calibration out of scope; scoring.md notes the judge:0-vs-25 signal to watch.
[SEVERITY: M] [STORY: US-007] no documented decoupling/rollback path for the critique→weigh coupling | RECOMMENDATION: opt-in / default-off (--no-weigh) escape hatch.
[SEVERITY: M] [STORY: US-002] TrajectorySchema referenced but undefined / not in codebase | RECOMMENDATION: define + export it in US-001.
[SEVERITY: M] [STORY: *] Non-Goals silent on critique cost-model change / K bound | RECOMMENDATION: K bounded at 2; total critique cost ≤ baseline at default.
[SEVERITY: L] [STORY: US-005] undocumented /rlm→/weigh runtime coupling | RECOMMENDATION: document the contract in recursion-budget.md.
[SEVERITY: L] [STORY: US-007] "protected build path untouched" is technically correct but functionally incomplete (alters every spec-critique run) | RECOMMENDATION: name the risk in the PR description; assert no /eval regression.
```
Recommendation: REVISE-PRD.

## Synthesis

- **High-severity findings**: 5 raw (A:2, B:3) — clustering into 3 distinct issues.
- **Medium-severity findings**: 11.
- **Low-severity findings**: 5.
- **Recommendation**: REVISE-PRD → revise then re-gate.

### Disposition of the high-severity issues

1. **US-007 `/critique` seam (A×2 + B×1) — FIX in PRD.** Genuine technical risk. Revision: K
   **defaults to 1 = exact current behavior** (provably additive, zero cost multiplier); K>1 is
   **opt-in, default-off, capped at 2**; the seam is **schema-preserving** (does NOT touch the
   `critique.md` headings `/approve` + ship-spec Stage 4 parse) with an **explicit override note**;
   coverage is a **structural assertion added to the existing `spec-family-contract.sh`** probe
   (critique.md schema unchanged), not an "if one exists" no-op.
2. **PR size (B) — ACKNOWLEDGED, operator-decided.** The operator explicitly chose "one combined
   PR" in the pre-execution clarifying round. Recorded as a deliberate trade-off, not a blocker.
3. **/rlm speculative (B) — ACKNOWLEDGED, operator-decided.** The operator explicitly chose
   trajectory **T7 (both layers, all-at-once)** over the #1-ranked T1-only. /rlm is foundational
   substrate (manual-invoke, `disable-model-invocation` → zero cost until called); its first
   callers are /weigh sampling over large cohorts + the wiki worked example. Kept by operator
   decision; the critic's concern is noted in Non-Goals.

All other M/L findings are folded into the PRD revision below (TrajectorySchema export, --now
throws, NO-SELECTION shape, allowed-tools+Agent, structural probe, symlink-safe entrypoint,
raw-snapshot tracking, judge-calibration Non-Goal). After revision no unmitigated SEVERITY: H
remains → the gate can APPROVE.

## Re-verification (post-revision, implementer lens)

The revised `prd.md` was re-reviewed by the implementer critic against its prior blockers:

```
[RESOLVED] #1 US-007 carries an explicit override note; additive + default-off (K=1 = current behavior, opt-in K=2 capped); critique.md headings unchanged.
[RESOLVED] #2 US-007 names a concrete assertion in the existing spec-family-contract.sh (no "if one exists" hedge).
[RESOLVED] #3 US-001 scorer throws + exits 1 when --now absent (no Date.now() fallback).
[RESOLVED] #4 US-002 allowed-tools now includes Agent.
[RESOLVED] #5 US-001 exports named TRAJECTORY_SCHEMA; US-002 cites it.
[RESOLVED] #6 US-003 probe asserts structural facts of the .mjs (not SKILL.md prose).
[RESOLVED] #7 US-001 mandates basename-match entrypoint detection.
VERDICT: ALL-BLOCKERS-RESOLVED
```

**Updated Recommendation**: PROCEED. The technical SEVERITY: H findings (US-007) are resolved
in the revised spec; the two remaining Critic-B highs (combined-PR size, /rlm scope) are explicit
operator decisions from the pre-execution clarifying round, recorded as accepted trade-offs.
No unmitigated SEVERITY: H remains.
