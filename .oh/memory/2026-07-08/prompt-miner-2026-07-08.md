# prompt-miner report — 2026-07-08

## Manifest

- generatedAt: 2026-07-08T11:00:38.404Z
- harnessFilter: all
- window: 2026-07-07T11:00:38.404Z → 2026-07-08T11:00:38.404Z
- sessionsScanned: 2
- sessionsRanked: 2
- malformedLines: 0
- skippedFiles: 0
- scoreModel: 100 - 35*toolErrorRate - 30*correctionDensity - 20*abandoned - 10*incomplete - 5*turnBloat (+15 ground-truth, capped 100)

## Top 2 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 100.0 | pi | audit | 606 | 24/689 | yes | 019f3f8c |
| 94.2 | pi | other | 80 | 3/92 | no | 019f3fe9 |

## Bottom 2 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 94.2 | pi | other | 80 | 3/92 | no | 019f3fe9 |
| 100.0 | pi | audit | 606 | 24/689 | yes | 019f3f8c |

## Weakness records

| id | frequency | affected agents | likely harness layer | recommended repair surface | summary |
|---|---|---|---|---|---|
| WH-001 | 2/2 | pi | terminal status | verifier | Recurring tool-call errors surfaced during execution |

