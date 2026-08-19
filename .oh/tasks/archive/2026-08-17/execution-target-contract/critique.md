# Critique — execution-target-contract

Generated 2026-08-10; reviews `prd.md` post-/prd, pre-/ralph. Round 1.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-004/US-005] [FINDING] The contract's `attach()` returns `Promise<number>` but `runShell` today is `export function runShell(...): number` (sync), and `lifecycle.test.ts` asserts on it synchronously — `expect(runShell(...)).toBe(0)` (line 362 etc.) and `expect(() => runShell(...)).toThrow(...)` (line 435). Converting `runShell` to call an async `attach()` makes it return a `Promise`, which breaks both patterns (`toBe(0)` compares a Promise; `toThrow()` never catches an async rejection) — directly contradicting the "COMPAT ORACLE: zero assertion edits" requirement. | [EVIDENCE: `.oh/cli/src/commands/lifecycle.ts:298` (`export function runShell`), `.oh/cli/src/__tests__/lifecycle.test.ts:362,435`] | [RECOMMENDATION: PRD must state explicitly how `runShell` stays sync-callable — "zero assertion edits" as currently written is not achievable together with `attach(): Promise<number>`.]

[SEVERITY: M] [STORY: US-002/US-003] [FINDING] `ExecResult` requires `stdout: string; stderr: string`, but the existing `RunResult`/`spawnRunner` machinery never surfaces stderr — only `stdout` is copied onto the returned object. "Delegate, don't reassemble" collides with an honest `exec()` implementation. | [EVIDENCE: `.oh/cli/src/commands/lifecycle.ts:59-69` (`RunResult` has no `stderr` field)] | [RECOMMENDATION: name stderr capture as an in-scope sub-task or document `exec()`'s stderr as `""` for this slice.]

[SEVERITY: M] [STORY: US-001] [FINDING] AC/FR text says Sysbox is "promoted to item 1" and existing entries "shift down," implying Sysbox already has an entry in `rfc-runtime-support.md` §8. It does not — zero grep hits. Net-new insertion, not a reorder; framing will mislead the executor. | [EVIDENCE: `.oh/docs/rfcs/rfc-runtime-support.md:109-115`] | [RECOMMENDATION: correct wording to "insert Sysbox as new item 1".]

[SEVERITY: M] [STORY: US-003] [FINDING] `capabilities()` must report `"docker"` only when the socket overlay is on, but the truthy/opt-in logic lives entirely inside `docker-compose.sh` with no queryable primitive; no detection mechanism is specified (TS reimplementation vs `--print-argv` grep are both unstated). | [EVIDENCE: `.oh/scripts/docker-compose.sh:63,126-135`] | [RECOMMENDATION: pin the exact detection mechanism as its own AC.]

[SEVERITY: M] [STORY: US-002] [FINDING] Probe C2 bans Docker nouns case-insensitively across `target.ts` except the `"docker"` capability literal + its doc comment, but a separate AC mandates a file-header comment justifying the refinements, which naturally references "docker exec" — the header is not the capability's doc comment, so it risks tripping C2. | [EVIDENCE: PRD AC "no Docker nouns" vs. "file-header comment records the two deliberate refinements"] | [RECOMMENDATION: word the header generically and dry-run probe C2 against the actual header text.]

[SEVERITY: M] [STORY: US-002/US-005] [FINDING] `exec()` ships fully typed and delegated with zero test coverage or caller in this slice — dead, unverified surface under a "prove no regression" metric. | [EVIDENCE: US-005 ACs enumerate provision()/attach() cases only] | [RECOMMENDATION: add a minimal fake-runner `exec()` unit test, or explicitly mark `exec()` as untested scaffolding in Non-Goals.]

[SEVERITY: L] [STORY: US-002] [FINDING] `workspace: {hostRoot, targetRoot}` is a two-field contract where only the degenerate equal case is legal in Phase-0 — the one-adapter-shaped-abstraction smell the PRD itself warns against. | [EVIDENCE: PRD "Workspace stance" + Open Question 2] | [RECOMMENDATION: RFC should call the two-field shape speculative; may need semantics, not just permission, in the Sysbox slice.]

[SEVERITY: L] [STORY: US-003] [FINDING] US-003 bundles adapter + LifecycleRunner extraction + factory in one story; the extraction's back-compat re-export has its own failure mode that adapter-level green can mask. | [EVIDENCE: US-003 "Three files", 11 ACs] | [RECOMMENDATION: verify the extraction with its own passing-tests checkpoint before layering the adapter.]

[SEVERITY: L] [STORY: US-004] [FINDING] `oh-cli-portable-lifecycle.md` is 657 words against the ≤900 cap; US-004's additions leave ~240 words of headroom for a materially new concept. | [EVIDENCE: `wc -w` = 657; Wiki AC ≤900 words] | [RECOMMENDATION: budget the addition explicitly (trim an existing section).]

[PROTECTED-PATH CHECK] No deletions or deprecations proposed against `.claude/protected-paths.txt`; `Makefile` is pinned unchanged and probe-guarded (C5). Recommendation: probe C5 should assert the Makefile line verbatim, not just "contains docker exec".

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-002] [FINDING] Building a provider-neutral `ExecutionTarget` contract with exactly one adapter and zero others in flight is the textbook premature-abstraction smell — the Success Metrics bullet admits the second adapter is imagined ("on paper"), not built or scheduled. | [EVIDENCE: PRD "Success Metrics" bullet 4; Non-Goals "No Sysbox implementation"] | [RECOMMENDATION: get an explicit answer whether Sysbox (or any second adapter) is scheduled next work; if indefinite, re-scope or defer.]

