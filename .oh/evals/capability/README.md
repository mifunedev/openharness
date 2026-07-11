# .oh/evals/capability/ — Capability benchmark (the progress ceiling)

This directory is the harness's **progress ceiling**: a stable, graded measure
of *what the harness can DO* end-to-end — not what it *has*. Each task asks for a
concrete deliverable (a shipped PR, a passing eval, a clean retro) and scores how
well the harness actually produced it. A rising suite score is evidence the loop
**got better**; a flat score while machinery grows is its signal to ask a human.

The originating rationale is the **objective anchor**: harness capability is *what the
harness can DO, not what it HAS*. This instrument is the *Capability benchmark* — the
progress ceiling — consumed by the `/benchmark` verdict skill against the counterfactual.
It is distinct from [DeepSWE, the current external reference used when gauging a
newly released coding model](../../docs/model-capability.md); neither instrument
substitutes for the other.

## Ceiling vs. floor

The capability benchmark and the probe suite (`.oh/evals/probes/*.sh`, see
[`../README.md`](../README.md)) are **distinct instruments**, not two views of
the same thing. The probes are the floor; the benchmark is the ceiling.

| | Probe suite (`.oh/evals/probes/`) — the **floor** | Capability benchmark (`.oh/evals/capability/`) — the **ceiling** |
|---|---|---|
| Question | "Did we **break** something?" (don't regress) | "Did we **get better**?" (demonstrated progress) |
| Shape | Binary 3-state oracle (`PASS`/`REGRESSION`/`SKIPPED`) per probe | Graded measure (`PASS`/`PARTIAL`/`FAIL` on 3 axes) per task |
| Scope | Guards a specific **internal** invariant a lesson closed | Measures **end-to-end** capability on a representative task |
| Failure meaning | A known-good state silently rotted | The harness can't (yet) do the whole task well |
| Direction | Must stay green; never wants to *move* | Wants to climb; a flat line is itself a finding |
| Granularity | One invariant, one script | One whole task, run start-to-finish |

A green probe suite means nothing regressed. A rising benchmark means the harness
can do *more*, *cheaper*, with *less hand-holding* than last cycle. You need both:
the floor stops backsliding, the ceiling proves forward motion.

## The three axes

Every benchmark task is scored on three independent axes. Each axis takes one of
`PASS` / `PARTIAL` / `FAIL` (`PASS` is best).

| Axis | Asks | `PASS` | `PARTIAL` | `FAIL` |
|---|---|---|---|---|
| **success** | Did the required artifact get produced? | Deliverable exists and meets the task's acceptance criteria | Produced but incomplete / off-spec | Not produced |
| **cost-time** | How much effort to get there? (lower is better) | Within the task's effort/wall-clock budget, no retries | Over budget or needed retries | Thrashed, abandoned, or blew the budget |
| **unattended** | Did it finish without a human stepping in? | Completed fully autonomously | One human nudge / clarification | Required human takeover to finish |

The axes are deliberately orthogonal: a task can succeed (`success: PASS`) yet be
expensive (`cost-time: PARTIAL`) and need a nudge (`unattended: PARTIAL`). Scoring
all three lets the loop see *which dimension* improved.

## Scoring schema

Map each axis to a number, then average up:

```
PASS = 2   PARTIAL = 1   FAIL = 0

task score  = mean(success, cost-time, unattended)   # 0.0 – 2.0
suite score = mean(task score over all tasks)         # 0.0 – 2.0
```

The **baseline** is established `2026-06-15` by **rubric inspection** — scoring
the real repo state and the most-recent real instance of each task against the
rubric above, by hand. The executable **runner** `run.sh` (see *Runner*) now turns
that inspection into a reproducible, overwrite-per-id scoreboard write.

## Runner

The executable runner `run.sh` (mirroring the `/eval` runner idiom:
`${BASH_SOURCE[0]}` root-resolution, atomic temp-sibling + `mv -f` write) turns
rubric inspection into a reproducible scoreboard write. It is **semi-automated**:
the operator supplies the three axis *values* — the runner validates them against
`{PASS,PARTIAL,FAIL}`, computes the task score, a baseline delta, and the
capability-vs-machinery classification, then atomically overwrites only that
task's row. It **never fabricates a judgment axis** (a missing or out-of-enum
axis exits non-zero and writes nothing) and is **fully task-agnostic** (zero
per-task-id branching, so a held-out task cannot be special-cased).

