---
title: "DebugMCP Integration"
slug: debugmcp
tags: [mcp, debugging, vscode, devcontainer, integration, open-harness]
created: 2026-06-23
updated: 2026-06-23
sources:
  - raw/2026-06-23-debugmcp.md
  - docs/integrations/debugmcp.md
related: [codegraph-mcp, sandbox-auth-volumes]
confidence: confirmed
---

# DebugMCP Integration

## Relevant Source Files
- `docs/integrations/debugmcp.md` — the integration contract, feasibility verdicts, and registration snippets this entry synthesizes.
- `raw/2026-06-23-debugmcp.md` — v2.0.1 tool-schema snapshot and local feasibility evidence (the version anchor).
- `.devcontainer/Dockerfile` — base image and absence of any VS Code server binary (the central feasibility constraint).

## Summary
DebugMCP (`ozzafar.debugmcpextension`, **v2.0.1**) is an MIT-licensed VS Code extension that activates an MCP server on `http://localhost:3001/mcp` (Streamable HTTP) exposing 13 structured debugging tools — breakpoints, stepping, variable inspection, and expression evaluation — to any MCP-capable coding agent. This entry documents an **integration contract and its feasibility status**. The **operator-side path is confirmed working**: DebugMCP v2.0.1 was installed into an attached VS Code host on the `oh-remote` container, bound `:3001`, and drove a full debug lifecycle (breakpoint → pause → variable inspection → step → expression evaluation) against a Python target. The **container-side headless path stays blocked/unverified**.

## Detail
DebugMCP's `extensionKind` is `workspace`, so it activates in the remote/workspace extension host, which needs a VS Code **server binary**. That binary is **not** in the current image: the devcontainer is `FROM debian:bookworm-slim` (`.devcontainer/Dockerfile:1`) and installs no `code`, `code-server`, or `vscode-server` — the only `code` tokens are the `claude-code` npm package (`.devcontainer/Dockerfile:102,108`) and the Attach-to-Container comments (`.devcontainer/Dockerfile:197,200`).

Feasibility honestly splits into two tiers. **Container-side (headless, no host IDE)** is the open question and is NOT confirmed: `code serve-web` is **BLOCKED** (no VS Code server binary), and code-server (Coder fork, headless-installable with its own Open VSX marketplace) is **UNVERIFIED** pending a runtime install plus an Open VSX availability check for the extension. **Operator-side** paths are **CONFIRMED**: on the `oh-remote` container an attached VS Code session supplied the server binary, `ozzafar.debugmcpextension` v2.0.1 installed and activated (`onStartupFinished`), bound `:3001`, and answered an MCP `initialize` (13 tools), with a full debug lifecycle running end-to-end against a Python file. The container-side headless path stays the open question; until it resolves to `VIABLE`, host-free (no attached IDE) usage is pending feasibility confirmation.

The v2.0.1 tool surface is 13 canonical tools: `start_debugging`, `stop_debugging`, `restart_debugging`, `step_over`, `step_into`, `step_out`, `continue_execution`, `add_breakpoint`, `remove_breakpoint`, `clear_all_breakpoints`, `list_breakpoints`, `get_variables_values`, and `evaluate_expression`. Documented workflows exist for Python (`ms-python.python`), JS/TS (built-in `js-debug`), Go (`golang.Go`/Delve), and Rust (`rust-analyzer` plus a DAP provider such as CodeLLDB) — each pending the same feasibility gate.

Registration is project-level for both agents: Codex carries a `[mcp_servers.debugmcp]` block (loopback `url`) in `.codex/config.toml`, and Claude Code a committed project-local `.mcp.json` (`type: http`, loopback `url`) pre-approved via `enabledMcpjsonServers` in `.claude/settings.json` — the maintainer's default-capability depth choice; Pi and Hermes are unverified for MCP. Security: `evaluate_expression` runs arbitrary expressions in the debuggee's context, so `debugmcp.bindHost` must stay loopback (a non-loopback bind publishes an unauthenticated code-exec endpoint), and Host/Origin validation is a DNS-rebinding browser defense, not a process boundary. The maintainer decision gate offers docs-only, optional-installer, or default-capability depths; no `Dockerfile`/`entrypoint.sh` change is made until a depth is chosen.

## See Also
- [[codegraph-mcp]]
- [[sandbox-auth-volumes]]
