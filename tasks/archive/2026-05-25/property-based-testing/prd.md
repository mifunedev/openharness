# PRD: Property-Based Testing with fast-check

## Introduction

Adopt [fast-check](https://fast-check.dev) — a property-based testing framework for TypeScript/JavaScript — across the three TypeScript surfaces in this repository: `scripts/cron-runtime.ts` (cron file parsing), `.pi/extensions/path-guard.ts` (sensitive-path regex matching), and `apps/oh/src/cli.ts` (CLI flag detection). Example-based tests pin known input/output pairs; property-based tests state an invariant (e.g., "parsing arbitrary input must never throw") and let fast-check generate inputs, shrinking any failure to a minimal counterexample.

**Important framing — these property tests serve as regression prevention, not bug-finding.** Source inspection during critic review (see `critique.md`) confirmed that all three target invariants already hold in the current implementations (`parseCronFile` does not throw; it ignores unknown frontmatter keys; `loadCrons` already sorts). The property tests guard against future regressions — e.g., if `parseCronFile` is later rewritten to use a YAML parser that can throw, or if `loadCrons.sort()` is ever removed in refactoring. **No source modifications to `scripts/cron-runtime.ts` are required by this work.** Two small refactors to `path-guard.ts` and `apps/oh/src/cli.ts` — both NOT on `.claude/protected-paths.txt` — are required to expose currently-module-private functions for testing.

## Execution Model

Per `CLAUDE.md` § "What You Do NOT Do", the orchestrator does **not** write application code; all application-code work (including the source refactors in US-005 and US-007 and any test files under `scripts/`, `.pi/`, or `apps/`) is executed by **sandbox-side worker sub-agents spawned via the `/delegate` skill**. The orchestrator's role is limited to: (a) scaffolding this PRD and the resulting `prd.json`, (b) invoking `/delegate` to dispatch worker waves, (c) reviewing the resulting commits and opening the PR.

Concretely:

- **Orchestrator-owned stories**: none directly — every story below is dispatched to a worker.
- **Worker-owned stories**: US-001 through US-009, each executed by a sub-agent via `/delegate`.
- **Wave ordering**: US-001 → wave 1 (US-002, US-003, US-004) || wave 1 (US-005) || wave 1 (US-007) || wave 1 (US-009 docs) — these are independent after US-001. US-006 depends on US-005; US-008 depends on US-007 — both ship in wave 2.
- **README.md edit in US-009**: also a worker task, not orchestrator scaffolding. README.md is not on `.claude/protected-paths.txt`; the link addition is a small content edit appropriate for a worker sub-agent.

## Goals

- Add `fast-check` as a `devDependency` in the **root `package.json`** so all target surfaces import it from a single workspace location.
- Establish a `*.property.test.ts` file naming convention alongside existing `*.test.ts` example tests; extend `vitest.config.ts` `include` glob to cover the `apps/**/__tests__/**/*.test.ts` path (the existing `scripts/__tests__/` and `.pi/**/__tests__/` entries already match `*.property.test.ts` since it ends in `.test.ts`).
- Land **five property tests** in v1: three on `parseCronFile` / `loadCrons` (never-throw, forward-compatibility, ordering stability), one on `path-guard` (no false-positives on benign strings), one on `oh` CLI flag detection (determinism + no-throw).
- Land **two small refactors** that expose currently module-private functions for testing: `isSensitivePath` from `path-guard.ts`, and `export` keywords on `isHelpFlag` / `isVersionFlag` in `apps/oh/src/cli.ts`. Neither file is on `.claude/protected-paths.txt`.
- Land `docs/property-testing.md` documenting the convention, arbitrary patterns, `numRuns` default, decision tree, and per-surface ledger. Link from root `README.md` "Testing" section.
- Property tests run as part of the existing root `npm test` script. CI blocks on property-test failures from day one.

## User Stories

### US-001: Install fast-check and extend vitest include glob

**Description:** As a harness maintainer, I add `fast-check` to `devDependencies` in the root `package.json` (and `apps/oh/package.json` if root hoisting does not make it resolvable for the apps/oh tsconfig) and extend `vitest.config.ts` to cover the apps/oh test directory, so all subsequent property tests run under the existing `npm test` script with no additional CI configuration.

**Acceptance Criteria:**

- [ ] `fast-check` added to `devDependencies` in `/home/sandbox/harness/package.json` (pin to the latest stable major, e.g., `^3.x` — confirm with `npm view fast-check version`)
- [ ] If `npm test` from repo root cannot typecheck `apps/oh/src/__tests__/cli.property.test.ts` (added in US-008) after install due to module resolution, also add `fast-check` to `apps/oh/package.json` devDependencies and re-run install
- [ ] `package-lock.json` (or `pnpm-lock.yaml`) updated by running the appropriate install command
- [ ] `vitest.config.ts` `include` glob extended to add `"apps/**/__tests__/**/*.test.ts"` (existing entries for `scripts/__tests__/` and `.pi/**/__tests__/` remain unchanged)
- [ ] Paste `npx vitest list` output in PR description confirming all property test files added in US-002 through US-008 are discovered by vitest
- [ ] Running `npm test` (or `pnpm test`) from repo root completes successfully with no new failures
- [ ] Typecheck (`tsc --noEmit` in root and `apps/oh/`) passes
- [ ] No changes to existing example tests

### US-002: Never-throw regression-prevention property for `parseCronFile`

**Description:** As a harness maintainer, I add a property test asserting that `parseCronFile(content, filePath)` returns either `null` or a valid `CronEntry` but never throws, for any arbitrary string inputs. **The current implementation already satisfies this invariant**; the test serves as regression prevention against future rewrites (e.g., adopting a YAML parser library that may throw).

**Acceptance Criteria:**

- [ ] New file `scripts/__tests__/cron-runtime.property.test.ts` exists
- [ ] Contains a property test: `fc.assert(fc.property(fc.string(), fc.string(), (content, filePath) => { expect(() => parseCronFile(content, filePath)).not.toThrow(); }))`
- [ ] Test uses fast-check default `numRuns` (100); no tuning needed for v1
- [ ] **No modifications to `scripts/cron-runtime.ts`** — the current implementation already satisfies the invariant; this story is test-only
- [ ] `npm test` passes
- [ ] Typecheck passes

### US-003: Forward-compatibility regression-prevention property for `parseCronFile`

**Description:** As a harness maintainer, I add a property test asserting that valid cron frontmatter remains parseable when arbitrary unknown YAML keys are appended. **The current implementation already ignores unknown keys** (it only reads the keys it explicitly cares about); the test serves as regression prevention against a future strict-mode rewrite.

**Acceptance Criteria:**

- [ ] In the same file `scripts/__tests__/cron-runtime.property.test.ts`, an additional property test:
  - [ ] Constructs a baseline valid frontmatter with `schedule: "* * * * *"` and body
  - [ ] Appends 1–5 arbitrary `key: value` pairs using **constrained arbitraries**: keys = `fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/)` (valid YAML keys), values = `fc.stringMatching(/^[^\n:#]+$/)` (no structural YAML characters)
  - [ ] Calls `parseCronFile(extendedContent, "test.md")` and asserts the result is non-null and `result.schedule === "* * * * *"`
- [ ] **No modifications to `scripts/cron-runtime.ts`** — current implementation already ignores unknown keys (verified at `scripts/cron-runtime.ts:27-33`); test-only story
- [ ] `npm test` passes
- [ ] Typecheck passes

### US-004: Ordering-stability regression-prevention property for `loadCrons`

**Description:** As a harness maintainer, I add a property test asserting that `loadCrons(dir)` returns entries in deterministic alphabetical order by filename **even when files are written to the directory in non-alphabetical order**. **`loadCrons` already calls `.sort()`** at `scripts/cron-runtime.ts:50`; the test guards against accidental removal of that sort in future refactoring.

**Acceptance Criteria:**

- [ ] In `scripts/__tests__/cron-runtime.property.test.ts`, an additional property test:
  - [ ] Generates 2–8 unique filenames using `fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}\.md$/), { minLength: 2, maxLength: 8 })`
  - [ ] Creates a temp directory with `fs.mkdtempSync(path.join(os.tmpdir(), "cron-prop-"))`
  - [ ] **Writes the files in REVERSE-alphabetical order** (sort the filenames descending, write each with a minimal valid frontmatter `---\nschedule: "* * * * *"\n---\n`)
  - [ ] Calls `loadCrons(tmpDir)`, extracts the returned entries' `filePath` values
  - [ ] Asserts the returned order is the ASCENDING alphabetical sort of the input filenames (regardless of write order)
  - [ ] Cleans up with `fs.rmSync(tmpDir, { recursive: true, force: true })` inside `try/finally` so failures don't leak temp dirs
- [ ] **No modifications to `scripts/cron-runtime.ts`** — current implementation already sorts; test-only story
- [ ] `npm test` passes
- [ ] Typecheck passes

### US-005: Refactor `path-guard.ts` to expose `isSensitivePath` and `SENSITIVE_PATHS` as named exports

**Description:** As a sandbox worker (dispatched by `/delegate`), I refactor `.pi/extensions/path-guard.ts` to extract the sensitive-path check into a named exported pure function `isSensitivePath(path: string): boolean` and to export the `SENSITIVE_PATHS` regex list as a named constant, so US-006 can test against the same compiled regexes without duplication-drift risk. The existing default-export extension-registration function continues to work unchanged by calling the new function internally.

**Acceptance Criteria:**

- [ ] `.pi/extensions/path-guard.ts` exports `SENSITIVE_PATHS` as a named constant: `export const SENSITIVE_PATHS: RegExp[] = [ ... ];` (just add `export` to the existing declaration at line 3)
- [ ] `.pi/extensions/path-guard.ts` exports a new named function `export function isSensitivePath(path: string): boolean { return SENSITIVE_PATHS.some((re) => re.test(path)); }`
- [ ] The existing default export's internal sensitive-path check (currently at `.pi/extensions/path-guard.ts:55`) is replaced with a call to `isSensitivePath(path)`; behavior is unchanged
- [ ] Existing `.pi/extensions/__tests__/path-guard.test.ts` example tests continue to pass with no modifications
- [ ] `path-guard.ts` is NOT on `.claude/protected-paths.txt` (verified) — no override note required
- [ ] `npm test` passes
- [ ] Typecheck passes

### US-006: No-false-positives property for `isSensitivePath`

**Description:** As a harness maintainer, I add a property test asserting that `isSensitivePath(path)` returns `false` for any arbitrary path string that does not match any sensitive-path regex — so the guard never blocks benign paths.

**Acceptance Criteria:**

- [ ] New file `.pi/extensions/__tests__/path-guard.property.test.ts` exists
- [ ] Imports `isSensitivePath` AND `SENSITIVE_PATHS` (both added in US-005) directly from `.pi/extensions/path-guard` — no re-declaration of the regex list in the test file (single source of truth)
- [ ] Property: generates arbitrary path strings using `fc.string()` filtered by **regex non-match** (NOT substring exclusion) using the imported `SENSITIVE_PATHS`: `fc.string().filter((s) => !SENSITIVE_PATHS.some((re) => re.test(s)))`
- [ ] Asserts `isSensitivePath(s) === false` for every such generated path
- [ ] Test uses fast-check default `numRuns` (100)
- [ ] **Depends on US-005** (named export must exist first)
- [ ] `npm test` passes
- [ ] Typecheck passes

### US-007: Add `export` to `isHelpFlag` and `isVersionFlag` in `apps/oh/src/cli.ts`

**Description:** As a sandbox worker (dispatched by `/delegate`), I add the `export` keyword to `isHelpFlag` and `isVersionFlag` in `apps/oh/src/cli.ts` so they can be imported from a property test file. No behavior changes; no other code touches these functions outside the file.

**Acceptance Criteria:**

- [ ] `apps/oh/src/cli.ts` line 19: `function isHelpFlag(...)` → `export function isHelpFlag(...)`
- [ ] `apps/oh/src/cli.ts` line 23: `function isVersionFlag(...)` → `export function isVersionFlag(...)`
- [ ] No other changes to `cli.ts` (existing local call sites continue to use the same function references)
- [ ] `cli.ts` is NOT on `.claude/protected-paths.txt` (verified) — no override note required
- [ ] `apps/oh` build succeeds (`cd apps/oh && npm run build`)
- [ ] `apps/oh` typecheck passes (`cd apps/oh && npm run typecheck`)
- [ ] **Smoke test**: after build, `node apps/oh/dist/oh.js --help` exits 0 (verifies the export change did not break tree-shaking or entry-point behavior — esbuild typically preserves named exports from an entry, but the smoke test confirms it)

### US-008: Determinism + no-throw property for `oh` CLI flag detection

**Description:** As a harness maintainer, I add a property test asserting that `isHelpFlag` and `isVersionFlag` (now exported per US-007) are deterministic pure functions that never throw for any input.

**Acceptance Criteria:**

- [ ] New file `apps/oh/src/__tests__/cli.property.test.ts` exists
- [ ] Imports `isHelpFlag`, `isVersionFlag` from `../cli.js` (using NodeNext ESM extension per `apps/oh/tsconfig.json`)
- [ ] Contains property tests using `fc.string()` (and `fc.constant(undefined)` to also cover the `string | undefined` signature):
  - [ ] **Determinism**: `isHelpFlag(s) === isHelpFlag(s)` across repeated calls on the same input
  - [ ] **Determinism**: `isVersionFlag(s) === isVersionFlag(s)` across repeated calls on the same input
  - [ ] **No-throw**: neither function throws on any input
- [ ] **Mutual exclusion assertion is explicitly NOT included** (it would be vacuously true for non-flag strings and adds no signal)
- [ ] **Depends on US-001** (vitest glob extension) and **US-007** (named exports)
- [ ] `npm test` passes from repo root, discovering this file via the extended vitest glob
- [ ] Typecheck passes (`cd apps/oh && npm run typecheck`)

### US-009: Document the property-testing convention

**Description:** As a harness maintainer, I add `docs/property-testing.md` documenting the file-naming convention, arbitrary patterns, default `numRuns`, the per-surface ledger, and the decision tree for when to use property vs example tests. Link from root `README.md` for discoverability.

**Acceptance Criteria:**

- [ ] New file `docs/property-testing.md` exists
- [ ] Contains sections:
  - [ ] `Convention` — file naming (`*.property.test.ts`), where tests live, what gets discovered by vitest
  - [ ] `Arbitrary patterns` — how to use `fc.string`, `fc.array`, `fc.record`, `fc.stringMatching`; when to write custom arbitraries (link to fast-check.dev for upstream docs)
  - [ ] `numRuns` — default 100; when to tune
  - [ ] `Decision tree` — one-paragraph: when to reach for a property test vs example test
  - [ ] `Surface ledger` — markdown table listing the 3 v1 surfaces (`parseCronFile`, `path-guard`, `oh-cli-flags`) with their property names and which PR added each
- [ ] Root `README.md` has a "Testing" section (create if absent) with a one-line link to `docs/property-testing.md` for property-testing convention
- [ ] `CHANGELOG.md` `[Unreleased]` entry references this work
- [ ] Document does not duplicate fast-check upstream docs; links to fast-check.dev for reference material
- [ ] No code changes required for this story (docs only)

## Functional Requirements

- **FR-1:** `package.json` at repo root must include `fast-check` in `devDependencies`; if root hoisting does not satisfy `apps/oh` typecheck, `apps/oh/package.json` must also include it.
- **FR-2:** `vitest.config.ts` `include` glob must cover `scripts/__tests__/**/*.test.ts`, `.pi/**/__tests__/**/*.test.ts`, **and** `apps/**/__tests__/**/*.test.ts`.
- **FR-3:** A new pure function `isSensitivePath(path: string): boolean` and the existing `SENSITIVE_PATHS` regex list must both be named-exported from `.pi/extensions/path-guard.ts`; the existing default extension-registration function must call `isSensitivePath` internally with no observable behavior change.
- **FR-4:** `isHelpFlag` and `isVersionFlag` in `apps/oh/src/cli.ts` must be named exports.
- **FR-5:** A test file `scripts/__tests__/cron-runtime.property.test.ts` must exist containing three property tests: never-throw, forward-compatibility (with constrained arbitraries), and ordering stability (using reverse-write fixture).
- **FR-6:** A test file `.pi/extensions/__tests__/path-guard.property.test.ts` must exist with the no-false-positives property using regex non-match filter.
- **FR-7:** A test file `apps/oh/src/__tests__/cli.property.test.ts` must exist with determinism + no-throw properties.
- **FR-8:** `docs/property-testing.md` must exist documenting convention, arbitrary patterns, `numRuns` default, decision tree, and surface ledger; root `README.md` must link to it.
- **FR-9:** Property tests must run as part of the existing `npm test` script at repo root with no additional CI configuration; CI must block on property-test failures.
- **FR-10:** Default `numRuns` for property tests is 100 (fast-check default); per-file tuning is allowed but must include a code comment explaining the chosen number.
- **FR-11:** No modifications to `scripts/cron-runtime.ts` source — its current implementation already satisfies all three target invariants; test additions only.

## Non-Goals (Out of Scope)

The following were considered and explicitly deferred because they target surfaces that are not TypeScript code in this repository:

- **Skill argument parsing roundtrip** — skill arguments are parsed by Claude reading `$ARGUMENTS` in markdown `SKILL.md` files; no TS parser function exists.
- **Memory path safety** (`memory/...` paths cannot escape workspace root) — memory writes are bash `mkdir -p` + file append driven by markdown skill prompts; no TS path resolver exists.
- **`prd.json` (de)serialization roundtrip** — `prd.json` is written by the `/ralph` skill as an LLM transform from markdown; no TS serializer/deserializer module exists.
- **`settings.json` merge idempotence** — `.claude/settings.json` and `.pi/settings.json` are static JSON files; no TS merge function exists.
- **Compactor / summarizer / state-machine property tests** — no TS modules of those shapes exist in the main checkout today.
- **Property-based integration tests** (e.g., generated sequences of skill invocations or end-to-end CLI flows) — v1 scope is unit-level invariants only.
- **Shared `test/arbitraries/` module of harness-specific arbitraries** — inline arbitraries per file in v1; extract only when 3+ files share the same arbitrary.
- **Property tests against `RISKY_BASH` patterns in `path-guard.ts`** — v1 covers `SENSITIVE_PATHS` only; `RISKY_BASH` coverage can be added in a followup using the same pattern.
- **Modifications to `scripts/cron-runtime.ts` source** — explicitly out of scope per FR-11.

## Technical Considerations

- **fast-check version:** pin to current stable `^3.x` (confirm with `npm view fast-check version` at install time). The library is well-maintained and ABI-stable across minor versions.
- **Vitest discovery:** the existing `*.test.ts` patterns already match `*.property.test.ts` because the latter ends with `.test.ts`. The only required config change is adding `apps/**/__tests__/**/*.test.ts` to the `include` array. Verify with `npx vitest list` after the config change.
- **Tests as regression prevention only:** US-002/003/004 test invariants that already hold in the current implementation (`parseCronFile` does not throw — manual string ops only; ignores unknown keys — only reads named keys; `loadCrons` sorts at line 50). The value is preventing future regressions, not catching current bugs.
- **Temporary directories in US-004:** use `fs.mkdtempSync(path.join(os.tmpdir(), "cron-prop-"))` and `fs.rmSync(tmpDir, { recursive: true, force: true })` in a `try/finally`.
- **Reverse-write fixture in US-004:** the critical test-design fix from the critique — writing files in reverse-alphabetical order is what actually exercises the sort invariant; testing against an already-sorted filesystem cannot catch a regression.
- **NodeNext ESM imports in apps/oh:** US-008 must use `.js` extension on the import (`from "../cli.js"`) per `apps/oh/tsconfig.json` `moduleResolution: NodeNext`.
- **Constrained arbitraries in US-003:** unconstrained `fc.string()` for YAML keys/values would inject structural characters (`:`, `\n`, `#`) and corrupt the handwritten parser's line-splitting; the regex-constrained arbitraries keep the test focused on the unknown-key forward-compat invariant.
- **Regex-non-match filter in US-006:** substring exclusion is weaker than regex-non-match (e.g., `/secrets-but-not-really` shares a substring with `secrets?/` but does not match the regex). Use the compiled-regex filter directly.
- **Pre-commit hooks:** per `.claude/rules/git.md`, pre-commit hooks run lint + tests. Do not use `--no-verify` to bypass — fix the underlying issue.
- **Story dependency ordering:** US-001 → (US-002, US-003, US-004) || (US-005 → US-006) || (US-007 → US-008) || US-009. US-001 is the foundation; the three property-test branches (cron, path-guard, cli) are independent and parallelizable; US-009 (docs) is independent and can land in parallel with any branch.

## Success Metrics

- All 5 property tests pass under `npm test` with seed-deterministic behavior (no flakiness across 10 consecutive runs).
- `npx vitest list` output (pasted in PR description) shows all 3 property test files discovered.
- `docs/property-testing.md` exists and is linked from root `README.md`.
- Zero regressions in existing example tests (`scripts/__tests__/cron-runtime.test.ts`, `.pi/extensions/__tests__/path-guard.test.ts`) after this work merges.
- All CI jobs green at merge time, including property tests blocking failures (no advisory mode).

## Open Questions

- Should `docs/property-testing.md` live under `docs/` (Docusaurus-rendered, human-facing) or `wiki/property-testing.md` (LLM-readable wiki, frontmatter-tagged)? **Default for this PRD: `docs/`** since it's a contributor process guide, not a fact/synthesis entity per `context/rules/wiki.md`.
- Per-file `numRuns` tuning: is 100 enough for `parseCronFile`'s never-throw property, or should it be raised? **Default: 100 in v1; tune in followup if a real regression slips through with default settings.**
- Should US-005 also extract `isRiskyBash(cmd: string): boolean` as a named export from `path-guard.ts`? **Default for v1: no** — covering `SENSITIVE_PATHS` only; explicitly listed as a Non-Goal for `RISKY_BASH` v1 coverage.

## Critic review

Two critics (implementer lens + user lens) reviewed this PRD across two rounds. Final state: **0 H findings, PROCEED**. Surviving M findings are implementation-time notes (covered in Technical Considerations and individual story ACs); no further PRD revision required. Full audit trail in `tasks/property-based-testing/critique.md`.
