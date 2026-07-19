# Open Harness docs

📖 **Full rendered docs & search → https://oh.mifune.dev**

GitHub-readable documentation for the core Open Harness repo. Prefer this index
for repo-local docs and [DeepWiki](https://deepwiki.com/mifunedev/openharness)
for generated codebase navigation. The rendered Docusaurus site and blog archive
live in [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web).

## Start here

Open Harness provides the sandbox; you choose the harness — a Docker workspace you
clone-and-own, where `make sandbox` boots one long-lived container and the coding agent
of your choice (Claude Code, Codex, Pi, Hermes, and more) works on its own branch and
identity, running identically on your laptop or an unattended, lights-out remote VM.

**Attach in 3 steps (VS Code):**

1. `make sandbox` — build the image and boot the container.
2. VS Code → Command Palette (Ctrl/Cmd+Shift+P) → "Dev Containers: Attach to Running
   Container" → select `openharness`. Ports auto-forward while attached.
3. Open a terminal and run `herdr` first. Complete setup and launch `claude`, `codex`, `pi`, or `hermes` from Herdr panes.

Full terminal / Remote-SSH options: see [Connecting → Option B](connecting.md#option-b--vscode-attach-to-running-container-local-host).

[Hermes](harnesses/hermes.md) — Nous Research's self-improving agent CLI — is an opt-in harness: set
`install.hermes: true` in harness.yaml, rebuild, then run `hermes setup`.

## How the primitive pack ships

Open Harness vendors the shared skills/agents/hooks primitive pack directly into the `.oh/` control plane (`.oh/skills/`, `.oh/agents/`, `.oh/hooks/`, `.oh/skills.lock`), tracked as ordinary files — the `oh` CLI lays them down during `oh init`/`oh update`, so a fresh checkout has them with no submodule or network step. Provider paths such as `.pi/skills`, `.claude/skills`, and `.codex/skills` are symlinks into `.oh/skills`; `.pi/` remains a provider surface for v1.

## Setup & first steps

- [Introduction](intro.md)
- [Quickstart](quickstart.md)
- [Installation](installation.md)
- [Prebuilt-image deployment (skip the local build)](deployment-prebuilt-image.md)
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

- [Herdr](integrations/herdr.md)
- [GitHub](integrations/github.md)
- [Slack](integrations/slack.md)
- [Langfuse](integrations/langfuse.md)
- [DebugMCP](integrations/debugmcp.md)
- [Pi autoresearch](integrations/pi-autoresearch.md)
- [Pi dynamic workflows](integrations/pi-dynamic-workflows.md)
- [Pi fff file search](integrations/pi-fff.md)

## Reference

- [Security considerations](security-considerations.md)
- [Repair-operator registry](repair-operator-registry.md)
- [Artifact-contract schema](artifact-contract-schema.md)
- [`.oh/` directory layout](oh-directory-layout.md)
- [Descriptive `.oh/harness.yml` example](harness-manifest.md)
- [Glossary](glossary.md)
- [RFC / ADR index](rfcs/README.md)
- [ADR-0001: #532 standards scope](rfcs/adr-0001-standards-scope.md)
- [Self-improving harness roadmap curation (#525)](rfcs/rfc-selfimprove-roadmap.md)
- [Trace/event ledger RFC (#525 foundation)](rfcs/rfc-trace-ledger.md)
- [Property testing](property-testing.md)
- [Resources](resources.md)
- [Roadmap](roadmap.md)
