# Skill source of truth in Open Harness

When asked to list, audit, or reason about Open Harness skills, distinguish the tracked harness skill library from the active agent runtime's merged skill view.

## Canonical harness skills

- Source of truth: `.mifune/skills/*/SKILL.md` in the Open Harness repo.
- These are tracked repo artifacts and are the skills that define Open Harness orchestration workflows.
- Agent-specific skill paths are symlinks or runtime links to the same tracked collection:
  - `.claude/skills -> ../.mifune/skills`
  - `.codex/skills -> ../.mifune/skills`
  - `.pi/skills -> ../.mifune/skills`
  - `.hermes/skills/openharness -> ../../.mifune/skills` when Hermes is enabled
- Cite `.mifune/skills/...` as the neutral source path, and mention agent-specific symlink paths only when relevant to a specific runtime.

## Hermes runtime skills

- Hermes runs with `HERMES_HOME=/home/sandbox/harness/.hermes` when enabled in the sandbox.
- `.hermes/skills/` is project-local Hermes runtime/profile state and is gitignored except for `.hermes/README.md`.
- Hermes may also expose bundled or profile-scoped skills. `hermes skills list` therefore reports a merged runtime catalog, not the canonical Open Harness library.
- Open Harness links `.hermes/skills/openharness` to `.mifune/skills/` so the same tracked shared skill collection is visible through Hermes' normal local skill scan without making `.hermes/skills` authoritative for the repo.

## Answering pattern

1. Say explicitly which view you are using: repo source-of-truth vs active Hermes runtime catalog.
2. For Open Harness skills, enumerate `.mifune/skills/*/SKILL.md` first.
3. If mentioning Hermes skills, label them as runtime/bundled/profile skills and separate them from harness skills.
4. Check `git remote -v` or `CHANGELOG.md` if the user asks which repo is canonical; current docs identify `mifunedev/openharness` as canonical, with forks/remotes possibly still named `origin` locally.
