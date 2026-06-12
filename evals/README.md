# evals/ — Context fitness-function probe corpus

This directory is the harness's **fitness function**: a corpus of deterministic
**probes** that turn lessons into runnable, exit-code-scored checks against
*real state*. A rectification is provably "done" when its probe is green; a
recurrence surfaces as a was-green-now-red regression. See
`context/rules/memory.md` for how lessons map to probes.

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
# source: issue #410   # the lesson/rule this probe closes
# desc: /eval run.sh exits non-zero when a prior PASS regresses
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
writes `RESULTS.md`. Run it manually when validating a change, or wire it into a
site-specific cron only after deciding that scheduled evals should be enabled for
that installation.

### Runner aggregate exit code

The runner's **aggregate** exit code is distinct from the per-probe 3-state
oracle (the `| Exit | Meaning |` table in [Probe contract](#probe-contract)
above, which governs individual probe results).

| Exit | Meaning |
|------|---------|
| `0` | No new green→red regressions this run. Pre-existing `REGRESSION` rows whose status is unchanged do **not** trigger a non-zero exit. |
| `1` | One or more probes transitioned from a prior `PASS` to `REGRESSION` in this run. |

This `0`/`1` contract is the gate callers should use when deciding whether a run
is clean.
