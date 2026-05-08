---
name: harness-context
description: |
  Explain the Open Harness architecture, layout, and conventions.
  Use this skill when the user asks about project structure, layout,
  git workflow, rules, or how things are organized. Returns specific
  file paths and `path:line` citations.
  TRIGGER when: asked about harness structure, layout, conventions,
  rules, process, or project organization.
---

# Harness Context

Use this skill when the user asks about Open Harness layout, lifecycle,
conventions, git workflow, or where files live.

## Steps

1. Read `CLAUDE.md` for the orchestrator contract — what the root-level
   agent does and does not do.
2. Read `docs/architecture/container-runtime.md` under the `## Repo
   Layout` heading for the canonical annotated repo tree. This is the
   single source of truth for layout — do not paraphrase it elsewhere.
3. Read relevant rules under `.claude/rules/`:
   - `git.md` — issue / branch / commit / PR conventions
   - `sandbox-processes.md` — tmux sessions for long-running processes
   - `repo-layout-source.md` — the no-duplicate-tree rule
   - `directory-readme.md` — when a directory needs a README
   - `advisor-model.md` — pattern for delegating to sub-agents
4. Answer with `path:line` citations. For layout questions, link to the
   canonical anchor in `docs/architecture/container-runtime.md`; do not
   reproduce the tree.

## Output shape

- Short factual answer first, then file references.
- Lifecycle questions (setup / validate / teardown): cite the relevant
  section of `CLAUDE.md`.
- Convention questions: cite the specific rule file under
  `.claude/rules/`.
