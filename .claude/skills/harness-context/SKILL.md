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
   `apps/README.md`, `crons/README.md`, `tasks/README.md`,
   `scripts/README.md`, `.worktrees/README.md`) and the `Project
   Structure` section of `CLAUDE.md`. There is no single comprehensive
   tree — use the filesystem and the directory READMEs.
3. Read relevant rules under `.claude/rules/`:
   - `git.md` — issue / branch / commit / PR conventions
   - `sandbox-processes.md` — tmux sessions for long-running processes
   - `directory-readme.md` — when a directory needs a README
   - `advisor-model.md` — pattern for delegating to sub-agents
4. For optional sandbox agent/runtime integrations, audit the full runtime/config/auth surface together: compose mounts and env, entrypoint setup/migration, default config seeding, banner sentinels, `.gitignore`, docs/wiki/changelog, and compose config validation. If Hermes is involved, load `references/hermes-state-auth-split.md` for the established single-device project-local runtime (config + auth + sessions all under one `HERMES_HOME`) + external skills pattern, and why auth must not be a cross-device symlink.
5. For user-facing optional-runtime warnings, update the user-facing runtime docs/README when the fix is likely to recur. Example: Hermes gateway Slack warnings are covered in `references/hermes-gateway-slack.md`; document that Hermes' Slack gateway is separate from the Pi Slack extension, `hermes-agent[slack]` supplies `slack-bolt`, Open Harness' installed Hermes uses `/usr/local/lib/hermes-agent/venv` (so add extras with `uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack]'`, not `uv tool install`), cron still runs without a messaging adapter, and `.hermes/README.md` is the right home for Hermes runtime-home/gateway notes rather than the top-level README. Ownership invariant: runtime paths a human uses inside the container should be writable by the default `sandbox` user; if an image-level install needs root during Docker build, constrain root-owned build paths to that RUN layer and reset runtime env/ownership afterward.
6. Answer with `path:line` citations.

## Output shape

- Short factual answer first, then file references.
- Lifecycle questions (setup / validate / teardown): cite the relevant
  section of `CLAUDE.md`.
- Convention questions: cite the specific rule file under
  `.claude/rules/`.
