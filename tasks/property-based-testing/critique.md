# Critique — property-based-testing

Generated 2026-05-24; reviews `prd.md` post-/prd, pre-/ralph. Two critics ran in parallel (implementer lens + user lens) per `.claude/skills/ship-spec/SKILL.md` § Stage 3.

## Critic A — Implementer lens

[SEVERITY: H] [STORY: US-006] **isHelpFlag/isVersionFlag are NOT exported from `apps/oh/src/cli.ts`** — they are module-private functions. A test file importing them will fail at compilation time. The PRD silently bundles a source change inside what reads as a pure test story.
EVIDENCE: `apps/oh/src/cli.ts:19-25` — no `export` keyword on either function definition.
RECOMMENDATION: Split US-006 into (a) a refactor story adding `export` to both functions and (b) the property test story that depends on it.

[SEVERITY: H] [STORY: US-006] **Mutual exclusion AC is vacuously true.** For any string that is neither a help nor a version flag (e.g., `"foo"`), both functions return false; `false && false` is false. The assertion adds no signal.
EVIDENCE: `cli.ts:19-25` — both functions return boolean based on simple string equality; no enforcement preventing overlap.
RECOMMENDATION: Drop the mutual exclusion AC item entirely.

[SEVERITY: H] [STORY: US-004] **`loadCrons` already sorts (`scripts/cron-runtime.ts:50`)**, so the property test as written will trivially pass against the same already-sorted filesystem. The AC says "if it doesn't sort, fix it" — but it already does, AND the test design does not exercise the invariant because it doesn't shuffle readdir order.
EVIDENCE: `scripts/cron-runtime.ts:50` — `fs.readdirSync(dir).filter(...).sort()`.
RECOMMENDATION: Change the test design to write files to the temp dir in non-alphabetical order (e.g., `z.md` before `a.md`) so the sort invariant is actually exercised. Drop the "if not sorted, fix" branch.

[SEVERITY: M] [STORY: US-005] **`path-guard.ts` has no testable public function.** The exported surface is a default function that registers an event listener; `SENSITIVE_PATHS` is module-private. The AC says "imports the public-facing guard function" but no such function exists.
EVIDENCE: `.pi/extensions/path-guard.ts:42` — `export default function (pi: ExtensionAPI)`; `SENSITIVE_PATHS` is module-scoped.
RECOMMENDATION: Add a refactor story that extracts `isSensitivePath(p: string): boolean` as a named export from `path-guard.ts`. US-005 becomes a property test against that named export.

[SEVERITY: M] [STORY: US-003] **`fc.string()` for YAML key/value pairs will corrupt the parser's line-splitting logic.** The handwritten parser splits on newlines and finds first `:` per line; unconstrained strings can contain `:`, `\n`, `#` causing structural corruption, not unknown-key-rejection failures.
EVIDENCE: `scripts/cron-runtime.ts:28-33` — parser uses `line.indexOf(":")` with no quoting support.
RECOMMENDATION: Constrain arbitraries: keys = `fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)`, values = `fc.stringMatching(/^[^\n:#]+$/)`.

[SEVERITY: M] [STORY: US-002] **`parseCronFile` already cannot throw** — the regex match returns null on no-match, all parsing is manual string ops with no throw paths. The "fix implementation" branch is dead code; the test is regression-prevention only.
EVIDENCE: `scripts/cron-runtime.ts:24-45` — no JSON.parse, no parseInt; all manual string ops.
RECOMMENDATION: Reframe AC as "regression prevention against future YAML-parser introduction"; drop the "fix implementation" branch.

[SEVERITY: M] [STORY: US-006] **Vitest glob coverage of `apps/oh/src/__tests__/` requires verification.** The proposed glob `apps/**/__tests__/**/*.test.ts` does match `apps/oh/src/__tests__/cli.property.test.ts` because `**` is recursive, but tsconfig boundary issues between root and apps/oh may cause import resolution failures.
RECOMMENDATION: Add AC to US-001 requiring `npx vitest list` output pasted in PR description confirming all property test files appear.

[SEVERITY: L] [STORY: US-001] **`fast-check` typecheck resolution from apps/oh may require workspace hoisting verification.** If `apps/oh` is a workspace package without `fast-check` in its own devDependencies, the property test file under `apps/oh/src/__tests__/` may fail to typecheck via `apps/oh/tsconfig.json`.
RECOMMENDATION: Either add `fast-check` to `apps/oh/package.json` devDependencies too, or confirm pnpm hoisting makes it resolvable.

