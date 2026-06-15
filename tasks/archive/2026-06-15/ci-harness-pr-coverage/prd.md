# PRD: CI Harness PR Coverage

## Introduction/Overview

The `.github/workflows/ci-harness.yml` workflow currently triggers only on
`workflow_dispatch` and `push`, and its `paths:` filter watches only
`packages/**`, `scripts/**`, `.pi/**`, and a handful of root config files. It
has **no `pull_request:` trigger** and the `paths:` filter **excludes**
`.claude/skills/**`, `crons/**`, and `context/**`.

The autopilot loop produces PRs that edit exactly those excluded directories
(skills, crons, rules under `context/`). Because none of those paths trigger CI
— and because there is no `pull_request` event at all — those PRs receive
**zero CI status checks**. The autopilot `/autopilot` skill §6 "green CI"
finalize gate is therefore hollow for the majority of the changes it actually
ships: there is nothing for `/ci-status` to gate on.

This task adds a `pull_request:` trigger and expands the `paths:` filter so that
harness-infra PRs always get a "CI: Harness" status check, while mirroring the
repo's existing `docs.yml` pattern (branch-scoped `push:` + `pull_request:` +
a `concurrency:` block) to avoid duplicate runs. The CI job's **steps** are not
touched.

**Note on `docs/`:** the top-level `docs/` directory and `packages/docs/**`
are already gated on `pull_request` by `.github/workflows/docs.yml`, so they are
deliberately NOT added here (adding them would cause redundant double CI runs).

## Goals

1. PRs that touch the currently-uncovered harness-infra directories
   (`.claude/skills/**`, `crons/**`, `context/**`) trigger the CI: Harness
   workflow.
2. The workflow runs on the `pull_request` event, not only on `push`, so PR
   status checks appear and the autopilot green-CI gate becomes real.
3. No duplicate CI runs are introduced: `push:` is scoped to the integration
   branches and a `concurrency:` block cancels superseded runs — matching the
   established `docs.yml` precedent.
4. The existing CI job behavior is unchanged — same steps, same package filter,
   still green for a PR that edits no `packages/**` code.

## User Stories

### US-001: Add `pull_request` trigger, scope `push`, and expand `paths:` in ci-harness.yml

As the autopilot loop, I want CI to run on PRs that edit skills/crons/context,
so that my "green CI" finalize gate reflects a real check instead of a no-op,
without doubling runner usage.

**Acceptance Criteria:**
- [ ] The `on:` block of `.github/workflows/ci-harness.yml` contains
  `workflow_dispatch:`, `push:`, and `pull_request:` as sibling keys.
- [ ] `push:` carries `branches: [development, main]` (so feature-branch pushes
  no longer fire a redundant run alongside the `pull_request` event).
- [ ] `push:` and `pull_request:` apply the **identical** `paths:` list,
  written out as **explicit duplicated literal blocks** (YAML anchors MUST NOT
  be used — GitHub Actions does not support them in workflow files).
- [ ] The `paths:` list ADDS these three entries: `.claude/skills/**`,
  `crons/**`, `context/**`. It does NOT add `docs/**` (already covered by
  `docs.yml`).
- [ ] All original `paths:` entries are retained (none removed):
  `packages/**`, `scripts/**`, `.pi/**`, `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `vitest.config.ts`, `.github/workflows/ci-harness.yml`.
- [ ] A top-level `concurrency:` block is added (sibling of `on:`/`permissions:`/
  `jobs:`): `group: ci-harness-${{ github.ref }}`, `cancel-in-progress: true`.
  Workflow-level placement is intentional (it deduplicates the entire run);
  `docs.yml` places its `concurrency:` at job level — same `group:`/
  `cancel-in-progress:` keys, different scope. Do not copy docs.yml's job-level
  placement; use the top-level form specified here.
- [ ] The `jobs:` section is byte-unchanged — no edits to any step. Verify with
  `git diff -- .github/workflows/ci-harness.yml` showing changes confined to the
  `on:` block and the new `concurrency:` block, with zero additions/deletions
  under `jobs:`.
- [ ] The workflow file remains valid YAML and parses as a valid GitHub Actions
  workflow (e.g. `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci-harness.yml'))"`).

### US-002: Record the change in CHANGELOG

As a maintainer, I want the CI coverage fix recorded under `[Unreleased]`, so
that the release notes reflect it.

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` has one new line under `## [Unreleased] → ### Fixed`,
  imperative mood, referencing the tracking issue.
- [ ] No other sections of `CHANGELOG.md` are modified.

## Functional Requirements

1. The change MUST be confined to `.github/workflows/ci-harness.yml` (`on:`
   block + a new top-level `concurrency:` block) and `CHANGELOG.md` (one line).
