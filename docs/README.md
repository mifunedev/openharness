# Open Harness docs

GitHub-readable documentation for the core Open Harness repo. Prefer this index
for repo-local docs and [DeepWiki](https://deepwiki.com/mifunedev/openharness)
for generated codebase navigation. The rendered Docusaurus site and blog archive
live in [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web).


## How Mifune is added

Open Harness adds Mifune by pinning [`ryaneggz/mifune`](https://github.com/ryaneggz/mifune) as the `.mifune/` Git submodule. Use `git clone --recurse-submodules` for a fresh checkout, or run `bash .oh/scripts/ensure-mifune.sh --init` followed by `bash .oh/scripts/ensure-mifune.sh --check` after a plain clone. Provider paths such as `.pi/skills`, `.claude/skills`, and `.codex/skills` stay as symlinks into `.mifune/`; `.pi/` remains a provider surface for v1.

## Start here

- [Introduction](intro.md)
- [Quickstart](quickstart.md)
- [Installation](installation.md)
- [Connecting to the sandbox](connecting.md)
- [Contributing](contributing.md)

## Harnesses

- [Overview](harnesses/overview.md)
- [Claude Code](harnesses/claude-code.md)
- [Codex](harnesses/codex.md)
- [Pi](harnesses/pi.md)
- [OpenCode](harnesses/opencode.md)
- [DeepAgents](harnesses/deepagents.md)
- [Hermes](harnesses/hermes.md)
- [Grok Build](harnesses/grok-build.md)
- [T3 Code](harnesses/t3code.md)

## Integrations

- [GitHub](integrations/github.md)
- [Slack](integrations/slack.md)
- [DebugMCP](integrations/debugmcp.md)
- [Pi autoresearch](integrations/pi-autoresearch.md)
- [Pi dynamic workflows](integrations/pi-dynamic-workflows.md)
- [Pi fff file search](integrations/pi-fff.md)

## Reference

- [Property testing](property-testing.md)
- [Resources](resources.md)
- [Roadmap](roadmap.md)
