# Ralph iteration — mifune-b-state-roadmap

You are one iteration of a Ralph loop implementing the `mifune-b-state-roadmap` task. The full plan is in `tasks/mifune-b-state-roadmap/prd.md` and the structured task list is in `tasks/mifune-b-state-roadmap/prd.json`. The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Your job in one iteration

Pick **one** user story, implement it, commit, mark it `passes: true`, and append a progress entry. Then exit. The next iteration handles the next story. Do not attempt multiple stories per iteration.

## Task-specific context

- Branch: `task/302-mifune-b-state-roadmap` (per `prd.json` `branchName`). Issue: #302.
- This is milestone **M0** of the B-state roadmap epic #301. **No migration runs here** — no `git mv`, no rule deletion, no skill authoring, no `.oh/` creation, no `AGENTS.md` rewrite. Those are M1–M6.
- The vision source of truth is `.claude/plans/context-as-a-logical-marble.md`.
- GitHub state (US-001/US-002) — the `roadmap` label, the pinned epic #301, and milestone issues #302–#308 — was created during M0 setup. If those stories are still `passes:false`, verify the live state with `gh` and mark them done rather than re-creating.
- `docs/roadmap.md` is a Docusaurus page: it needs YAML frontmatter (`title`, `sidebar_position`); the sidebar is frontmatter-driven (see `docs/intro.md`).
- Follow `.claude/skills/git/SKILL.md` for branch + commit conventions; every user-visible change adds a `CHANGELOG.md` `[Unreleased]` entry in the same commit.

## Reference

- PRD: `tasks/mifune-b-state-roadmap/prd.md`
- Structured stories: `tasks/mifune-b-state-roadmap/prd.json`
- Branch: `task/302-mifune-b-state-roadmap`
- Issue: #302
