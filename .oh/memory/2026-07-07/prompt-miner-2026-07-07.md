# prompt-miner report — 2026-07-07

## Manifest

- generatedAt: 2026-07-07T11:00:22.542Z
- harnessFilter: all
- window: 2026-07-06T11:00:22.542Z → 2026-07-07T11:00:22.542Z
- sessionsScanned: 14
- sessionsRanked: 14
- malformedLines: 0
- skippedFiles: 0
- scoreModel: 100 - 35*toolErrorRate - 30*correctionDensity - 20*abandoned - 10*incomplete - 5*turnBloat (+15 ground-truth, capped 100)

## Top 14 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 100.0 | claude | audit | 317 | 5/137 | yes | 0ee4f14f |
| 100.0 | claude | other | 187 | 1/69 | yes | e005fa06 |
| 98.8 | pi | other | 33 | 2/59 | no | 019f3aa4 |
| 98.8 | pi | audit | 47 | 1/75 | no | 019f3a8e |
| 98.5 | pi | audit | 45 | 2/70 | no | 019f3aac |
| 98.3 | pi | audit | 45 | 2/60 | no | 019f3a96 |
| 97.5 | pi | audit | 35 | 5/69 | no | 019f3ab6 |
| 97.3 | pi | audit | 31 | 4/51 | no | 019f3abc |
| 95.9 | pi | audit | 38 | 7/60 | no | 019f3ac2 |
| 92.8 | pi | other | 64 | 11/88 | no | 019f3a90 |
| 92.5 | pi | audit | 119 | 10/138 | no | 019f3a02 |
| 88.5 | claude | other | 264 | 5/119 | yes | 81c2ae51 |
| 88.4 | claude | audit | 408 | 8/175 | yes | 440d2c2f |
| 80.0 | pi | other | 2 | 0/0 | no | 019f382d |

## Bottom 14 sessions

| score | harness | type | turns | toolErr | gt | session |
|---|---|---|---|---|---|---|
| 80.0 | pi | other | 2 | 0/0 | no | 019f382d |
| 88.4 | claude | audit | 408 | 8/175 | yes | 440d2c2f |
| 88.5 | claude | other | 264 | 5/119 | yes | 81c2ae51 |
| 92.5 | pi | audit | 119 | 10/138 | no | 019f3a02 |
| 92.8 | pi | other | 64 | 11/88 | no | 019f3a90 |
| 95.9 | pi | audit | 38 | 7/60 | no | 019f3ac2 |
| 97.3 | pi | audit | 31 | 4/51 | no | 019f3abc |
| 97.5 | pi | audit | 35 | 5/69 | no | 019f3ab6 |
| 98.3 | pi | audit | 45 | 2/60 | no | 019f3a96 |
| 98.5 | pi | audit | 45 | 2/70 | no | 019f3aac |
| 98.8 | pi | audit | 47 | 1/75 | no | 019f3a8e |
| 98.8 | pi | other | 33 | 2/59 | no | 019f3aa4 |
| 100.0 | claude | other | 187 | 1/69 | yes | e005fa06 |
| 100.0 | claude | audit | 317 | 5/137 | yes | 0ee4f14f |

## Weakness records

| id | frequency | affected agents | likely harness layer | recommended repair surface | summary |
|---|---|---|---|---|---|
| WH-001 | 13/14 | claude, pi | terminal status | verifier | Recurring tool-call errors surfaced during execution |
| WH-002 | 4/14 | claude | handoff | skill rule | Repeated user corrections point to an unclear task handoff |