```bash
# schema self-check against the committed scoreboard
bash .oh/evals/capability/run.sh --validate

# score-preview (no write): print the deterministic task score for a triad
bash .oh/evals/capability/run.sh --success PASS --cost-time PARTIAL --unattended PARTIAL

# re-score a task and overwrite ONLY its row (recomputes the suite-score comment).
# --check runs a success-signal probe and records check=PASS|SKIPPED|FAIL as
# EVIDENCE (never a judgment axis — the operator still supplies the triad);
# --base <ref> compares against a counterfactual; --dry-run previews without writing.
bash .oh/evals/capability/run.sh --task CB-004 \
  --success PARTIAL --cost-time PARTIAL --unattended PARTIAL \
  --check 'bash .oh/evals/probes/repo-map-contract.sh'
```

The row records the three axes, the task score, and a `Δ <delta> <class> vs
<prior> baseline` note: a flat score is classified **machinery-added** (the
anti-Goodhart signal — you built more but the capability didn't move), a risen
score **capability-improved**. Git history is the time series — the runner
overwrites the row, never appends. The `/benchmark` verdict skill reads the
recomputed `suite score = <n>` comment as the ceiling delta versus the counterfactual.

## Layout

| Path | Holds |
|---|---|
| `README.md` | This spec — the instrument, axes, schema, and discipline. |
| `run.sh` | The executable runner (see *Runner*): validates operator-supplied axes, scores, computes the baseline delta + machinery-vs-capability class, and overwrites the task's row. |
| `tasks/CB-NNN-<slug>.md` | One spec per benchmark task: its deliverable, the per-axis rubric, and a pointer to the most-recent real instance. `NNN` is a zero-padded, never-reused id. |
| `repo-orientation/tasks.json` | Held-out workload manifest for CB-004 repo-orientation A/B scoring. |
| `RESULTS.md` | The scoreboard. House style mirrors [`../RESULTS.md`](../RESULTS.md): one row per task id, **overwrite the row** each run — git history is the time series, not appended rows. |

A task spec may additionally cite concrete verifiable instances from the **datasets corpus** at [`../datasets/`](../datasets/) via an optional `datasets:` frontmatter array (e.g. `datasets: [DS-001, DS-002]`); the `datasets-schema` probe checks every such ref resolves to a real example folder.

## Held-out discipline (anti-Goodhart)

The benchmark only measures progress if it stays an *honest* target. Two rules
keep it honest:

- **The task set is held-out.** You do **not** tune the harness *to* the
  benchmark. Improvements target the harness's general capability; the benchmark
  observes the result. Special-casing the harness to ace `CB-003` corrupts the
  instrument and is forbidden.
- **Never delete a task to inflate the score.** A `FAIL` is the benchmark working
  as intended — it found a capability the harness lacks. Removing a hard task to
  lift the average is the cardinal sin here. **Adding** a task is a deliberate,
  reviewed act (a new representative capability worth measuring) — the only
  sanctioned way the set changes.

## Redirect signal

The benchmark is also the loop's one tap on the human's shoulder. If the **suite
score does not move over N cycles** while the harness keeps adding machinery
(skills, rules, probes), the harness flags itself for **human redirect** — the
single external vote that can say "you are building the wrong thing". A flat ceiling under
growing complexity means the harness is busy but not *better*; only a human re-aims it.

## Non-scope (be honest about what this is)

This **stands up the instrument, a hand-scored baseline, and a semi-automated
runner — but not a live gate.** Stated plainly so no one mistakes it for one:

- The runner is **semi-**automated by design. `run.sh` scores and overwrites rows
  from **operator-supplied, validated** axis values and the `/benchmark` verdict
  skill consumes its output — but the judgment axes are **not** auto-decided
  (that is why the operator supplies them; `--check` records a probe result only
  as *evidence*, never as an axis). Fully-automatic judgment scoring is a
  deliberate non-goal.
- It is **not wired into any gate.** Nothing fails CI, blocks a merge, or gates a
  PR on the benchmark delta today.
- The loop `benchmark` node, `/eval`-gating on the score delta, and `selection`
  ranking work by projected benchmark impact are all **explicit follow-ons** —
  they do not exist on this branch.

When those land, this README is the contract they build against.
