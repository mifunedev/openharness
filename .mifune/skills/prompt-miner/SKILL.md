---
name: prompt-miner
argument-hint: "[--harness all|claude|pi] [--hours <N>] [--since <YYYY-MM-DD>] [--until <YYYY-MM-DD>] [--last-n <N>] [--min-turns <N>] [--top <N>] [--attribution first|all] [--include-prompt-text] [--no-git] [--weights <json>] [--out <dir>] [--report-only] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Grep, Bash, Edit
description: |
  Rank past prompts by session outcome and mine the markers that produce the
  best sessions. Runs the deterministic mine-traces.mjs engine over Claude + Pi
  JSONL traces, scores each session by a friction + ground-truth outcome proxy,
  ranks the initiating prompts, then synthesizes falsifiable prompt markers
  STRATIFIED by session type and proposes harness memory/identity improvements
  behind a /retro-style propose-then-confirm gate. A cross-session, data-driven
  cousin of /retro. TRIGGER when: /prompt-miner invoked, or asked to "mine
  prompts", "rank prompts by outcome", "what prompt patterns work best", "mine
  session traces", "find good prompt markers", "analyze prompt quality".
---

# prompt-miner

Mine the harness's own session history to learn which prompt traits produce the
best sessions, and feed those learnings back into memory/identity. This skill is
the **judgment layer** on top of the deterministic `mine-traces.mjs` engine: the
engine collects, scores, and ranks; this skill correlates prompt features against
outcome, mines **falsifiable markers**, and proposes durable lessons for approval.

It is a cross-session, data-driven cousin of `/retro`. Where `/retro` reflects on
the *current* conversation, `/prompt-miner` reflects on the *corpus* of past
sessions across both harnesses.

> `disable-model-invocation: true` suppresses **auto**-invocation only — the model
> will not fire this skill on its own. A user-typed `/prompt-miner` still runs the
> full body below, including the Step-3 LLM marker synthesis. There is no conflict:
> the deterministic engine produces an objective dataset; the LLM step interprets
> it.

## Privacy contract

This skill reads real session transcripts, which can contain secrets and private
content. The contract is non-negotiable:

- **Default output is feature vectors + metadata only — never raw prompt text.**
  The engine omits `promptText` unless `--include-prompt-text` is passed.
- `--include-prompt-text` applies a redaction pass (line-level token patterns +
  block-level key bodies) and prints a `WARNING` banner. Use it only when you must
  read the prompt wording, and never commit the result.
- All artifacts land in the **gitignored** `memory/<UTC-date>/` directory. Never
  stage, commit, or paste a transcript or an `--include-prompt-text` report.
- The engine never edits `memory/MEMORY.md` or `context/IDENTITY.md`. Only Step 4
  of this skill writes there, and only after explicit `APPROVE`.

## When to use

- `/prompt-miner` invoked to mine the corpus for prompt-quality markers.
- Periodically (the daily `crons/prompt-miner.md` cron drives the unattended path;
  this skill is the interactive path).

## When NOT to use

- **`/retro`** — reflects on the current conversation, not the historical corpus.
  Use `/retro` to close a session; use `/prompt-miner` to learn across sessions.
- **`/context-audit` / `/skill-lint` / `/wiki lint`** — those score harness
  artifacts (context budget, skills, wiki). `/prompt-miner` scores *prompts*.

## Result tag

Announce exactly one human result tag at the end of the run:

```
RESULT: MINING-COMPLETE | DRY-RUN | NO-SESSIONS | NO-CORPUS
```

| Tag | Meaning |
|-----|---------|
| `MINING-COMPLETE` | The engine ran, markers were mined, and the propose-then-confirm gate ran. |
| `DRY-RUN` | `--dry-run` was passed: dataset computed and printed; nothing written; no gate. |
| `NO-SESSIONS` | The engine found zero in-window sessions (`sessionsScanned == 0`). Stop after Step 1. |
| `NO-CORPUS` | Sessions exist, but no session-type stratum reaches the `sessions_supporting ≥ 10` floor (see `references/markers.md`). Report and stop before proposing markers. |

