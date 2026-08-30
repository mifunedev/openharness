# prompt-miner report — 2026-08-11

## Manifest

- generatedAt: 2026-08-11T11:00:24.271Z
- harnessFilter: all
- window: 2026-08-10T11:00:24.271Z → 2026-08-11T11:00:24.271Z
- sessionsScanned: 3
- sessionsRanked: 3
- malformedLines: 0
- sidechainTurnsExcluded: 0
- skippedFiles: 0
- scoreModel: 100 - 35*toolErrorRate - 30*correctionDensity - 20*abandoned - 10*incomplete - 5*turnBloat (+15 ground-truth, capped 100)

## Top 3 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 98.1 | pi | audit | 11 | 1/18 | no | 019fefcc |
| 97.7 | pi | other | 286 | 7/383 | yes | 019fbb50 |
| 95.3 | pi | cron | 9 | 2/15 | no | 019fefc7 |

## Bottom 3 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 95.3 | pi | cron | 9 | 2/15 | no | 019fefc7 |
| 97.7 | pi | other | 286 | 7/383 | yes | 019fbb50 |
| 98.1 | pi | audit | 11 | 1/18 | no | 019fefcc |

## Weakness records

| id | frequency | affected agents | likely harness layer | recommended repair surface | summary |
|---|---|---|---|---|---|
| WH-001 | 3/3 | pi | terminal status | verifier | Recurring tool-call errors surfaced during execution |

