# Open Harness docs

GitHub-readable documentation for the core Open Harness repo. Prefer this index
for repo-local docs and [DeepWiki](https://deepwiki.com/mifunedev/openharness)
for generated codebase navigation. The rendered Docusaurus site and blog archive
live in [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web).


## How the primitive pack ships

Open Harness vendors the shared skills/agents/hooks primitive pack directly into the `.oh/` control plane (`.oh/skills/`, `.oh/agents/`, `.oh/hooks/`, `.oh/skills.lock`), tracked as ordinary files — the `oh` CLI lays them down during `oh init`/`oh update`, so a fresh checkout has them with no submodule or network step. Provider paths such as `.pi/skills`, `.claude/skills`, and `.codex/skills` are symlinks into `.oh/skills`; `.pi/` remains a provider surface for v1.

## Start here

- [Introduction](intro.md)
- [Quickstart](quickstart.md)
- [Installation](installation.md)
- [Railway hosted smoke deploy](railway.md)
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

- [Security considerations](security-considerations.md)
- [`.oh/` directory layout](oh-directory-layout.md)
- [Glossary](glossary.md)
- [RFC / ADR index](rfcs/README.md)
- [Self-improving harness roadmap curation](rfcs/rfc-selfimprove-roadmap.md)
- [Property testing](property-testing.md)
- [Resources](resources.md)
- [Roadmap](roadmap.md)
