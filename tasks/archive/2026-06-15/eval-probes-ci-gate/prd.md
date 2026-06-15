# PRD: Gate the eval probe suite in CI

Tracks GitHub issue **#103**. Slug: `eval-probes-ci-gate`.

## Introduction

The harness ships a 16-probe fitness-function suite under `evals/probes/*.sh`.
Each probe is a deterministic 3-state oracle (`0`=PASS, `1`=REGRESSION,
`2`=SKIPPED) that encodes a documented lesson as a static assertion over the
repo's own files. The runner `.claude/skills/eval/run.sh` aggregates them and
exits `0` when no new green→red regression occurred this run, `1` when one or
more did.

Today this suite has **no PR-time trigger**: `.github/workflows/ci-harness.yml`
never runs it, `evals/**` is not even in the workflow's path filters, and the
only automated trigger — the `eval-weekly` cron — has never fired. The suite
therefore runs only on manual `/eval`, so a green→red regression introduced by a
merged harness PR (the exact failure mode the suite exists to catch) goes
undetected indefinitely.

This feature wires the existing runner into `ci-harness.yml` as a read-only
regression gate, turning the suite into a live guardrail at near-zero cost.

## Goals

- Run the eval probe suite on every harness PR and on pushes to
  `development`/`main`, gating the pipeline on the runner's exit code.
- Make `evals/**` a CI path trigger so probe/RESULTS changes are themselves
  gated.
- Keep the CI run **read-only with respect to git**: the runner rewrites
  `evals/RESULTS.md` in the writable working tree (expected), but CI must gate
  purely on the exit code and never commit/push that churn.
- Ensure every probe is **hermetic in a cold CI runner** — a currently-PASS
  probe must stay PASS or become SKIPPED (exit 2), never ERROR/REGRESS, when a
  live dependency (docker, tmux, cron-system, running processes, PCRE grep) is
  absent.
- Make the new gate self-guarding so it cannot be silently removed.

## Story ordering (critical)

Stories MUST be implemented in numeric order. The hermeticity work (US-002)
**must land before** the blocking job (US-003): otherwise the job would
false-fail on its very first run (a currently-PASS probe ERRORing in cold CI =
PASS→ERROR = a new green→red regression). Sequencing US-002 first removes that
bootstrap circularity — by the time US-003 adds the gate, every probe already
passes or skips cleanly in CI.

## User Stories

### US-001: Add `evals/**` to CI path triggers

**Description:** As a harness maintainer, I want changes under `evals/` to
trigger CI so that probe edits and RESULTS updates are themselves gated.

**Acceptance Criteria:**

- [ ] `.github/workflows/ci-harness.yml` `push.paths` list contains an `evals/**` entry, double-quoted to match the file's existing style (`- "evals/**"`).
- [ ] `.github/workflows/ci-harness.yml` `pull_request.paths` list contains the same `evals/**` entry.
- [ ] `grep -c 'evals/\*\*' .github/workflows/ci-harness.yml` returns `2` (quote-agnostic check).
- [ ] The workflow YAML still parses (e.g. `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci-harness.yml'))"` exits 0, or an equivalent parse check).

### US-002: Make every probe hermetic in cold CI (audit + classify + fix)

**Description:** As a harness maintainer, I want each probe to PASS or SKIP
(never ERROR/REGRESS) when a live dependency is absent so that the future CI
gate does not false-fail on a runner that has no docker/tmux/cron-system/PCRE.

**Acceptance Criteria:**

