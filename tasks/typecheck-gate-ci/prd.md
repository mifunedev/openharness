# PRD: Typecheck Gate in Harness CI

## Introduction

The harness CI workflow (`.github/workflows/ci-harness.yml`) gates style
(lint, format-check), behavior (test), and packaging (build), but it never runs
a type-check. The repo's two TypeScript packages both ship a `typecheck` script
(`tsc --noEmit`) yet no workflow invokes it, so a change that breaks the type
layer (bad import, wrong signature, a missing field on a type) can pass CI as
long as the runtime tests and build happen to still pass — and is only caught on
a manual local run, if ever.

This feature adds a **Typecheck** gate to the existing `ci` job plus a matching
root `typecheck` script for local-dev parity. Both packages currently type-check
clean (verified: `tsc --noEmit` exits 0 in each), so the new gate goes green
immediately and only ever fails on a *future* regression — which is exactly its
purpose.

### Critical design note (the two install regimes)

The two packages are installed by **different toolchains**, and the gate must
respect that:

- **`packages/docs`** is a **pnpm workspace member** (listed in
  `pnpm-workspace.yaml`). Root `pnpm install` installs its deps, and
  `pnpm --filter './packages/**' -r ...` reaches it.
- **`packages/oh`** (the in-tree `oh` CLI) is **NOT a pnpm workspace member** —
  it is an npm-standalone package with its own `package-lock.json`, built
  separately in the Dockerfile (`.devcontainer/Dockerfile:129-133`). Root
  `pnpm install` does **not** install its deps, and the pnpm workspace filter
  `'./packages/**'` **silently excludes it**. Gating `oh` therefore requires an
  explicit `npm --prefix packages/oh ci` + `npm ... run typecheck` step.

A naive single `pnpm --filter './packages/**'` step would pass permanently while
`packages/oh` type-errors went undetected — covering only `docs`, not the `oh`
CLI that motivated this ticket. This PRD covers **both** with two explicit,
self-documenting steps.

## Goals

- Make type regressions impossible to merge silently by gating `tsc --noEmit`
  in CI for **both** TypeScript packages that ship a `typecheck` script —
  `packages/docs` (pnpm) and `packages/oh` (npm-standalone).
- Reuse the existing `ci` job's Node/pnpm setup and install/cache rather than
  adding a separate job.
- Provide a root `pnpm typecheck` script so the same checks run locally.
- Remain conflict-free with in-flight PRs #48 and #50 (both touch
  `scripts/cron-runtime.ts`), by changing only the CI workflow + root
  `package.json` + `CHANGELOG.md`.

## User Stories

### US-001: Add Typecheck steps to the CI `ci` job

**Description:** As a maintainer, I want CI to run `tsc --noEmit` for both
TypeScript packages so that a type regression in either fails the PR instead of
shipping silently.

**Acceptance Criteria:**

- [ ] A step named `Typecheck (workspace packages)` exists in the `ci` job of
      `.github/workflows/ci-harness.yml`, positioned immediately after the
      `Format check` step and before the `Build` step, with command verbatim:
      `pnpm --filter './packages/**' -r --if-present run typecheck`.
- [ ] A second step named `Typecheck (oh CLI — npm standalone)` follows it
      (still before `Build`), running `npm --prefix packages/oh ci` then
      `npm --prefix packages/oh run typecheck`.
- [ ] The `ci` job `name:` (line 49) is updated from `Lint, Build & Test` to
      include Typecheck (e.g. `Lint, Typecheck, Build & Test`) so the GitHub
      checks UI is not misleading.
- [ ] `grep -n "Typecheck" .github/workflows/ci-harness.yml` returns the new
      step lines.
- [ ] The workflow remains valid YAML (parses without error).

### US-002: Add a root `typecheck` script for local-dev parity

**Description:** As a developer, I want a single `pnpm typecheck` command at the
repo root so I can run the same type checks locally that CI runs.

**Acceptance Criteria:**

- [ ] Root `package.json` `scripts` block contains a `typecheck` script that
      runs the docs workspace typecheck AND the oh typecheck, namely:
      `pnpm --filter './packages/**' -r --if-present run typecheck && npm --prefix packages/oh run typecheck`.
- [ ] `package.json` remains valid JSON.
- [ ] `pnpm typecheck` at the repo root exits 0 on the current tree (with oh's
      deps installed, as they are after a normal sandbox build).

### US-003: Record the change in the changelog

**Description:** As a maintainer, I want the changelog to note the new CI gate so
the change is traceable per the repo's Keep-a-Changelog convention.

**Acceptance Criteria:**

- [ ] One bullet is appended to `### Added` under `## [Unreleased]` in
      `CHANGELOG.md`, describing the typecheck gate (both packages) + root
      script, and linking issue #51.
- [ ] The bullet falls **within** the `## [Unreleased]` block (between
      `## [Unreleased]` and the next `## [` heading) — verified by a range check,
      not an unanchored grep.

