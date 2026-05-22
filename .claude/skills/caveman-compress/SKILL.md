---
name: caveman-compress
description: |
  Rewrite a target file (memory note, doc, scratch plan) in compressed
  caveman form to shrink its token footprint, preserving every technical
  fact, code block, and link. Shows a diff and confirms before overwriting.
  TRIGGER when: /caveman-compress <file> invoked, or asked to compress a doc/memory file.
argument-hint: "<file>"
---

# Caveman Compress

Rewrite a file in compressed form. Read core rules first: `.claude/skills/caveman/SKILL.md`.

## Procedure

1. **Read** the target file. Refuse politely if no path given.
2. **Rewrite** prose at `full` level: drop articles/filler, fragments allowed.
3. **Preserve verbatim**: code blocks, commands, URLs/links, tables, frontmatter, file/symbol names, numbers, headings (structure intact).
4. **Show the rewrite** and an estimated token delta. **Confirm before overwriting** — this edits a tracked file; do not write without a yes.
5. On confirm, write the file. Report old → new approx token count.

## Guardrails

- **Never** compress: `LICENSE`, `CHANGELOG.md`, generated/lock files (`*.lock`, `skills.lock`), or anything under `.github/`. These have exact-format contracts.
- **Refuse** files where compression would break a parser (JSON, YAML data, `prd.json`) — compression is for human-prose docs, not machine-read data.
- Compressing a `memory/` note is fine; preserve the `## Heading -- HH:MM UTC` log structure (`context/rules/memory.md`).