- [ ] **Classification table** (mandatory deliverable, written into this PRD's task notes at `tasks/eval-probes-ci-gate/probe-audit.md`): one row per probe in `evals/probes/*.sh` listing its dependency profile — `static-grep` (asserts over committed files, no live dep), `file-exec` (runs a committed fixture/hook), `process-inspection` (pgrep/tmux/docker/cron-system), `extract-and-run` (extracts + executes a block from a SKILL.md), or `tool-dep` (needs a non-baseline tool e.g. `grep -P`/`zsh`) — plus its current committed RESULTS.md status and whether it already exits 2 on a missing dep.
- [ ] Any probe that would exit with a non-{0,1,2} code **or** REGRESS (exit 1) purely because a live runtime dependency is absent in cold CI is patched to detect that absence and `exit 2` (SKIPPED) with a `SKIPPED: <reason>` stderr line **before** any PASS/REGRESSION verdict. This explicitly covers: process-inspection probes (`next-dev-prod`, `cron-claude-codex-fallback`, `health-check-docker-stats` — already string-greps but confirm), extract-and-run probes (`drift-check-cron-staleness-glob` — confirm deterministic in a clean temp dir with no real cron runtime), and tool-dep probes (`owned-surface-guard` uses `grep -oP`: either confirm ubuntu-latest GNU grep supports `-P` AND add a defensive `grep -P . /dev/null 2>/dev/null || { echo "SKIPPED: grep -P (PCRE) unavailable"; exit 2; }` guard, or document the confirmation in `probe-audit.md`).
- [ ] Probes already purely static over committed files are left functionally unchanged (no oracle-semantics edits).
- [ ] `.claude/skills/eval/run.sh` is **NOT** modified; no probe's 0/1/2 oracle meaning is changed.
- [ ] **Behavioral proof of hermeticity**: running `bash .claude/skills/eval/run.sh` in an environment that lacks docker/tmux/cron-system produces zero `ERROR` rows and exits 0, with every row PASS or SKIPPED except the pre-existing `next-dev-prod` REGRESSION (which is unrelated to this PR and stays unchanged → not a new regression). Capture the run's per-probe status lines into `probe-audit.md`.
- [ ] **Refresh the committed baseline**: after patching, run `/eval` (or `bash .claude/skills/eval/run.sh`) once and commit the regenerated `evals/RESULTS.md` so the committed baseline reflects each probe's post-patch sandbox status. Document in `probe-audit.md` that PASS→SKIPPED divergence between sandbox and CI is expected and non-regressing per `run.sh:106`.
- [ ] `shellcheck -S warning` is clean on every probe modified by this story.

### US-003: Add the `eval-probes` CI job

**Description:** As a harness maintainer, I want a CI job that runs the eval
runner and fails on a new regression so that green→red regressions block merge.

**Acceptance Criteria:**

- [ ] A new top-level job `eval-probes` exists in `ci-harness.yml`, `runs-on: ubuntu-latest`, independent of the `ci` and `boot-lint` jobs.
- [ ] The job checks out the repo (`actions/checkout@v4`) and its sole substantive step runs exactly `bash .claude/skills/eval/run.sh` (no `--probe`/`--tier` filter).
- [ ] The job fails iff that command exits non-zero — no `|| true`, no `continue-on-error: true`.
- [ ] The job contains **no** git write step: no `git add`, `git commit`, `git push`, or any step that persists `evals/RESULTS.md` to the remote. (The runner overwriting RESULTS.md in the writable checkout is expected and acceptable; the constraint is purely about not committing/pushing it.)
- [ ] **No Node/tooling setup is added**: verified that no probe shells out to `node`/`jq`/`python`/`ruby` (the suite is pure bash + coreutils present on ubuntu-latest), so checkout + bash suffices. (Confirmed by US-002 classification.)
- [ ] The job inherits the workflow's `permissions: contents: read` default (no elevated permissions requested).

### US-004: Self-guard probe `eval-ci-gate.sh`

**Description:** As a harness maintainer, I want a probe that fails if the CI
gate is removed so that the guardrail can't be silently deleted.

**Acceptance Criteria:**

- [ ] `evals/probes/eval-ci-gate.sh` exists with header lines `# tier: A`, a `# source:` line citing this lesson (e.g. `# source: #103 — eval probe suite gated in CI`), and a `# desc:` line that explicitly notes it is a **string-presence** check (not semantic), so future refactors are aware it tracks the literal invocation.
- [ ] It resolves the repo root from `${BASH_SOURCE[0]}` (never cwd), same pattern as `evals/probes/boot-lint-glob.sh`.
- [ ] It `exit 2` (SKIPPED) with a stderr reason if `.github/workflows/ci-harness.yml` is absent.
- [ ] It `exit 0` (PASS) when that file contains the runner invocation, matched with an **unanchored** grep (no `^` anchor, accounting for YAML `run:` indentation) for the literal `bash .claude/skills/eval/run.sh` — same indentation-robust idiom as `boot-lint-glob.sh`.
- [ ] It `exit 1` (REGRESSION) when that invocation is absent.
- [ ] `bash evals/probes/eval-ci-gate.sh` exits 0 against the post-US-003 tree; temporarily removing the runner line from ci-harness.yml makes it exit 1 (verify, then restore).
- [ ] `shellcheck -S warning evals/probes/eval-ci-gate.sh` is clean.

### US-005: Document the gate, escape hatch, CHANGELOG

**Description:** As a harness maintainer, I want the new CI gate, its escape
hatch, and the cron relationship documented so I can unblock a false-fail and
understand which gate is authoritative.

**Acceptance Criteria:**

- [ ] `evals/README.md` gains a substantive subsection (not a buried one-word mention) stating: (a) the job name `eval-probes`, (b) it runs on every PR and on push to `development`/`main`, (c) it gates on the runner's exit code and does NOT commit `RESULTS.md`, and (d) the **escape hatch** — a false-failing probe is unblocked by re-running via `workflow_dispatch` and/or a follow-up commit that fixes or temporarily removes the offending probe; the gate has no merge-bypass label.
- [ ] `evals/README.md` documents the known limitation that `PASS→SKIPPED` transitions in CI are silent (not a regression), so keeping the committed `RESULTS.md` fresh is the operator's responsibility.
- [ ] `grep -q "eval-probes" evals/README.md` returns success.
- [ ] `crons/eval-weekly.md` body gains a one-line note that CI (`eval-probes` in `ci-harness.yml`) is now the primary regression gate and this cron is a supplemental weekly check for non-PR activity.
- [ ] `CHANGELOG.md` `[Unreleased]` `### Added` contains a one-line entry, imperative mood, referencing #103.

## Functional Requirements

- FR-1: CI MUST run `bash .claude/skills/eval/run.sh` on every PR and on push to `development`/`main` that touches a triggering path.
- FR-2: The pipeline MUST fail when the runner exits non-zero (new green→red regression).
- FR-3: `evals/**` MUST be a path trigger for both `push` and `pull_request`.
- FR-4: The CI eval step MUST NOT commit, push, or otherwise persist the `evals/RESULTS.md` the runner rewrites.
- FR-5: Every currently-PASS probe MUST return PASS or SKIPPED (never ERROR/REGRESSION) when a live runtime dependency is unavailable in CI.
- FR-6: A self-guard probe MUST assert the runner invocation is present in `ci-harness.yml`.

## Non-Goals (Out of Scope)

- Rewriting `.claude/skills/eval/run.sh` or changing the 0/1/2 probe oracle semantics.
- Fixing the pre-existing `next-dev-prod` REGRESSION (unrelated to this PR; it is a pre-existing red that stays unchanged and does not trigger a new regression).
- Fixing the `eval-weekly` cron never-fired operational issue (the CI gate supersedes it as the primary trigger; US-005 only adds a clarifying note to the cron body).
- Adding probes beyond the single self-guard probe.
- Changing the runner's atomic RESULTS.md write behavior.
- Any sandbox application code.

## Technical Considerations

- **Regression semantics**: the runner reads the committed `evals/RESULTS.md` as the baseline (`RESULTS_ORIG`, `run.sh:68-69`) and flags a regression only on a `PASS → (REGRESSION|TIMEOUT|ERROR)` transition (`run.sh:106`). `PASS → SKIPPED` is explicitly NOT a regression — this is why US-002's SKIPPED-in-CI approach is sound and why a pre-existing REGRESSION row (`next-dev-prod`) does not block CI.
- **Tooling**: the runner needs `bash`, `timeout`, `date`, `grep`, `awk`, `sed`, `mktemp` — all present on `ubuntu-latest`. Confirmed no probe shells out to `node`/`jq`/`python`/`ruby`.
- **Concurrency**: `ci-harness.yml` sets `concurrency: cancel-in-progress: true` (lines 41-43); `eval-probes` inherits this, so a rapid force-push can cancel an in-flight eval-probes run just as it does `ci`/`boot-lint`. This is existing, accepted behavior — noted so it isn't mistaken for the gate being skipped maliciously.
- **Interaction with autopilot §6**: autopilot's §6 runs `/eval` on the work branch and may commit `evals/RESULTS.md` (`git add evals/RESULTS.md … || true`). The CI `eval-probes` gate and §6 are not redundant: §6 compares against a possibly-autopilot-updated baseline while CI compares against the committed baseline at the commit under test. The double gate is acceptable; the inconsistent-baseline interaction is documented, not a bug.
- **RESULTS.md-only PR coupling**: adding `evals/**` as a trigger means a PR that only updates `RESULTS.md` will run the full workflow. For a single-developer project this noise is acceptable.
- Add `eval-probes` as a third independent job so a probe failure is attributable and runs in parallel with `ci`/`boot-lint`.

## Success Metrics

- A PR that introduces a green→red probe regression fails the `eval-probes` CI check.
- The `eval-probes` check passes on a clean PR (all rows PASS or SKIPPED; the pre-existing `next-dev-prod` red is unchanged → exit 0).
- The gate cannot be removed without the `eval-ci-gate` probe going red.

## Open Questions

- None — the plan at `/tmp/ship-spec-plan-103.md` plus the two-critic review resolved scope, sequencing, boundaries, and the bootstrap/hermeticity risks.

## Critic synthesis (Stage 4)

Two critics (implementer + user lens) reviewed the pre-revision PRD. Findings and disposition:

- **H — bootstrap circularity / hermeticity unproven (US-003 orig)**: resolved by reordering so US-002 (hermeticity, with a behavioral-proof AC) lands before the blocking job (US-003).
- **H — 16-probe audit scope creep**: resolved by making a `probe-audit.md` classification table a mandatory US-002 deliverable and explicitly enumerating dependency classes.
- **H — `owned-surface-guard` `grep -oP` could ERROR**: resolved by US-002 AC requiring a defensive `grep -P` SKIP guard or a documented confirmation.
- **H — no escape hatch for a false-failing gate**: resolved by US-005 AC documenting the `workflow_dispatch` + follow-up-commit unblock path.
- **M/L — vague node AC, grep quoting, README content depth, RESULTS.md baseline freshness, PASS→SKIPPED silent, concurrency cancel, autopilot §6 double-gate, eval-weekly note**: all folded into the ACs / Technical Considerations / Non-Goals above.
- **Protected paths**: no `.claude/protected-paths.txt` entry is touched (confirmed by both critics). The `eval` skill is protected; `run.sh` is explicitly in Non-Goals.

Recommendation: **PROCEED** — no high-severity finding remains without an AC-level mitigation.
