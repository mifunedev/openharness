# Skills, agents & hooks

The portable primitive pack — the shared skills, agents, and hooks for Claude,
Codex, Pi, and Hermes. It is vendored directly into the Open Harness repo under
`.oh/` (`.oh/skills`, `.oh/agents`, `.oh/hooks`, `.oh/skills.lock`) and tracked
as ordinary files; provider-specific surfaces are symlinks into it, not copies.

## How providers reach these files

The `oh` CLI lays this pack down during `oh init`/`oh update` — no submodule, no
recursive clone, no network step. If a provider symlink is ever missing or
broken, repair it with `bash .oh/scripts/link-providers.sh`.

These provider paths resolve into `.oh/`:

- `.pi/skills -> ../.oh/skills`
- `.claude/skills -> ../.oh/skills`
- `.codex/skills -> ../.oh/skills`
- `.claude/agents -> ../.oh/agents`
- `.claude/hooks -> ../.oh/hooks`
- `.codex/agents -> ../.claude/agents`
- `.hermes/skills/openharness -> ../../.oh/skills` when Hermes is enabled

## Layout

| Path | Purpose |
| --- | --- |
| `skills/` | Shared skill source of truth for Claude, Codex, Pi, Hermes, and other providers. |
| `agents/` | Shared sub-agent definitions. |
| `hooks/` | Shared enforcement hooks used through provider symlinks. |
| `skills.lock` | Registry-managed skill pins and checksums. |

## Update workflow

Edit these files in place under `.oh/skills`, `.oh/agents`, and `.oh/hooks` —
changes land directly in the Open Harness repo, so a normal commit ships them.
After editing, run the provider/eval checks and `bash .oh/scripts/link-providers.sh`
to confirm the provider symlinks still resolve.
