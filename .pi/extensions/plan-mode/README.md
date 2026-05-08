# Plan Mode Extension

Claude Code-style plan mode for Pi.

## Usage

- `/plan` or `ctrl+alt+p` toggles plan mode.
- `/plan on` starts read-only planning.
- `/plan approve` approves the captured plan and starts implementation.
- `/plan off` cancels and restores the previous tool set.
- `/todos` shows captured plan steps or execution progress.
- `pi --plan` starts a session in plan mode.

## Behavior

When plan mode is active, Pi can inspect the repo but cannot mutate it:

- Active tools are reduced to read-only tools (`read`, `bash`, `grep`, `find`, `ls`, plus question tools when available).
- `edit`, `write`, and unknown tools are blocked.
- Bash is allowlisted to read-only inspection commands.
- The agent is instructed to end with a numbered `Plan:` section.

After the agent returns a plan, the extension prompts for approval. On approval it restores the previous active tools and sends a follow-up implementation prompt. During execution the agent marks completed steps with `[DONE:n]`, and `/todos` reports progress.
