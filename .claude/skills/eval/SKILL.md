---
name: eval
description: >-
  Run the context fitness-function probe suite (evals/probes/*.sh) against real
  state and write the evals/RESULTS.md benchmark. Each probe is a deterministic
  3-state oracle (PASS/REGRESSION/SKIPPED); a green→red transition is surfaced as
  a REGRESSION naming the lesson it closes. Tier-B behavioral evals are out of scope.
  TRIGGER when: asked to run evals, check the probe suite, "run /eval", verify a
  lesson's probe is green, benchmark the harness, or before/after editing a
  rule/skill that a probe guards.
---

# Eval

The runner for the harness **fitness function**. It discovers `evals/probes/*.sh`,
runs each against *real state*, and writes the `evals/RESULTS.md` scoreboard. A
rectification is provably "done" when its probe is green; a recurrence shows up as
a **REGRESSION** (was-PASS, now-fail) naming the `# source:` lesson. The full
contract — 3-state exit oracle, header convention, correction-surface triage — is
in [`evals/README.md`](../../../evals/README.md).

## Usage

```bash
bash .claude/skills/eval/run.sh                 # run the whole suite, rewrite RESULTS.md
bash .claude/skills/eval/run.sh --probe <id>    # run one probe, update only its row
bash .claude/skills/eval/run.sh --tier A        # run only Tier-A probes
```

Exit-code oracle (per probe): `0`=PASS, `1`=REGRESSION, `2`=SKIPPED (not
applicable — excluded from pass-rate), `124`=TIMEOUT, other=ERROR. Each probe is
wrapped in `timeout 30s`.

## What the runner does

1. **Recover orphaned ablation backups** (M-2): if `evals/.ablation-active`
   exists from a crashed ablation, restore each `<target>.bak` before running.
2. **Discover + run** every probe matching the filters; extract `# tier:` /
   `# source:` via the exact header grep.
3. **Compute the delta** vs the prior `RESULTS.md` row. **First run** (no prior
   row) emits `new-pass`/`new-fail` and raises NO regression without prior state.
4. **Surface regressions** — any `PASS → (REGRESSION|TIMEOUT|ERROR)` transition is
   printed first, naming the probe's `source`.
5. **Rewrite `RESULTS.md`** — overwrite the row for each probe run; carry prior
   rows for probes not run this invocation (so the scoreboard stays complete).

## Ablation (added by US-006)

`run.sh --ablate <context-file> --probe <id>` runs a probe with and without a
target rule/memory file loaded (reusing `scripts/ablate.sh`'s swap/restore/trap
mechanics — NOT the `claude -p` oracle) and reports `LOAD-BEARING` (regression on
removal) or `PRUNABLE`. This is the prune-half of the fitness function. See
US-006 in `tasks/context-fitness-evals/prd.md`.

## When NOT to use

- **Tier-B behavioral evals** (sub-agent + LLM-judge of judgment-call behavior)
  are deferred — `/eval` is deterministic only. Never hard-gate on a noisy metric.
- For *scoring* context files for staleness/budget, that is `/context-audit` and
  `/skill-lint` — `/eval` checks behavior/state, not prose quality.

## Memory Protocol

After a run, append to `memory/<UTC-date>/log.md` per `context/rules/memory.md`:

```markdown
## eval -- HH:MM UTC
- **Result**: OP
- **Ran**: <n> probes (<p> PASS / <r> REGRESSION / <s> SKIPPED)
- **Regressions**: <named, or none>
- **Observation**: <one sentence>
```