2. The `push:` and `pull_request:` triggers MUST share an identical `paths:`
   list, written as explicit duplicate literal blocks (no YAML anchors).
3. The CI job's steps (lint/format/build/test + root `pnpm test:scripts`) MUST
   NOT be altered. They already use `--if-present` with a `packages/**` filter
   and therefore no-op safely when nothing under `packages/` changes.

## Non-Goals (Out of Scope)

- Modifying `release.yml`, `docs.yml`, or `conciseness.yml`.
- Adding `docs/**` or `packages/docs/**` to this workflow — already gated by
  `docs.yml` on `pull_request`; adding them here would double-run CI.
- Adding `tasks/**` coverage — task scaffolding PRDs do not require package CI;
  intentionally excluded.
- Changing what the CI job executes (no new lint, typecheck, test framework, or
  markdown/skill/cron validators).
- Adding CI validation of skill/rule/cron content. This task only changes
  **when** CI runs, not **what** it checks. Content validation is a separate,
  larger design decision (see the explicit caveat under Success Metrics).
- Adding `.github/workflows/*` entries to `.claude/protected-paths.txt` — a
  reasonable follow-up, but out of scope for this PR.
- Any change to code under `packages/`.
- Branch/PR lifecycle mechanics (handled by `/ship-spec`).

## Technical Considerations

- GitHub Actions allows a single workflow to declare multiple top-level events
  under `on:`. `push:` and `pull_request:` each accept their own `paths:` filter;
  GitHub does NOT merge them, so both must be written out and kept identical.
- **`workflow_dispatch:` takes no `paths:` filter** — it always runs
  unconditionally. This is expected; do not attempt to add `paths:` under it.
- **Double-run avoidance:** scoping `push:` to `branches: [development, main]`
  means a push to a feature branch no longer fires `push` CI; the PR's
  `pull_request` event is the gate for in-flight branches, and `push` re-checks
  the integration branch after merge. The `concurrency:` block additionally
  cancels superseded runs when a PR branch is pushed repeatedly. This follows
  the `docs.yml` precedent for the branch-scoped `push:` + `pull_request:` shape;
  the `concurrency:` block here is placed at workflow level (docs.yml uses
  job-level) so the whole run is deduplicated. (Trade-off: a push to a feature
  branch with no open PR no
  longer triggers CI — acceptable, since the PR gate covers review.)
- A PR that edits only the workflow file plus `CHANGELOG.md` matches the
  `.github/workflows/ci-harness.yml` path entry, so this very PR triggers CI via
  `pull_request`; since no `packages/**` code changes, the package
  lint/build/test steps no-op via `--if-present` and the root `pnpm test:scripts`
  runs the existing (passing) script tests. The PR is expected to be green.

## Success Metrics

- After merge, opening a PR that edits a file under `.claude/skills/**`,
  `crons/**`, or `context/**` shows a "CI: Harness" status check.
- A push to a feature branch that has an open PR produces exactly **one**
  CI: Harness run (via `pull_request`), not two.

**Honest-signal caveat (acknowledged limitation):** the CI: Harness job runs
`pnpm packages/** lint/build/test` plus the root script tests. It does **not**
validate the *content* of the triggering skill/cron/context file. After this
change a green badge means "package + script health is intact," not "the changed
skill/rule/cron is correct." For files under `context/` (several are
load-bearing per `.claude/protected-paths.txt`) a structurally-broken edit will
still show green. Content validation of harness-infra files is explicitly out of
scope (see Non-Goals) and is a separate design decision. The value delivered
here is that a status check now *exists and can go red on package/script
regressions* for PRs that previously had none.

## Open Questions

- None. Scope is fully specified by the verified defect and the critic-gate
  mitigations folded in.

## Checklist

- [ ] Saved to `tasks/ci-harness-pr-coverage/prd.md`

## Critic Review (ship-spec Stage 3–4)

Two critics (implementer + user lens) reviewed this PRD on 2026-06-10.
Round 1 raised three HIGH findings — (A) duplicate CI runs from unscoped
push + pull_request with no concurrency, (B) `docs/**` overlap with
`docs.yml`, (C) green check implying content correctness it does not verify.
All three were folded into the spec (branch-scoped push + workflow-level
concurrency; `docs/**` dropped; explicit honest-signal caveat). Round 2
verdict: **both critics MITIGATED, no unmitigated HIGH**. Remaining findings
were MEDIUM/LOW and acknowledged: a concurrency-placement wording fix
(applied), and a noted follow-up to add `.github/workflows/*` to
`.claude/protected-paths.txt` (out of scope here). **Gate decision: PROCEED.**
