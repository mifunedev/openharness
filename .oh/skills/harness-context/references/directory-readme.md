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
4. **Pointer to canonical docs** — link to the skill, rule, or doc that owns
   the deeper detail (`/git` § Worktrees, `scripts/cron-runtime.ts`,
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

`.oh/README.md`, `.oh/tasks/README.md`, `.oh/scripts/README.md`. The nested
agent guides are `.worktrees/AGENTS.md`, `projects/AGENTS.md`, and
`crons/AGENTS.md`.

## When NOT to add a README

- Directory's name alone is enough (e.g. `docs/` for product documentation).
- Directory is auto-managed by tooling and not meant for human
  navigation (e.g. `node_modules/`).

## README or skill

A *description* of what a directory holds stays in that directory's
`README.md`. A *directive* an agent must follow moves to the skill that owns
the behavior under `.oh/skills/`, and the README links to it. The root
orchestrator contract lives in `AGENTS.md`.

A nested `AGENTS.md` is reserved for a directory whose contents an agent acts on
**without the root `AGENTS.md` in context**:

- `.worktrees/` and `projects/` — git boundaries. Their contents are separate
  checkouts, so the root file is never loaded there.
- `crons/` — agent instructions. A cron body is a prompt executed unattended on
  a schedule; the operating contract has to live beside it.

Each follows the same four-part shape as a README. No other directory gets one:
a directory that a human reads *about* takes a `README.md`, and only a directory
an agent operates *inside* takes an `AGENTS.md`.