[SEVERITY: M] [STORY: *] [FINDING] Non-Goals doesn't disclaim ongoing PRD⇄RFC consistency maintenance after archival. | [EVIDENCE: PRD Non-Goals; "Where the decisions live"] | [RECOMMENDATION: add Non-Goal: RFC is the sole source of truth going forward; no post-merge reconciliation obligation.]

[SEVERITY: M] [STORY: *] [FINDING] USER.md frames a single-developer workflow, but the PRD's audience is future architects of #732/#734/Cloud#104 — design-for-audience-that-may-never-arrive. | [EVIDENCE: `.oh/context/USER.md`; PRD Introduction] | [RECOMMENDATION: confirm #732/#734 are real, scheduled, near-term work before investing in a durable RFC layer.]

[SEVERITY: M] [STORY: *] [FINDING] No rollback note for the two structural code moves beyond "tests pass" — no stated revert plan. | [EVIDENCE: US-003/US-004 ACs; no Rollback subsection] | [RECOMMENDATION: add one line: single PR, revert-safe via `git revert`, no persisted state changed.]

[SEVERITY: M] [STORY: *] [FINDING] Open Question 2 (identical-path vs Cloud#104) is deferred with no owner or date — "someone else's problem" with no someone else. | [EVIDENCE: PRD Open Questions #2] | [RECOMMENDATION: resolve now (cheap, pre-RFC-text) or convert to a tracked issue with owner and date.]

[SEVERITY: M] [STORY: US-001] [FINDING] The decision now lives across prd.md + new RFC + wiki entry — three artifacts one maintainer must reconcile; amendment precedent implies churn. | [EVIDENCE: PRD "Where the decisions live"; Wiki Alignment] | [RECOMMENDATION: state in the RFC header "this file is the sole authority; do not restate its content in future PRDs".]

[SEVERITY: L] [STORY: *] [FINDING] Open Question 1 (docs not in `oh update` manifest) is flagged-not-fixed with no guarantee the follow-up issue gets filed; archived-folder flags historically vanish. | [EVIDENCE: PRD Open Questions #1] | [RECOMMENDATION: file the follow-up issue in the same session the PRD is approved.]

[SEVERITY: L] [STORY: US-001] [FINDING] New-RFC authoring and old-RFC factual amendment share one story/AC checklist; a critic stall on RFC prose blocks trivial factual fixes. | [EVIDENCE: US-001 Artifact (a)/(b)] | [RECOMMENDATION: acceptable — both docs-only and deliberately gated; no action.]

[SEVERITY: L] [STORY: *] [FINDING] No protected-path violations — the PRD deletes nothing, only wraps/extracts. | [EVIDENCE: `.claude/protected-paths.txt`; PRD Non-Goals] | [RECOMMENDATION: keep probe C5 as the enforcement mechanism.]

## Round-1 Synthesis
- **High-severity findings**: 2
- **Medium-severity findings**: 10
- **Recommendation**: HALT

Round-1 verdict rationale: Critic A's H is a genuine internal contradiction in the PRD (sync `runShell` compat oracle vs async `attach()`) with no AC-level mitigation. Critic B's H (premature abstraction) has a decision-level answer — Sysbox is the EPIC's scheduled P0 next slice and the Captain approved this scope — but the PRD does not currently state that schedule justification on its face, so it is unmitigated as written. Both route back to `/spec plan` for revision. → PRD revised (round-2), re-critiqued below.

---

# Round 2 — revised PRD (post-DENIED replan)

Revision resolved H1 by declaring `attach?(request: ExecRequest): number` synchronous in `contractVersion: 1` (verified against `lifecycle.ts:49-53/59/298` and `lifecycle.test.ts:362/428/435` — the existing runner seam is already sync) with a documented `contractVersion: 2` async migration path; H2 via a "Why now" subsection (EPIC #731 P0 schedules Sysbox as the next slice; #732/#734 verified open and real; Cloud#104 third consumer; falsifier clause included). All ten round-1 Ms and six Ls folded as concrete AC text — both round-2 critics verified each fix against ground truth and listed them RESOLVED.

## Critic A — Implementer lens (round 2)
All round-1 findings verified RESOLVED. One new finding:

[SEVERITY: M] [STORY: US-004] [FINDING] `runShell`'s JSDoc (lifecycle.ts:291-296) documents the pre-change `docker exec` behavior and no AC required updating it; probe C4's matching strategy (argv-literal vs text grep) was unpinned, so the surviving comment could falsely trip or falsely satisfy C4. | [EVIDENCE: lifecycle.ts:291-296; oh-cli-portable-lifecycle.md:42,67] | [RECOMMENDATION: add doc-comment AC + pin C4 as argv-literal check.] → **FOLDED post-round-2**: US-004 gained the doc-comment AC; C4 pinned as argv-literal inspection, not text grep (both files).

## Critic B — User lens (round 2)
Round-1 H and all Ms verified RESOLVED (#731/#732/#734 independently gh-verified open and real). New findings:

[SEVERITY: M] [STORY: *] [FINDING] "Captain approved this scope on 2026-08-10" had no citable record. | [EVIDENCE: prd.md Why-now bullet 4] | [RECOMMENDATION: cite the decision log or drop.] → **FOLDED post-round-2**: bullet now cites `.oh/memory/2026-08-10/log.md` (spec-plan/spec-critique entries for this slug); legs 1–3 load-bearing.

[SEVERITY: M] [STORY: *] [FINDING] Execute-phase step had #733's build editing EPIC #731's body (checklist append) — a two-writer race with sibling slices #732/#734. | [EVIDENCE: prd.md Open Question 2 remediation] | [RECOMMENDATION: comment, not body edit.] → **FOLDED post-round-2**: now "post a comment on #731, not a body edit"; zero residual "checklist line" text.

[SEVERITY: L] [STORY: *] [FINDING] PRD is the repo's longest at ~5.9k words; consumability degrading. | [RECOMMENDATION: not blocking; restructure into the US-001 RFC rather than growing further.] → **ACKNOWLEDGED** (open, non-blocking; +111 words in round-2 fixes, no net prose beyond them).

[SEVERITY: L] [STORY: *] [FINDING] No protected-path violations; additive/amend-only surface. | [RECOMMENDATION: standing check.]

## Synthesis
- **High-severity findings**: 0
- **Medium-severity findings**: 0 unmitigated (3 raised in round 2, all folded into prd.md/prd.json as AC text and verified landed)
- **Low-severity findings**: 2 acknowledged (PRD length — restructure guidance recorded; protected-path standing check clean)
- **Recommendation**: PROCEED
