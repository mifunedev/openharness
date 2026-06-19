---
title: "Repo Layout Sandbox Tree Support"
slug: repo-layout-skill
tags: [sandbox, skills, cli, tree, devcontainer]
created: 2026-06-19
updated: 2026-06-19
sources:
  - raw/2026-06-19-repo-layout-skill.md
related: [ci-build-gates]
confidence: confirmed
---

# Repo Layout Sandbox Tree Support

## Relevant Source Files
- `.devcontainer/Dockerfile` — installs sandbox image system packages, including the new `tree` package.
- `.claude/skills/repo-layout/SKILL.md` — defines when `/repo-layout` is loaded and how agents invoke the wrapper.
- `.claude/skills/repo-layout/scripts/run.sh` — performs the install check, concise descriptive premap output, and explicit `--raw` pass-through.
- `.pi/skills` — symlink that exposes tracked `.claude/skills/*` entries to Pi sessions.

## Summary
Open Harness treats `tree` as both sandbox toolchain inventory and an agent-facing skill. The sandbox image owns the binary for next builds, while `/repo-layout` owns the concise, descriptive premap shape agents should use before selecting exact files to read.

## Detail
The sandbox image is Debian bookworm (`.devcontainer/Dockerfile:1`) and installs base packages through a single `apt-get install -y --no-install-recommends` block (`.devcontainer/Dockerfile:6-10`). Adding `tree` to that block (`.devcontainer/Dockerfile:8`) means future `make sandbox` / devcontainer rebuilds include the CLI without a manual `apt install` step.

The skill layer is separate from the binary layer. `/repo-layout` is discovered through frontmatter with `name: repo-layout`, trigger phrases for directory-tree and hierarchy requests, and an argument hint for `[path] [--depth N|--raw tree-options]` (`.claude/skills/repo-layout/SKILL.md:1-10`). Its body calls the skill-local wrapper with `$ARGUMENTS` (`.claude/skills/repo-layout/SKILL.md:19-24`), keeping argument wiring explicit rather than describing a command the operator must run manually.

The wrapper first fails clearly if the current sandbox predates the image change and lacks `tree` (`.claude/skills/repo-layout/scripts/run.sh:4-10`). With no arguments it applies a concise default depth, directory-first ordering, a file limit, and noisy-directory ignores (`.claude/skills/repo-layout/scripts/run.sh:7-10`, `.claude/skills/repo-layout/scripts/run.sh:116-121`). It then adds short `Key areas` descriptions and `Good next reads` suggestions (`.claude/skills/repo-layout/scripts/run.sh:123-152`). Native `tree` flags remain available only through explicit `--raw` mode (`.claude/skills/repo-layout/scripts/run.sh:88-93`).

## System Relationships

```mermaid
flowchart LR
    Dockerfile[.devcontainer/Dockerfile\napt package: tree] --> Sandbox[Next sandbox image]
    Sandbox --> Binary[/usr/bin/tree]
    Skill[.claude/skills/repo-layout/SKILL.md] --> Wrapper[scripts/run.sh]
    Wrapper --> Binary
    Pi[.pi/skills symlink] --> Skill
```

## See Also
- [[ci-build-gates]]
