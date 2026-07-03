# prompt-miner — Report Schema

`mine-traces.mjs` emits two artifacts to `--out` (default `.oh/memory/<UTC-date>/`):

- `prompt-miner-<UTC-date>.json` — the full dataset (below).
- `prompt-miner-<UTC-date>.md` — manifest + ranked top-N / bottom-N table.

`--dry-run` prints the JSON dataset to stdout and writes nothing. Default output
contains **feature vectors + metadata only — never raw prompt text**;
`--include-prompt-text` adds a redacted `promptText` field per session and prints
a `WARNING` banner to stderr. `--report-only` writes the report only and never
mutates `.oh/memory/MEMORY.md` / `.oh/context/IDENTITY.md` — the engine never edits those
regardless; the flag documents that contract for the SKILL layer.

## Top-level dataset

```jsonc
{
  "manifest": { ... },          // run metadata (below)
  "markerFeatureKeys": [ ... ], // the 13 feature keys (see markers.md)
  "sessions": [ ... ],          // ranked sessions (score desc), human-prompted, turns >= minTurns
  "unranked": [ ... ]           // noHumanPrompt or below-minTurns sessions, same shape
}
```

## `manifest`

| Field | Notes |
|-------|-------|
| `generatedAt` | ISO timestamp (injectable via `--now` / `PROMPT_MINER_NOW` for determinism) |
| `harnessFilter` | `all` \| `claude` \| `pi` |
| `window` | `{ start, end }` (ISO or `null`); `--hours` takes precedence over `--since` |
| `sessionsScanned` | sessions in-window after dedupe |
| `sessionsRanked` | ranked subset (`!noHumanPrompt` and `turns >= minTurns`) |
| `toolErrorsTotal` / `toolResultsTotal` | corpus totals (the schema-compat probe asserts `toolErrorsTotal > 0`) |
| `malformedLines` | unparseable JSONL lines tolerated (never thrown) |
| `skippedFiles` | files over `--max-file-mb` (separate counter from `malformedLines`) |
| `weights` | effective friction weights |
| `scoreModel` | the formula string |
| `includePromptText`, `reportOnly`, `minTurns`, `attribution` | echoed run flags |

## `sessions[]` / `unranked[]`

```jsonc
{
  "sessionId": "...",
  "harness": "claude" | "pi",
  "gitBranch": "feat/..." | null,
  "window": { "firstTs": "ISO", "lastTs": "ISO" },
  "turns": 7,
  "humanPromptCount": 2,
  "assistantTurns": 3,
  "toolResults": 4,
  "toolErrors": 1,
  "lastAssistantStop": "end_turn",
  "abandoned": 0,
  "incomplete": 0,
  "noHumanPrompt": false,
  "sessionType": "impl",          // null when noHumanPrompt
  "score": 82.5,
  "scoreBreakdown": {             // see scoring.md
    "base": 82.5,
    "groundTruthBonus": 0,
    "groundTruthReason": "git-stubbed (--no-git)",
    "signals":   { "toolErrorRate": 0.5, "correctionDensity": 0, "abandoned": 0, "incomplete": 0, "turnBloat": 0 },
    "penalties": { "toolErrorRate": 17.5, "correctionDensity": 0, "abandoned": 0, "incomplete": 0, "turnBloat": 0 },
    "weights":   { "toolErrorRate": 35, "...": "..." }
  },
  "groundTruth": { "hasBonus": false, "reason": "git-stubbed (--no-git)" },
  "features": { "lenChars": 48, "...": "..." },   // null when noHumanPrompt
  "totalInputTokens": 230,
  "totalOutputTokens": 110,
  "promptText": "...redacted..."  // present only with --include-prompt-text
}
```

## See Also

- `scoring.md` — the `scoreBreakdown` math.
- `markers.md` — the `markerFeatureKeys` / `features` taxonomy.
