# prompt-miner — Scoring Contract

The friction + ground-truth model `mine-traces.mjs` implements. This is a
**heuristic outcome proxy**, not a verdict — validate markers before trusting them
(see `markers.md`).

## Formula

```
friction = 100
  − 35 * toolErrorRate      (clamped 0..1)
  − 30 * correctionDensity  (clamped 0..1)
  − 20 * abandoned          (0 | 1)
  − 10 * incomplete         (0 | 1)
  −  5 * turnBloat          (clamped 0..1)
score = clamp(friction + groundTruthBonus, 0, 100)
```

Each coefficient is a `--weights` key (see *Weights* below). The `scoreBreakdown`
object on every session records `base`, `groundTruthBonus`, `groundTruthReason`,
the raw `signals`, the per-signal `penalties`, and the `weights` used — so every
number is reconstructable.

### Sub-signal definitions

| Signal | Definition |
|--------|------------|
| `toolErrorRate` | `toolErrors / toolResults` (0 when no tool results). |
| `correctionDensity` | corrective human follow-ups (all human prompts after the first matching the negation lexicon) ÷ total human prompts. **Highest-variance signal** — casual clarifications fire the lexicon; calibrate against a hand-labeled sample before trusting it. |
| `abandoned` | `1` if the last assistant turn's stop is `aborted` (Pi), else `0`. |
| `incomplete` | `1` if there is no clean final assistant turn (stop ∉ {`end_turn`, `stop`}) and the session is not `abandoned`; a session with no assistant turn at all counts as incomplete. |
| `turnBloat` | `clamp((assistantTurns − K) / K, 0, 1)`, `K = 40`. |

### Negation lexicon (correctionDensity)

`no`, `wrong`, `revert`, `undo`, `actually`, `stop`, `don't`, `instead`,
`not what`, `that's not`, `try again`, `fix`. Single words match on word
boundaries; phrases match as substrings (case-insensitive).

## Ground-truth bonus (+15, total capped at 100)

A session earns the bonus when **either**:

1. a PR URL `github.com/<owner>/<repo>/pull/<n>` appears in assistant text, **or**
2. (unless `--no-git`) a commit on `origin/development` falls within the
   session's `[firstTs, lastTs]` window (proxy for "this session shipped").

The engine runs `git fetch origin development --depth=200` once, then
`git log --format=%ct origin/development -n 200`. The cross-ref is against
**`origin/development` only** — never `upstream`. `--no-git` stubs the bonus to
`0` for CI/tests and offline runs (it suppresses the PR-URL bonus too, so the
stub is total and deterministic).

## Per-harness JSON paths

| Concept | Claude (`type`) | Pi (`type==="message"`) |
|---------|-----------------|--------------------------|
| Human prompt | `type==="user"` ∧ `message.role==="user"` ∧ `userType==="external"` ∧ `typeof message.content === "string"` ∧ `isMeta !== true` ∧ `!content.startsWith("<")` ∧ `promptSource !== "sdk"` (when present) | `message.role==="user"`; text = `message.content[].text` joined |
| Tool result / error | `message.content` is array; error = element `.type==="tool_result"` ∧ `.is_error===true` (**nested**) | `message.role==="toolResult"`; error = `message.isError===true` (real shape) **or** `message.toolResult.isError===true` (documented shape) |
| Assistant completion | `message.stop_reason` (`end_turn` = clean) | `message.stopReason` (`stop` = clean, `aborted` = abandoned) |
| Session id | top-level `.sessionId` | `session` line `.id` (fallback: filename uuid segment) |
| Branch | top-level `.gitBranch` | none (Pi has no branch → no commit-window bonus) |
| Timestamp | top-level `.timestamp` (ISO) | top-level `.timestamp` (ISO) |

Array-valued Claude `message.content` on a `user` line is **tool results, not a
prompt**. There is no top-level `is_error` and the engine deliberately ignores
the `pr-link` line type.

## Weights

`--weights '<json>'` overrides the coefficients. Validation rules: the value must
be a JSON object; **every** required key must be present
(`toolErrorRate`, `correctionDensity`, `abandoned`, `incomplete`, `turnBloat`,
`groundTruthBonus`); each value must be a finite non-negative number; any unknown
key is an error. Pass it as a single shell token (the SKILL.md uses
`args=($ARGUMENTS)` array form so the JSON is not word-split).

## Why `.mjs`, not `jq`

`jq` 1.6 is installed but inadequate here: the task is a **cross-session stateful
join** (dedupe + merge resumed sessions by id across files), with **weighted
scoring**, **dual-schema normalization** (Claude vs. Pi), a **redaction pass**,
and an **optional `git` shell-out** for ground truth. Expressing that in jq would
be unreadable and untestable; a zero-dependency Node engine with `node --test`
unit coverage is the maintainable choice. The `git` binary is the one allowed
external dependency, documented here and gated behind `--no-git`.

## See Also

- `markers.md` — the falsifiable marker schema the scores feed.
- `report-schema.md` — the emitted JSON/MD shape.