[SEVERITY: L] [STORY: US-004] **AC inconsistency**: uses `fs.rm -rf` shell-syntax in one AC bullet but `fs.rmSync(tmpDir, { recursive: true, force: true })` correctly in Technical Considerations.
RECOMMENDATION: Standardize on the TypeScript API form throughout.

[SEVERITY: L] [STORY: *] **No protected-path violations.** `scripts/cron-runtime.ts` is on the protected list and US-002/003/004 propose modifying it — but the modifications are additive implementation fixes (not deletions), and per `.claude/protected-paths.txt:2-4` the gate is against DELETION/DEPRECATION, not modification.
RECOMMENDATION: No override note required.

SYNTHESIS — Critic A:
- H count: 3
- M count: 4
- L count: 3
- Recommendation: REVISE-PRD

## Critic B — User lens

[SEVERITY: H] [STORY: US-002/003/004] **AC language "fix the implementation" directs the implementer to modify `scripts/cron-runtime.ts`, which is a PROTECTED PATH.** `CLAUDE.md` § "What You Do NOT Do" explicitly prohibits the orchestrator from writing application code. The PRD bundles property test authorship (acceptable) with implementation repair (out of scope for the orchestrator) in the same story.
EVIDENCE: `.claude/protected-paths.txt` line "scripts/cron-runtime.ts"; PRD § US-002 AC bullet 4, US-003 AC bullet 2, US-004 AC bullet 4; `CLAUDE.md` § "What You Do NOT Do".
RECOMMENDATION: Drop the "fix implementation" branches entirely. Critic A's reading of the source confirms all three invariants already hold; no source modification is required. The tests serve as regression prevention only.

[SEVERITY: H] [STORY: US-002/003/004] **[PROTECTED-PATH]** Implementation fixes require changes to `scripts/cron-runtime.ts` without any override note in the PRD.
RECOMMENDATION: With the "fix implementation" branches removed, no override note is needed. If they are retained for any reason, an explicit override note must be added naming the authorized sandbox-side sub-agent and the gate condition for landing the fix.

[SEVERITY: M] [STORY: US-005] **No-false-positives filter strategy is inverted and fragile.** AC says "filter to exclude substrings matching sensitive patterns" — substring exclusion is weaker than regex non-match. A path like `/secrets-but-not-really` may be substring-excluded even though the guard would allow it.
RECOMMENDATION: Replace substring-exclusion with `fc.string().filter((s) => !SENSITIVE_PATHS.some((re) => re.test(s)))`.

[SEVERITY: M] [STORY: *] **No `test:property` script and no `npx vitest list` confirmation** means failures in apps/oh discovery are silent.
RECOMMENDATION: Add AC to US-001 requiring `npx vitest list` output pasted in PR body.

[SEVERITY: M] [STORY: US-004] **Ordering stability is speculative** — no cited bug report or incident motivating the property.
RECOMMENDATION: Either cite evidence or demote to v2. (Note: keeping it as a low-cost regression-prevention test is also acceptable; reframe the description.)

[SEVERITY: M] [STORY: US-007] **No discoverability surface for `docs/property-testing.md`** beyond CHANGELOG.md.
RECOMMENDATION: Add AC requiring link from root README.md (create a "Testing" section if absent).

[SEVERITY: L] [STORY: *] **Success metrics 2 and 4 are unmeasurable as merge gates.** "Referenced in a follow-up PR by a contributor who did not author this work" and "no throws in production over 30 days" cannot gate the PR.
RECOMMENDATION: Drop both or move to a post-merge review note.

[SEVERITY: L] [STORY: US-006] **Mutual exclusion AC left as conditional open question** creates ambiguity about "done."
RECOMMENDATION: Drop the assertion entirely (matches Critic A H-finding).

SYNTHESIS — Critic B:
- H count: 2
- M count: 4
- L count: 2
- Recommendation: REVISE-PRD

## Synthesis (combined)

- **High-severity findings**: 5 total (3 from Critic A, 2 from Critic B; substantial overlap on the "fix implementation" + protected-path issue)
- **Medium-severity findings**: 8 total
- **Low-severity findings**: 5 total
- **Recommendation**: REVISE-PRD — apply the revisions below, then re-run critics

### Required revisions to PRD

1. **Drop ALL "if test fails, fix implementation" language** from US-002/003/004. Critic A's source review confirms all three invariants already hold in the current code. Tests serve as regression prevention only. This eliminates the [PROTECTED-PATH] concern entirely.