## Functional Requirements

- FR-1: The `ci` job MUST run `pnpm --filter './packages/**' -r --if-present run
  typecheck` (workspace packages) and `npm --prefix packages/oh ci && npm
  --prefix packages/oh run typecheck` (oh CLI) as steps after `Format check` and
  before `Build`.
- FR-2: A type error introduced into `packages/oh` MUST cause the oh Typecheck
  step to fail; a type error in `packages/docs` MUST cause the workspace
  Typecheck step to fail.
- FR-3: Root `package.json` MUST expose a `typecheck` script that runs both
  packages' typechecks.
- FR-4: `CHANGELOG.md` MUST record the change under `## [Unreleased] → ### Added`
  with an issue link.
- FR-5: No package's `typecheck` script semantics are changed; the gate only
  invokes the existing per-package scripts.
- FR-6: The `ci` job `name:` MUST reflect that typechecking now runs.

## Non-Goals (Out of Scope)

- **`scripts/` TypeScript** (`scripts/cron-runtime.ts`, `scripts/__tests__/*`)
  and **`.pi/` TypeScript** are NOT covered by this gate — there is no `tsconfig`
  governing them today, so `tsc --noEmit` has no entry point for them. Gating
  them requires adding a `tsconfig` and is a separate, larger task. A follow-up
  ticket should add `scripts/` typecheck coverage. (This acknowledges the
  reviewers' finding rather than silently leaving the gap.)
- **Do NOT add `packages/oh` to `pnpm-workspace.yaml`.** It is deliberately an
  npm-standalone package (own `package-lock.json`, built in the Dockerfile);
  pulling it into the pnpm workspace would change what the existing
  Lint/Build/Test steps cover and would regenerate the root `pnpm-lock.yaml` —
  broad, risky, out of scope.
- No changes to `scripts/cron-runtime.ts` (avoids conflict with PRs #48/#50).
- No changes to `packages/oh/package.json` or `packages/docs/package.json` —
  they already define `typecheck`.
- No sandbox application code.
- No fixing of type errors — none exist on the current tree; the gate is
  additive.
- No separate CI job — steps in the existing `ci` job reuse Node/pnpm setup.
- No change to the workflow's `paths:` triggers (they already include
  `.github/workflows/ci-harness.yml`, `packages/**`, and `package.json`).

## Technical Considerations

- The two-install-regime split (pnpm workspace `docs` vs npm-standalone `oh`) is
  the crux: the pnpm workspace filter cannot reach `oh`, so `oh` gets its own
  `npm ci` + typecheck step. `npm ci` is deterministic from the committed
  `packages/oh/package-lock.json` (verified locally: `added 5 packages`,
  typecheck exit 0). `npm` ships with the Node 22 already set up by the job.
- `oh`'s `prepare` lifecycle runs `npm run build` (esbuild) on `npm ci`, so the
  oh step also confirms `oh` builds — a small bonus, not a goal.
- Placing the Typecheck steps after Format check and before Build catches type
  errors early, before the (slower) Build and Test steps.
- The `docs` `build` is `docusaurus build`, which does not strictly type-check
  the project; `tsc --noEmit` via the `typecheck` script is the authoritative
  type gate for it.
- Root-script parity: existing root scripts (`build`, `lint`, `test`) use
  unfiltered `pnpm -r --if-present`, which also skips `oh`. The new root
  `typecheck` is intentionally MORE complete than that pattern — it explicitly
  also runs the oh typecheck — so local `pnpm typecheck` matches what CI gates.

## Success Metrics

- A deliberately-introduced type error in `packages/oh` fails CI; the same in
  `packages/docs` fails CI. (Verified during implementation by a transient
  error-injection test, then reverted.)
- `pnpm typecheck` exits 0 on the current `development` tree.
- The new steps add negligible wall-clock (reuse the job's pnpm store cache;
  oh's `npm ci` installs 5 packages in ~1s).

## Open Questions

- None blocking. Follow-up (separate ticket): add `scripts/` typecheck coverage
  via a `scripts/tsconfig.json` so `cron-runtime.ts` is gated too — out of scope
  here to keep this change additive and conflict-free with PRs #48/#50.

## Critique Resolution

Two critics (implementer + user lens) reviewed an earlier draft of this PRD and
raised 4 high-severity findings — the most important being that
`packages/oh` is **not** a pnpm workspace member, so a naive
`pnpm --filter './packages/**'` step would silently skip the `oh` CLI and the
gate would pass forever while oh's types rotted. This PRD was **revised** to
resolve every high-severity finding before any GitHub-side state changed: the
design now gives `oh` its own explicit `npm ci` + typecheck step, scopes
`scripts/`/`.pi/` out honestly (with a follow-up recommendation), updates the
stale CI job name, and tightens the changelog AC. Medium/low risks were
acknowledged and addressed. Critic gate verdict: **PROCEED**. Full detail in
`critique.md`.
