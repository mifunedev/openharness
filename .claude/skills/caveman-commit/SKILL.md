---
name: caveman-commit
description: |
  Write a Conventional Commit message in caveman style — terse subject,
  fragment body, full technical accuracy. Subject line stays a valid
  Conventional Commit (type: description).
  TRIGGER when: /caveman-commit invoked, or asked for a caveman commit message.
argument-hint: "[type]"
---

# Caveman Commit

Generate a commit message that obeys the harness commit format **and** caveman compression.

Read core rules first: `.claude/skills/caveman/SKILL.md` (drop/preserve + auto-clarity).

## Rules

- **Subject**: `<type>: <description>` per `context/rules/git.md` — `feat` · `fix` · `task` · `audit` · `skill`. Imperative, lowercase, ≤50 chars, no trailing period. The subject must stay a legible Conventional Commit; compress the *description* words, not the structure.
- **Body** (optional): fragment bullets, drop articles/filler. One line per logical change.
- **Preserve verbatim**: file names, symbols, flags, issue/PR refs, breaking-change notes.
- Do **not** caveman-ify the `Co-Authored-By` trailer or `Closes #` lines.

## Example

```
fix: guard nil session in auth middleware

- add nil-check before token decode in authMiddleware
- return 401 not 500 on missing session
- covers panic from #287
```

Print the message only — do not run `git commit` unless the user asks.
