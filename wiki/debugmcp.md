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
confidence: provisional
---

# DebugMCP Integration

## Relevant Source Files
- `docs/integrations/debugmcp.md` — the integration contract, feasibility verdicts, and registration snippets this entry synthesizes.
- `raw/2026-06-23-debugmcp.md` — v2.0.1 tool-schema snapshot and local feasibility evidence (the version anchor).
- `.devcontainer/Dockerfile` — base image and absence of any VS Code server binary (the central feasibility constraint).

## Summary
DebugMCP (`ozzafar.debugmcpextension`, **v2.0.1**) is an MIT-licensed VS Code extension that activates an MCP server on `http://localhost:3001/mcp` (Streamable HTTP) exposing 13 structured debugging tools — breakpoints, stepping, variable inspection, and expression evaluation — to any MCP-capable coding agent. This entry documents an **integration contract and its feasibility status**, not a proven-running capability: the container-side headless path is currently blocked/unverified, so `confidence` stays `provisional`.

## Detail
DebugMCP's `extensionKind` is `workspace`, so it activates in the remote/workspace extension host, which needs a VS Code **server binary**. That binary is **not** in the current image: the devcontainer is `FROM debian:bookworm-slim` (`.devcontainer/Dockerfile:1`) and installs no `code`, `code-server`, or `vscode-server` — the only `code` tokens are the `claude-code` npm package (`.devcontainer/Dockerfile:102,108`) and the Attach-to-Container comments (`.devcontainer/Dockerfile:197,200`).

Feasibility honestly splits into two tiers. **Container-side (headless, no host IDE)** is the open question and is NOT confirmed: `code serve-web` is **BLOCKED** (no VS Code server binary), and code-server (Coder fork, headless-installable with its own Open VSX marketplace) is **UNVERIFIED** pending a runtime install plus an Open VSX availability check for the extension. **Operator-side** paths are **VIABLE** but host-dependent — VS Code Attach-to-Container (Lifecycle Option B) and Remote-SSH + Attach (Option C) both bring the server binary from the operator's host IDE, so they do not answer the headless question. Until the container-side path resolves to `VIABLE`, downstream usage is pending feasibility confirmation.

The v2.0.1 tool surface is 13 canonical tools: `start_debugging`, `stop_debugging`, `restart_debugging`, `step_over`, `step_into`, `step_out`, `continue_execution`, `add_breakpoint`, `remove_breakpoint`, `clear_all_breakpoints`, `list_breakpoints`, `get_variables_values`, and `evaluate_expression`. Documented workflows exist for Python (`ms-python.python`), JS/TS (built-in `js-debug`), Go (`golang.Go`/Delve), and Rust (`rust-analyzer` plus a DAP provider such as CodeLLDB) — each pending the same feasibility gate.

Registration is manual and operator-driven, never applied automatically: Codex adds a `[mcp_servers.debugmcp]` block (loopback `url`) in `.codex/config.toml`; Claude Code uses a project-local `.mcp.json` (`type: http`, loopback `url`) that the integration deliberately does NOT commit; Pi and Hermes are unverified for MCP. Security: `evaluate_expression` runs arbitrary expressions in the debuggee's context, so `debugmcp.bindHost` must stay loopback (a non-loopback bind publishes an unauthenticated code-exec endpoint), and Host/Origin validation is a DNS-rebinding browser defense, not a process boundary. The maintainer decision gate offers docs-only, optional-installer, or default-capability depths; no `Dockerfile`/`entrypoint.sh` change is made until a depth is chosen.

## See Also
- [[codegraph-mcp]]
- [[sandbox-auth-volumes]]