`NO-CORPUS` is distinct from "no markers crossed the bar" (`NO-CANDIDATE`): the
former means the corpus is too small to mine *anything* reliably.

## Steps

### Step 1 — Run the engine

Run the deterministic engine, forwarding the user's arguments verbatim. Use the
**array form** so a `--weights '{...}'` JSON argument stays a single token rather
than being word-split:

```bash
args=($ARGUMENTS)
node "${CLAUDE_SKILL_DIR}/scripts/mine-traces.mjs" "${args[@]}"
```

The engine writes `prompt-miner-<UTC-date>.json` + `.md` to `--out`
(default `memory/<UTC-date>/`), unless `--dry-run` was passed (it prints the JSON
dataset to stdout and writes nothing). The flag surface (defaults in parens):

- `--harness all|claude|pi` (all), `--since`/`--until` (YYYY-MM-DD),
  `--hours N` (precedence over `--since`), `--last-n N`, `--min-turns N` (2),
  `--top N` (15), `--attribution first|all` (first).
- `--include-prompt-text` (off — see Privacy contract), `--no-git` (stub
  ground-truth bonus to 0), `--weights '<json>'`, `--out <dir>`,
  `--report-only`, `--dry-run`, `--max-file-mb N` (50).

If `manifest.sessionsScanned == 0`: announce `RESULT: NO-SESSIONS`, run Step 5
(the log entry), and stop. If `--dry-run` was passed: read the printed dataset,
optionally summarize the top/bottom ranked sessions, announce `RESULT: DRY-RUN`,
run Step 5, and stop (no marker proposals, no memory writes).

### Step 2 — Read the dataset

Read the emitted `prompt-miner-<UTC-date>.json` (or the `--dry-run` stdout). The
shape is documented in `references/report-schema.md`:

- `manifest` — `sessionsScanned`, `sessionsRanked`, `toolErrorsTotal`,
  `malformedLines`, `skippedFiles`, `weights`, `window`, `scoreModel`.
- `sessions[]` — ranked (score desc), each with `score`, `scoreBreakdown`,
  `sessionType`, and a `features` vector (the 13 `markerFeatureKeys`).
- `unranked[]` — `noHumanPrompt` / below-`minTurns` sessions (kept, not ranked).

Verify every score is reconstructable from its `scoreBreakdown` before trusting
the ranking — the score is a **heuristic proxy**, not a verdict (see
`references/scoring.md`; `correctionDensity` is the highest-variance signal).

### Step 3 — Mine markers (stratified by session type)

For each **session-type stratum** (`impl`, `retro`, `query`, `audit`, `cron`,
`other`) — never pooled across types (pooling manufactures Simpson's-paradox
artifacts; see `references/markers.md`) — correlate each feature in
`markerFeatureKeys` against the session `score`. Emit each marker in the exact
falsifiable schema from `references/markers.md`:

```json
{
  "feature": "hasAcceptanceCriteria",
  "direction": "positive",
  "threshold": true,
  "sessions_supporting": 14,
  "sessions_contradicting": 3,
  "effect_size": 0.41
}
```

A marker is **reportable** only when, within a single stratum,
`sessions_supporting ≥ 10` **and** `effect_size ≥ 0.3`.

**Corpus-size gate.** If **no** session type reaches the `sessions_supporting ≥ 10`
floor: announce `RESULT: NO-CORPUS`, report that the corpus is too small to mine
reliably, run Step 5, and stop — do **not** propose markers from a thin corpus. If
strata are large enough but nothing clears both thresholds this run, report
`NO-CANDIDATE` and continue to Step 5 (no memory proposals).

### Step 4 — Propose-then-confirm (mirrors `/retro`)

Only run this step when reportable markers exist and `--report-only` / `--dry-run`
were **not** passed. Translate each reportable marker into a candidate lesson,
then gate it exactly like `/retro` (`.claude/skills/retro/SKILL.md` § 6):