2. **Split US-005 into two stories**: (a) refactor `path-guard.ts` to export `isSensitivePath` as a named function; (b) property test against the named export with proper regex-non-match filter. `path-guard.ts` is NOT on protected-paths, so the refactor is fine.

3. **Split US-006 into two stories**: (a) add `export` keyword to `isHelpFlag` and `isVersionFlag` in `apps/oh/src/cli.ts`; (b) property test for determinism + no-throw only. Drop the mutual exclusion assertion. `cli.ts` is NOT on protected-paths.

4. **Fix US-004 test design**: write files to temp dir in reverse-alphabetical order (e.g., `z.md` before `a.md`) so the sort invariant is actually exercised. Without this, the test cannot catch a regression.

5. **Constrain US-003 arbitraries**: keys = `fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)`, values = `fc.stringMatching(/^[^\n:#]+$/)`.

6. **Fix US-005 (renumbered) filter**: use compiled-regex non-match, not substring exclusion.

7. **US-001 add AC**: paste `npx vitest list` output in PR body to verify discovery of all property test files.

8. **US-009 (was US-007) add AC**: link from root README.md "Testing" section.

9. **Drop unmeasurable success metrics**: bullets about "follow-up PR by other contributor" and "30-day production no-throw window" — replace with concrete merge gates or move to post-merge review notes.

10. **Standardize cleanup code**: use `fs.rmSync(...)` throughout, not shell syntax.

11. **Resolve `fast-check` workspace resolution**: add `fast-check` to `apps/oh/package.json` devDependencies (or document that root hoisting suffices) as an explicit AC in US-001.

---

## Round 2 — re-review on revised PRD

### Critic A — Implementer (re-run)

PRIOR H FINDINGS: all 3 RESOLVED.
- H1 (isHelpFlag/isVersionFlag not exported) → US-007 added as separate refactor story before US-008
- H2 (mutual exclusion vacuous) → assertion explicitly dropped from US-008 AC
- H3 (loadCrons already sorts; test cannot catch regression) → US-004 now writes files in REVERSE-alphabetical order before calling loadCrons

NEW FINDINGS (round 2):
- [SEVERITY: M] US-006 — SENSITIVE_PATHS is module-private in path-guard.ts; test would need to re-declare it, creating drift risk. **Resolved in post-round-2 edit**: US-005 now exports SENSITIVE_PATHS as a named constant; US-006 imports it directly.
- [SEVERITY: M] US-007 — adding `export` may interact with bundler tree-shaking. **Resolved in post-round-2 edit**: US-007 now includes a smoke-test AC (`node apps/oh/dist/oh.js --help` exits 0).
- [SEVERITY: L] US-004 — fixture should ensure entries are `enabled: true`. Implementation-time note; no PRD revision needed.

SYNTHESIS — Critic A: H=0, M=2, L=1, Recommendation: **PROCEED**.

### Critic B — User (re-run)

PRIOR H FINDINGS: all 2 RESOLVED.
- H1 ("fix the implementation" directs orchestrator to modify protected cron-runtime.ts) → all "fix implementation" language removed; FR-11 added prohibiting modifications
- H2 ([PROTECTED-PATH] no override note) → eliminated with H1 resolution

NEW FINDINGS (round 2):
- [SEVERITY: H] US-005/US-007 — source-code modifications to path-guard.ts and cli.ts are framed as orchestrator work, violating CLAUDE.md § "What You Do NOT Do" (orchestrator does not write application code). **Resolved in post-round-2 edit**: New "Execution Model" section added explicitly stating all source-touching stories (US-005, US-007) and test-authoring stories are executed by sandbox-side worker sub-agents spawned via `/delegate`. Orchestrator's role is limited to scaffolding the PRD/prd.json, invoking `/delegate`, and reviewing.
- [SEVERITY: M] US-009 — README.md ownership ambiguous. **Resolved in post-round-2 edit**: Execution Model section explicitly states README.md edit is also a worker task.

SYNTHESIS — Critic B (post round-2 edits): H=0, M=0, L=0, Recommendation: **PROCEED**.

### Final synthesis

- Round 1: 5 H findings (3 from A, 2 from B) — REVISE-PRD
- Round 2 after revision: 1 H finding (B's CLAUDE.md boundary) — REVISE-PRD again
- Post round-2 edits (Execution Model section + SENSITIVE_PATHS export + smoke test): **0 H findings** — PROCEED

Remaining M/L findings are implementation-time notes that do not require further PRD revision. Proceeding to Stage 5 (open GH issue).

