# evals/ — Context fitness-function probe corpus

This directory is the harness's **fitness function**: a corpus of deterministic
**probes** that turn lessons into runnable, exit-code-scored checks against
*real state*. A rectification is provably "done" when its probe is green; a
recurrence surfaces as a was-green-now-red regression. See
`tasks/context-fitness-evals/prd.md` for the full design and `context/rules/memory.md`
for how lessons map to probes.

## Subfolders

| Path | Holds |
|------|-------|
| `probes/` | One `<id>.sh` per probe (Tier-A deterministic + `ablation`). |
| `RESULTS.md` | The benchmark scoreboard — current status per probe id (see schema below). |

## Probe contract

A probe is an executable shell script at `evals/probes/<id>.sh` with a
**3-state exit-code oracle**:

| Exit | Meaning | Counts toward benchmark? |
|------|---------|--------------------------|
| `0` | **PASS** — desired state present / bad condition absent | yes (pass) |
| `1` | **REGRESSION** — the bad condition is present | yes (fail) |
| `2` | **SKIPPED** — not applicable in this environment (e.g. target sandbox absent) | no — neither pass nor regression |

Exit `0` when a probe *cannot verify anything* (e.g. an absent sandbox) is
**forbidden** — use `2` so a silent green never masks an unverifiable check.
Any other non-zero exit is treated as an error (non-PASS). `stderr` MUST carry a
one-line human reason for the result.

### Probe header (metadata)

Every probe declares three comment lines (the runner extracts them with the
exact contract `grep -E '^# (tier|source|desc):'`):

```sh
#!/usr/bin/env bash
# tier: A          # A | ablation
# source: memory/MEMORY.md 2026-06-04   # the lesson/rule this probe closes
# desc: public mifune.dev is not served by `next dev`
set -euo pipefail
# ... inspect REAL state (running processes, actual files, live sandbox) — never mocks ...
```

Probes MUST inspect real state/artifacts, never synthetic fixtures — except
hook-unit-test probes, which use the documented file-fixture driver pattern
(test driver written to a script file, sensitive tokens in shell variables).

A probe that references repo files MUST resolve the repo root from
`${BASH_SOURCE[0]}` — never cwd, never a hard-coded absolute path. `/eval` runs
probes from an arbitrary working directory, so the canonical preamble is:

```sh
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # evals/probes/<id>.sh -> root
```

### Timeout

Every probe must complete within a bounded time; the `/eval` runner wraps each
in `timeout` (default 30s) and marks a hung probe `TIMEOUT` (non-PASS).

## RESULTS.md schema

`RESULTS.md` is the benchmark. Policy: **overwrite the current-status row per
probe id**; git history is the time series (no unbounded append). On the first
run (no prior rows) every probe is emitted as `new-pass`/`new-fail` and NO
`REGRESSION` is raised without a prior state.

| Column | Meaning |
|--------|---------|
| `probe` | probe id (`<id>` of `evals/probes/<id>.sh`) |
| `tier` | `A` \| `ablation` |
| `last-run (UTC)` | timestamp of the most recent `/eval` that ran it |
| `status` | `PASS` \| `REGRESSION` \| `SKIPPED` \| `TIMEOUT` |
| `source` | the lesson/rule the probe closes |

## Correction-surface triage

Not every lesson becomes a probe. Route each lesson to the **cheapest reliable
surface** first:

| Surface | Use when | Artifact |
|---------|----------|----------|
| **harden** | the lesson is a guardrail | a hook + a unit-test probe |
| **proceduralize** | the lesson is a technique | a skill step + a doc-lint probe |
| **eval** | genuine judgment residue only | (Tier-B — deferred; never a hard gate in v1) |

## Runner

`/eval` (`.claude/skills/eval/`) discovers `evals/probes/*.sh`, runs each, and
writes `RESULTS.md`. The scoreboard is **built into a temp sibling file
(`RESULTS.md.tmp.$$`) and swapped in with a single atomic `mv -f`** — never
truncated-then-appended in place — so a crash or concurrent run can never leave a
partially-written scoreboard. Carry-forward rows for probes not run this
invocation are read from a pre-write snapshot of the original file taken before
the rewrite, never from the live file being replaced, so a filtered run cannot
erase untouched rows. A weekly cron (`crons/eval-weekly.md`) runs it unattended.

### Runner aggregate exit code

The runner's **aggregate** exit code is distinct from the per-probe 3-state
oracle (the `| Exit | Meaning |` table in [Probe contract](#probe-contract)
above, which governs individual probe results).

| Exit | Meaning |
|------|---------|
| `0` | No new green→red regressions this run. Pre-existing `REGRESSION` rows whose status is unchanged do **not** trigger a non-zero exit. |
| `1` | One or more probes transitioned from a prior `PASS` to `REGRESSION` in this run. |

This `0`/`1` contract is what the autopilot §6 eval gate and the
`eval-weekly` cron rely on when checking whether a run is clean.

## CI gate (`eval-probes`)

The probe suite is wired into `.github/workflows/ci-harness.yml` as a third
independent job, **`eval-probes`** (display name "Eval Probe Regression Gate"),
running in parallel with `ci` and `boot-lint`. Its sole substantive step runs
`bash .claude/skills/eval/run.sh` (the unfiltered runner), and the job — and so
the pipeline — fails **iff** the runner exits non-zero (a new green→red
regression this run). This makes the suite a live PR-time guardrail instead of a
manual-`/eval`-only check.

- **Triggers.** Runs on every pull request and on every push to
  `development`/`main` whose changed paths match the workflow's path filters.
  `evals/**` is one of those filters, so probe and `RESULTS.md` edits gate
  themselves.
- **Git read-only.** The runner rewrites `evals/RESULTS.md` in the writable
  checkout (expected), but the job gates **purely on the exit code** — it has no
  `git add`/`commit`/`push` step, so the CI run never persists that churn back to
  the branch.
- **Escape hatch.** There is no merge-bypass label. To unblock a probe that is
  false-failing CI, either (a) re-run the job — via the workflow's
  `workflow_dispatch` trigger (Actions → "CI: Harness" → Run workflow) or by
  re-running the failed check from the PR's Checks tab — if the failure was
  transient, or (b) push a follow-up commit that fixes the offending probe, or
  temporarily removes/SKIPs it (restoring it in a later commit).

The `eval-ci-gate` self-guard probe asserts the runner invocation is still
present in `ci-harness.yml`, so the gate itself cannot be silently deleted.

### Known limitation: `PASS→SKIPPED` is silent in CI

A probe that is `PASS` in the committed `RESULTS.md` baseline but `SKIPPED`
(exit 2) in a cold CI runner — no docker/tmux/cron-system/live process — is
**not** a regression: `run.sh:106` flags only a `PASS → REGRESSION|TIMEOUT|ERROR`
transition. This is exactly what keeps the gate hermetic, but it also means a
probe that should be exercising real state can silently degrade to a no-op in CI
without failing the gate. Keeping the committed `RESULTS.md` fresh — so the
baseline reflects each probe's true status — is the **operator's
responsibility**; the `eval-probes` job does not commit or refresh it.
