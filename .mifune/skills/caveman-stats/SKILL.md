---
name: caveman-stats
description: |
  Estimate caveman token savings — compare a normal-prose baseline against
  its compressed form and report tokens-in / tokens-out / % reduction.
  Heuristic estimate (≈4 chars/token), not exact billing.
  TRIGGER when: /caveman-stats invoked, or asked how much caveman saved.
argument-hint: "[normal text | --session]"
---

# Caveman Stats

Report token savings. Read core rules first: `.claude/skills/caveman/SKILL.md`.

## Modes

- **Inline**: given a normal-prose sample, produce its `full`-level compression and report both counts.
- **`--session`**: estimate savings across caveman-active responses this session (qualitative if no exact counts available — say so).

## Method

- Heuristic token estimate: `tokens ≈ ceil(chars / 4)`. State this is an approximation, not exact API billing.
- Report: `baseline → compressed (-NN%)`.

## Example

```
baseline:    69 tok
compressed:  19 tok
saved:       50 tok (-72%)
```

Honesty rule: never inflate the savings figure. If unmeasurable, say "estimate only".
