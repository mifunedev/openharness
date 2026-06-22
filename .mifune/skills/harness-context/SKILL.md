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
2. For layout questions, read the per-directory `README.md` files (e.g.
   `packages/README.md`, `crons/README.md`, `tasks/README.md`,
   `scripts/README.md`, `.worktrees/README.md`) and the `Project
   Structure` section of `CLAUDE.md`. There is no single comprehensive
   tree — use the filesystem and the directory READMEs.
3. For behavioral norms (formerly the `context/rules/` tier, collapsed into
   on-demand skills in B-state M4), the canonical homes are now:
   - `/git` (`.mifune/skills/git/SKILL.md`) — issue / branch / commit / PR conventions
   - `/t3` (`.mifune/skills/t3/references/sandbox-processes.md`) — tmux sessions for long-running processes
   - `context/directory-readme.md` — when a directory needs a README
   - `/advisor` (`.mifune/skills/advisor/SKILL.md`) — pattern for delegating to sub-agents
4. For skill-listing or skill-source-of-truth questions, load `references/skill-source-of-truth.md` and separate the tracked Open Harness shared skill library (`.mifune/skills/*/SKILL.md`, exposed through `.claude/skills`, `.codex/skills`, `.pi/skills`, and Hermes' runtime `.hermes/skills/openharness` symlink) from the active Hermes runtime catalog (`.hermes/skills/` plus bundled/profile skills). Do not present `hermes skills list` as the repo source of truth without this distinction.
5. For shared-skill path migrations or cross-agent skill wiring, load `references/shared-skills-symlink-migration.md`; update symlinks, runtime boot setup, docs, CI path filters, cron invocations, exact-path eval probes, and fixed-depth support scripts together before declaring the migration done.
6. For optional sandbox agent/runtime integrations, audit the full runtime/config/auth surface together: compose mounts and env, entrypoint setup/migration, default config seeding, banner sentinels, `.gitignore`, docs/wiki/changelog, and compose config validation. If Hermes is involved, load `references/hermes-state-auth-split.md` for the established single-device project-local runtime (config + auth + sessions all under one `HERMES_HOME`) + shared-skill symlink pattern, and why auth must not be a cross-device symlink.
7. For user-facing optional-runtime warnings, update the user-facing runtime docs/README when the fix is likely to recur. Example: Hermes gateway Slack warnings are covered in `references/hermes-gateway-slack.md`; document that Hermes' Slack gateway is separate from the Pi Slack extension, `hermes-agent[slack]` supplies `slack-bolt`, Open Harness' installed Hermes uses `/usr/local/lib/hermes-agent/venv` (so add extras with `uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack]'`, not `uv tool install`), cron still runs without a messaging adapter, and `.hermes/README.md` is the right home for Hermes runtime-home/gateway notes rather than the top-level README. Ownership invariant: runtime paths a human uses inside the container should be writable by the default `sandbox` user; if an image-level install needs root during Docker build, constrain root-owned build paths to that RUN layer and reset runtime env/ownership afterward.
8. Answer with `path:line` citations.

## Output shape

- Short factual answer first, then file references.
- Lifecycle questions (setup / validate / teardown): cite the relevant
  section of `CLAUDE.md`.
- Convention questions: cite the owning skill (`.mifune/skills/<name>/SKILL.md`)
  or the relevant `context/` doc.