1. **Qualify filter.** Drop any candidate that matches a row in the "What Does NOT
   Go in Memory" table (`.mifune/skills/retro/references/memory-protocol.md`) — secrets, raw output, plans,
   anything re-derivable in under a minute.
2. **Dedup against existing memory.** For each surviving candidate, grep
   `memory/MEMORY.md` and `context/IDENTITY.md` for the same substance; if it is
   already captured, link or skip — never double-write (this is the same dedup
   `/retro` performs in its qualify filter).
3. **Tier classification.** A marker is descriptive ("this corpus shows X prompt
   trait correlates with better `<type>` sessions") → `memory/MEMORY.md`. Only a
   marker that has generalized across many sessions into a prescriptive principle
   ("always include acceptance criteria") earns a `context/IDENTITY.md` proposal —
   and IDENTITY.md is **never** auto-written.
4. **Propose, then wait.** Present the block and stop until the user responds:

   ```
   Proposed MEMORY.md addition(s):
   - YYYY-MM-DD: <lesson> [prompt-miner · <stratum> · effect=<d>, n=<support>] — basis: <one clause>

   Proposed IDENTITY.md addition(s):
   - <prescriptive principle> [prompt-miner · <stratum>] — basis: <one clause>

   Type APPROVE to write, SKIP to discard any item, or EDIT <n> <new text> to revise.
   ```

5. **Write approved items.** On `APPROVE`, append to `memory/MEMORY.md` under
   `## Lessons Learned` (and, if approved, `context/IDENTITY.md` under
   `## Lessons learned (append-only)`). Both files are append-only; never edit
   existing entries. `--report-only` and `--dry-run` skip this step entirely.

Announce `RESULT: MINING-COMPLETE` once the gate has run.

### Step 5 — Append the memory-log entry

Always run this step, on **every** exit path (op, dry-run, no-sessions,
no-corpus). It records the run in the daily log via the helper, which resolves the
shared harness root and serializes the write through `scripts/locked-append.sh`:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/render-log-entry.sh" \
  --result "<MINING-COMPLETE|DRY-RUN|NO-SESSIONS|NO-CORPUS>" \
  --time "$(date -u +%H:%M)" \
  --sessions-scanned "<manifest.sessionsScanned>" \
  --markers-found "<count of reportable markers>" \
  --top-marker "<one-line strongest marker, or 'none'>"
```

The helper writes only to `memory/<UTC-date>/log.md` — never to `MEMORY.md` or
`IDENTITY.md`. Even `--report-only` runs emit this daily-log line (the engine's
`--report-only` contract: report + daily log, but no MEMORY/IDENTITY mutation).

## Anti-patterns

- **Pooling across session types.** Markers MUST be stratified; a marker that holds
  only after pooling is not reportable.
- **Mining a thin corpus.** Below the `sessions_supporting ≥ 10` floor, emit
  `NO-CORPUS` and stop. Do not manufacture noise-driven markers.
- **Committing transcripts.** Artifacts are gitignored; never stage them, and never
  commit `--include-prompt-text` output.
- **Auto-writing memory/identity.** Step 4 is propose-then-confirm. Never write
  `MEMORY.md`/`IDENTITY.md` without an explicit `APPROVE`; never write
  `IDENTITY.md` from a single run's evidence.
- **Word-splitting `--weights`.** Always invoke the engine via the `args=($ARGUMENTS)`
  array form so the JSON stays one token.
- **Skipping the log.** Step 5 runs on every exit path, including `NO-SESSIONS`.

## References

- `references/scoring.md` — the friction + ground-truth scoring model.
- `references/markers.md` — the feature taxonomy + falsifiable marker schema + thresholds.
- `references/report-schema.md` — the emitted JSON/MD dataset shape.
- `references/pi-parity.md` — why `.pi/skills/prompt-miner` needs no byte copy.
