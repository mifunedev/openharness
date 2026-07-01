# .oh/evals/capability/ — Capability benchmark (the progress ceiling)

This directory is the harness's **progress ceiling**: a stable, graded measure
of *what the harness can DO* end-to-end — not what it *has*. Each task asks for a
concrete deliverable (a shipped PR, a passing eval, a clean retro) and scores how
well the harness actually produced it. A rising suite score is evidence the loop
**got better**; a flat score while machinery grows is its signal to ask a human.

The originating rationale is the **objective anchor**: harness capability is *what the
harness can DO, not what it HAS*. This instrument is the *Capability benchmark* — the
progress ceiling — consumed by the `/benchmark` verdict skill against the counterfactual.

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
rubric above, by hand. There is no automated runner yet (see *Non-scope*).

## Layout

| Path | Holds |
|---|---|
| `README.md` | This spec — the instrument, axes, schema, and discipline. |
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

## Non-scope (be honest about what this v1 is)

This v1 **stands up the instrument and a hand-scored baseline — nothing more.**
Stated plainly so no one mistakes it for a live gate:

- It does **not** auto-run. There is no `/benchmark` skill yet; scoring is
  rubric inspection by a human/orchestrator. A `/benchmark` skill (or an `/eval`
  extension) that runs and scores tasks automatically is a **follow-on**.
- It is **not wired into any gate.** Nothing fails CI, blocks a merge, or gates a
  PR on the benchmark delta today.
- The loop `benchmark` node, `/eval`-gating on the score delta, and `selection`
  ranking work by projected benchmark impact are all **explicit follow-ons** —
  they do not exist on this branch.

When those land, this README is the contract they build against.
