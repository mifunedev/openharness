---
name: benchmark
description: >-
  Progress-ceiling verdict gate (part of `/spec execute`'s improve tail) — decide whether ONE
  landed change was actually BENEFICIAL (moved or held the capability-benchmark
  ceiling without breaking the regression floor, and is worth its complexity),
  then emit a single BENEFICIAL/NOT-BENEFICIAL verdict. Composes (never forks)
  the existing instruments: /eval (the regression floor — probes stay green) +
  the capability-benchmark ceiling delta (.oh/evals/capability/RESULTS.md vs. the
  counterfactual). Machinery added with no benchmark movement is NOT-BENEFICIAL
  by definition. Distinct from /audit (per-unit promotability =
  floor) — this is the ceiling: did the harness get BETTER, not just not-broken.
  TRIGGER when: a change has landed and the loop needs a benefit-vs-counterfactual
  verdict before the cycle repeats; the improve tail of `/spec execute`
  runs; "was <change> beneficial", "score the capability benchmark", "benchmark
  this cycle".
argument-hint: "[--base <ref>] [--cycles <N>]"
---

# Benchmark — progress-ceiling verdict gate

The **benchmark** gate, part of `/spec execute`'s improve tail in `AGENTS.md § The
Workflow`. It answers one question: *was this change actually beneficial — did it
move or hold the capability ceiling without breaking the regression floor, and is
it worth its complexity?* — and emits exactly one verdict.

**Core principle: compose, don't re-derive — and judge OUTCOMES, not machinery.**
This skill owns the *verdict*, not the instruments. The regression floor is
`/eval`; the progress ceiling is the capability benchmark (`.oh/evals/capability/`).
`/benchmark` runs both and integrates them into a single `BENEFICIAL` /
`NOT-BENEFICIAL`. *Adding machinery is not progress* — a change
that grows the harness but does not move the capability benchmark is
`NOT-BENEFICIAL` **by definition**.

> **Not `/audit`.** `/audit` is the per-unit *floor* gate (does this one impl
> satisfy its task graph and is it promotable?). `/benchmark` is the *ceiling*
> gate (did the harness get **better**?). Distinct instruments, distinct
> question — see `.oh/evals/capability/README.md` § *Ceiling vs. floor*. `/benchmark`
> *consults* `/eval`; it does not replace or fork it.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `--base <ref>` | The counterfactual to score against — the state *without* this change. Defaults to the merge-base with `development` (i.e. "the repo before this change"). |
| `--cycles <N>` | Window for the redirect signal (§ *Redirect signal*). Default **3**: a benchmark flat for `N` consecutive cycles while machinery grows trips the human-redirect flag. |

---

## The two signals (fail-fast, in order)

Run in order; the **first** signal that decides `NOT-BENEFICIAL` ends the gate.
Only when **both** signals clear is the verdict `BENEFICIAL`. A signal that is
missing or ambiguous is treated as NOT-BENEFICIAL, never as beneficial
(honest exits).

### Signal 1 — Regression floor (`/eval`)

A change that breaks the floor is never beneficial, whatever it claims to add.
Run the runner and gate on its **exit code + delta**, not its prose:

```bash
bash .claude/skills/eval/run.sh ; rc=$?
# rc=0 → no NEW green→red regression this run
# rc=1 → at least one new green→red regression → NOT-BENEFICIAL (floor broken)
```

A new `green→red` regression or a non-zero runner exit is an immediate
`NOT-BENEFICIAL` → `repeat` (after revert). A pre-existing red with an unchanged
delta is non-gating but MUST be disclosed in the verdict. (Same floor gate
`/audit` uses; here it is necessary-not-sufficient — the floor staying green is
the price of entry, not the proof of benefit.)

### Signal 2 — Capability-ceiling delta (counterfactual)

The change must move **or hold-with-justification** the capability-benchmark
suite score versus the counterfactual (the `--base` state). Read the ceiling:

```bash
# suite score lives in .oh/evals/capability/RESULTS.md (the scoreboard comment line)
grep -oE 'suite score = [0-9.]+' .oh/evals/capability/RESULTS.md | head -1     # this change
git show "${BASE:-development}":.oh/evals/capability/RESULTS.md \
  | grep -oE 'suite score = [0-9.]+' | head -1                              # counterfactual
```

Decide on the delta (v1 is rubric inspection — the instrument has no auto-runner
yet, see `.oh/evals/capability/README.md` § *Non-scope*):

| Ceiling delta vs. counterfactual | Verdict |
|---|---|
| Suite score **rose**, or a task axis improved (`FAIL→PARTIAL→PASS`) | `BENEFICIAL` |
| Score **held** AND the change demonstrably delivered its stated capability at acceptable cost (a deliberate floor-hardening / instrument / docs change that a capability task credits) | `BENEFICIAL` (justified hold) |
| Score **flat** AND the change only added machinery (new skill/rule/probe) with **no** capability task crediting it | `NOT-BENEFICIAL` — "machinery without benchmark movement" |
| Score **fell** | `NOT-BENEFICIAL` — the change regressed the ceiling |

> **Instrument grooming (`/eval-lint`).** A faithful ceiling needs a sharp
> instrument: stale probes retired, coverage gaps surfaced, an anti-Goodhart
> holdout. That grooming is `/eval-lint` — a **named follow-on** that is
> not yet built. Until it exists, note in the verdict that the instrument was
> not groomed this cycle; do **not** silently skip it.

---

## Verdict

| Both signals clear | Either signal fails |
|---|---|
| `BENEFICIAL` → `repeat` | `NOT-BENEFICIAL` → `repeat` (after revert) |

State the verdict with the two signal results (floor `rc` + ceiling delta), then
— on the **final line** — emit the routing token.

**On `NOT-BENEFICIAL`, the change is reverted before the cycle repeats** (`→ repeat`
*after revert*). Like `/audit`, this skill is **read-only**: it decides and names
the exact remediation; the operator performs it. Surface the revert
command for the change under evaluation, e.g.:

```bash
git revert --no-edit <merge-or-commit-sha>     # undo the not-beneficial change, then → repeat
```

A `BENEFICIAL` change is kept and the cycle advances to `repeat` (the freshness
gate), which closes back to `ideate`.

---

## Redirect signal — the one external vote

The benchmark is also the harness's single tap on a
human's shoulder. If the capability suite score has **not moved over `--cycles N`
consecutive cycles** while the harness kept adding machinery, the loop is busy but
not *better* — emit the verdict as normal **and** print a `REDIRECT-FLAG` line
recommending human re-aim. This never blocks routing (it is advisory), but it MUST
be surfaced, not swallowed:

```
REDIRECT-FLAG: capability suite score flat at <X.XX>/2.00 for <N> cycles while N skills/probes were added — recommend human redirect.
```

---

## What this skill does NOT do

- **Score the floor as the ceiling.** A green probe suite is necessary, not
  sufficient. Benefit is the *capability* delta, not "nothing broke".
- **Mutate.** No revert, no commit, no merge — it emits the verdict and names the
  revert; the runner/operator acts (single-owner handoff: decided here, acted on elsewhere).
- **Fork `/eval` or the instrument.** It composes both; it never reimplements the
  probe runner or re-authors the capability tasks.
- **Tune the harness to the benchmark.** The task set is held-out
  (`.oh/evals/capability/README.md` § *Held-out discipline*); special-casing to ace a
  task corrupts the instrument.

---

## Memory Protocol

After a run, append to `.oh/memory/<UTC-date>/log.md` per `.oh/skills/retro/references/memory-protocol.md`:

```markdown
## benchmark -- HH:MM UTC
- **Result**: OP
- **Verdict**: BENEFICIAL | NOT-BENEFICIAL (signal <1|2>: <reason>)
- **Floor**: /eval rc=<0|1> (<new green→red?>)
- **Ceiling**: suite <X.XX> vs base <Y.YY> (<delta>)
- **Redirect**: none | REDIRECT-FLAG (<N> flat cycles)
- **Observation**: <one sentence>
```
