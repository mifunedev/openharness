---
name: repo-layout
description: |
  Create a concise, descriptive repository layout premap using the sandbox
  `tree` CLI, optimized for agent handoff before exact file reads.
  Verifies `tree` is installed and filters noisy directories by default.
  TRIGGER when: asked to premap a repo, map repository structure for an agent,
  inspect folder structure, show a concise directory tree, or understand repo layout.
argument-hint: "[path] [--depth N|--raw tree-options]"
allowed-tools: Bash
---

# Repo Layout

Create a concise, descriptive directory premap for agent orientation.

## Instructions

Arguments received: `$ARGUMENTS`

1. Run the skill-local wrapper; do not hand-roll `tree` flags:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/run.sh" $ARGUMENTS
   ```
2. Default mode is optimized for handoff: depth 1, directories first, noisy
   paths ignored, plus short descriptions of recognizable harness areas.
3. Use `--depth N`/`-L N` only when the first map is too shallow.
4. Use `--raw ...` only when native `tree` output is explicitly needed.
5. Treat the premap as orientation, not evidence. Follow it with `Read`, `Grep`,
   or `rg` on selected files.

## Examples

```text
/repo-layout
/repo-layout packages --depth 2
/repo-layout .claude/skills -L 1
/repo-layout --raw -L 2 -a .
```
