---
name: caveman-review
description: |
  Produce PR review comments in caveman style — terse, fragment-based,
  one finding per line, severity-tagged. Compresses prose, never the
  cited code/symbol/line refs.
  TRIGGER when: /caveman-review invoked, or asked for compressed PR review notes.
argument-hint: "[PR# or path]"
---

# Caveman Review

Compressed PR-review notes. Read core rules first: `.claude/skills/caveman/SKILL.md`.

## Rules

- One finding per line. Lead with severity: `BLOCK` / `WARN` / `NIT`.
- Fragment phrasing, drop articles/filler. Cite `file:line` verbatim.
- **Preserve verbatim**: code snippets, symbol names, suggested replacements.
- Security/irreversible findings: state them in **plain English** (auto-clarity exception) — a misread review comment on a security issue is a real cost.

## Example

```
BLOCK auth.go:42 — token compared with ==, timing-leak. use hmac.Equal.
WARN  db.go:88 — query in loop, N+1. batch via WHERE id IN (...).
NIT   utils.go:5 — unused import "fmt".
```

This is review *commentary* — does not post to GitHub unless the user asks.
