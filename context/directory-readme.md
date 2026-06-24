# Directory README Pattern

A tracked `README.md` is the canonical placeholder + documentation for
any top-level directory whose:

- Purpose isn't self-evident from the directory name, OR
- Contents are otherwise gitignored (so the directory would vanish on a
  fresh clone)

Use the README instead of a `.gitkeep`. It serves both purposes (intent
doc + folder anchor) without the empty-file smell.

## What the README MUST cover

1. **One-line intent** at the top — what this directory holds and why
   it exists.
2. **Subfolder enumeration** — every meaningful subdirectory gets a
   row in a table (or bullet) with its purpose. Spell out the
   convention; don't assume readers will chase the rule that defined
   it (e.g. inside `.worktrees/`, list `feat/`, `bug/`, `agent/`, …
   not just "subfolders mirror branch prefixes").
3. **Conventions** — naming, lifecycle, gitignore behaviour, anything
   non-obvious to someone landing fresh in the directory.
4. **Pointer to canonical docs** — link to the rule or doc that owns
   the deeper detail (`.claude/skills/git/SKILL.md` § Worktrees, `scripts/cron-runtime.ts`,
   etc.).

## What the README MUST NOT contain

- **Large box-drawing trees** (`├──`, `└──`, `│`) reproducing the whole
  repo. Local example layouts (a few lines, no box-drawing) are fine
  when they illustrate a *contained* convention specific to that
  directory (e.g. `project/foo/web/`).
- **Duplicated rule content** — link to the canonical rule rather than
  paraphrasing it. Paraphrases drift.

## Gitignore interaction

When the directory is otherwise fully ignored, exempt only the README:

```
mydir/*
!mydir/README.md
```

`.gitkeep` is replaced by the README — do not ship both.

## Examples in this repo

`.worktrees/README.md`, `.oh/README.md`, `crons/README.md`,
`tasks/README.md`, `.oh/scripts/README.md`.

## When NOT to add a README

- Directory's name alone is enough (e.g. `blog/` for Docusaurus posts).
- Directory is auto-managed by tooling and not meant for human
  navigation (e.g. `node_modules/`).
