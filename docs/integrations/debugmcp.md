---
sidebar_position: 5
title: DebugMCP
---

> Tool surface and feasibility verdicts anchored to DebugMCP **v2.0.1**.

# DebugMCP

[DebugMCP](https://github.com/microsoft/DebugMCP) is an MIT-licensed VS Code
extension (`ozzafar.debugmcpextension`, **v2.0.1**) that activates an MCP server
on `http://localhost:3001/mcp` (Streamable HTTP) and exposes structured
debugging tools — breakpoints, stepping, variable inspection, expression
evaluation — to any MCP-capable coding agent. Its `extensionKind` is
`workspace`, so it activates in the **remote/workspace extension host**, not a
UI or browser host.

This page documents an **integration contract and its feasibility status**. Its
operator-side runtime is now proven in practice; the headless path is not. The extension host normally needs a VS Code
**server binary** to load a `workspace`-kind extension; whether that binary can
be supplied **inside this headless devcontainer** is the central open question
this page exists to answer. The verdicts below are graded plainly — `CONFIRMED`,
`VIABLE`, `BLOCKED`, or `UNVERIFIED`. The **operator-side path is now confirmed
working** in practice (validated on the `oh-remote` container, 2026-06-23); the
**container-side headless path remains the open question**.

## Feasibility

DebugMCP runs inside a VS Code extension host. That host needs a VS Code server
binary, which is **not** in the current image: the devcontainer is
`FROM debian:bookworm-slim` (`.devcontainer/Dockerfile:1`) and installs no
`code`, `code-server`, or `vscode-server` binary at build time — the only `code`
tokens in the Dockerfile are the `claude-code` npm package
(`.devcontainer/Dockerfile:102,108`) and the two VS Code *Attach-to-Container*
comments (`.devcontainer/Dockerfile:197,200`). `devcontainer.json` declares no
`extensions` list and no `forwardPorts` (`.devcontainer/devcontainer.json`,
whole file).

Feasibility splits into two tiers. **The filed open question is the
container-side one** — can the extension host run *headless, with no host IDE*.
The operator-side paths below are available but **host-dependent** (they require
a developer running VS Code on their own machine), so they are noted for
completeness and **not given equal weight** to the container-side question.

### Container-side (headless, no host IDE)

These paths run entirely inside the sandbox with no developer IDE attached.
This tier is the subject of the open feasibility question.

| Path | Verdict | Evidence / constraint |
| --- | --- | --- |
| `code serve-web` | **BLOCKED** | The `serve-web` subcommand requires the VS Code CLI/server, which is **not installed** in the image — no `code` binary exists (`grep -niE 'code-server\|serve-web\|vscode-server' .devcontainer/Dockerfile` returns nothing but the `claude-code` package and the Attach comments). Without a runtime install of the VS Code server, `code serve-web` cannot start. The blocking constraint is the **absent VS Code server binary** in `debian:bookworm-slim`. |
| code-server (apt / binary) | **UNVERIFIED** | code-server (the Coder fork) is not in the image either, but unlike upstream `code serve-web` it is installable headlessly (`apt`/`.deb`/install script) and bundles its own Open VSX extension marketplace. What would confirm: install code-server at runtime, install `ozzafar.debugmcpextension` from Open VSX, open a workspace, and observe the MCP server bind on `:3001` — none of which has been executed. Open question: whether `ozzafar.debugmcpextension` is published to **Open VSX** (code-server cannot reach the proprietary Microsoft Marketplace). Editing the Dockerfile to bake this in is **out of scope** here (post-decision only). |

### Operator-side (requires host VS Code)

These paths bring the VS Code **server binary from the operator's host IDE**, so
the missing-binary constraint above does not apply. They are available today but
**depend on a developer's machine** — they do not answer the headless question.

| Path | Verdict | Evidence / constraint |
| --- | --- | --- |
| VS Code Attach-to-Container (Lifecycle Option B) | **CONFIRMED** | Validated on `oh-remote` (2026-06-23): an attached VS Code session provisioned the server, `ozzafar.debugmcpextension` v2.0.1 installed + activated + bound `:3001`, and a full debug lifecycle (breakpoint → pause → `get_variables_values` → `step_over` → `evaluate_expression`) ran against a Python file. The image is already prepared for Attach-to-Container: `.devcontainer/Dockerfile:197-201` writes `/.devcontainer/devcontainer.json` and a `devcontainer.metadata` LABEL so VS Code attaches as user `sandbox` at `/home/sandbox/harness`. The Dev Containers extension provisions its own VS Code server into the container on attach, supplying the binary the headless tiers lack; DebugMCP can then install and activate in that operator-driven host. Confirmed by `CLAUDE.md` Lifecycle **Option B** (Dev Containers → "Attach to Running Container"). |
| Remote-SSH + Attach (Lifecycle Option C) | **VIABLE** | Same mechanism over SSH: the operator SSHes to the remote host, then attaches to the container, and VS Code provisions its server. The host IDE supplies the server binary, so the extension host can run. Confirmed by `CLAUDE.md` Lifecycle **Option C** (Remote-SSH then attach). |

**Summary of the open question.** The container-side, host-free path is **not
confirmed**: `code serve-web` is **BLOCKED** by the missing VS Code server
binary, and code-server is **UNVERIFIED** pending a runtime install plus an Open
VSX availability check. Operator-side Attach is **CONFIRMED** in practice
(Remote-SSH is **VIABLE** by the same mechanism); the headless container-side
path remains the open question. Until it resolves to `VIABLE`, **host-free** (no
attached IDE) availability stays **pending feasibility confirmation** — but with
an operator attached, DebugMCP is confirmed working.

## Agent MCP Registration

Once a VS Code extension host activates DebugMCP (see [Feasibility](#feasibility)),
the MCP server listens on `http://localhost:3001/mcp` (Streamable HTTP). The
snippets below register that endpoint with each harness agent. Codex and Claude
Code are now **registered at project scope in-repo** (committed); Pi and Hermes
remain operator-driven and unverified.

> **These are project-local config files** (`.codex/config.toml`, `.mcp.json`)
> that may be **committed to git with the loopback URL visible**. The URL is a
> localhost endpoint, **not a credential** — but it is flagged here so the
> exposure is a conscious choice, not an accident.

### Codex

`.codex/config.toml` carries the project-level `[mcp_servers.debugmcp]` block:

```toml
[mcp_servers.debugmcp]
url = "http://localhost:3001/mcp"
```

Or register it from the CLI, which writes the same block:

```bash
codex mcp add debugmcp --url http://localhost:3001/mcp
```

### Claude Code

Claude Code reads MCP servers from a project-local `.mcp.json`, **now committed
at project scope** and pre-approved via `enabledMcpjsonServers` in
`.claude/settings.json` (the maintainer's default-capability depth — see the
decision gate below). The committed JSON shape (machine-parseable, not prose):

```json
{
  "mcpServers": {
    "debugmcp": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Or register it from the CLI, which writes the same entry:

```bash
claude mcp add --transport http debugmcp http://localhost:3001/mcp
```

### Pi

`unverified — MCP support not confirmed`. Pi (`.pi/settings.json`) is not
documented here as MCP-capable for this endpoint, and no registration snippet is
provided. Confirm Pi's MCP client support against its current release before
attempting registration.

### Hermes

`unverified — MCP support not confirmed`. Hermes MCP client support is likewise
not confirmed; no registration snippet is provided until it is.

## Debug Workflows

The tool surface below is **anchored to DebugMCP v2.0.1** — the 13-tool schema
this page is validated against — so future drift is detectable. Every call uses
one of the canonical v2.0.1 tool names: `start_debugging`, `stop_debugging`,
`restart_debugging`, `step_over`, `step_into`, `step_out`, `continue_execution`,
`add_breakpoint`, `remove_breakpoint`, `clear_all_breakpoints`,
`list_breakpoints`, `get_variables_values`, `evaluate_expression`.

Each workflow assumes its language's VS Code debug extension is installed in the
active extension host. The **Python workflow is validated end-to-end**
(operator-attached, on `oh-remote`); the others are documented but not yet exercised.

### Python

Requires the `ms-python.python` extension (it bundles the Python debug adapter).

> **Validated end-to-end** on `oh-remote` (2026-06-23) — an attached VS Code
> session ran the full breakpoint → inspect → step → evaluate cycle against a
> Python file.

1. `start_debugging` on the target script.
2. `add_breakpoint` at the suspect line.
3. When execution pauses, `get_variables_values` to inspect locals, then
   `step_over` to advance.
4. `stop_debugging` to end the session.

### JavaScript / TypeScript

Uses VS Code's built-in `js-debug` adapter (no extra extension needed for
Node.js targets).

> Pending feasibility confirmation (see [Feasibility](#feasibility)).

1. `start_debugging` on the entry file.
2. `add_breakpoint` inside the failing handler.
3. At the pause, `evaluate_expression` to test a hypothesis against live state,
   then `step_into` to follow the call.
4. `stop_debugging` to tear down.

### Go

Requires the `golang.Go` extension (it drives Delve as the debug adapter).

> Pending feasibility confirmation (see [Feasibility](#feasibility)).

1. `start_debugging` on the package or test.
2. `add_breakpoint` at the goroutine of interest.
3. On the pause, `get_variables_values` to read the frame, then
   `continue_execution` to the next hit.
4. `stop_debugging` to close the session.

### Rust

Requires `rust-lang.rust-analyzer` for language support **plus** a DAP provider
such as `vadimcn.vscode-lldb` (CodeLLDB) — rust-analyzer alone ships **no** debug
adapter, so CodeLLDB (or an equivalent LLDB/GDB DAP bridge) supplies the actual
debugging backend.

> Pending feasibility confirmation (see [Feasibility](#feasibility)).

1. `start_debugging` on the built binary or test target.
2. `add_breakpoint` at the panic site.
3. At the pause, `evaluate_expression` to probe a borrow or value, then
   `step_out` to return to the caller.
4. `stop_debugging` to finish.

## Security

DebugMCP's `evaluate_expression` tool runs **arbitrary expressions in the
debuggee's context** — full read/write reach into the process being debugged.
Two facts govern its exposure.

**`bindHost` must stay loopback.** By default the server binds `localhost`.
Setting `debugmcp.bindHost` to a non-loopback address (e.g. `0.0.0.0`) publishes
an **unauthenticated** `evaluate_expression` endpoint — anyone who can reach the
port gets code execution against the debuggee. **Do not do this.** There is no
auth layer to add; the only safe posture is keeping the bind on loopback.

**Host/Origin validation is a DNS-rebinding defense, not a process boundary.**
The server's Host/Origin checks exist to stop a malicious web page from
**DNS-rebinding** a browser into the localhost port. They do **not** authenticate
or isolate processes *inside* the container — any local process that can open
`:3001` already has full tool access. Treat loopback-binding as the real control
and Host/Origin validation as a narrower, browser-specific mitigation.

A future `/really-debug` companion skill is a **design consideration only**:
were it built, it would auto-install via the `.mifune/skills` source-of-truth
plus the per-provider symlinks, but no such skill exists today and none is
created by this integration.

## Maintainer Decision Gate

Three integration depths are on the table. No option is endorsed here — the
choice is the maintainer's, and each carries a named trade-off. None of these
prescribes any `Dockerfile` or `entrypoint.sh` change; those are post-decision
work, gated behind whichever option is chosen.

| Option | What it means | Trade-off |
| --- | --- | --- |
| **Docs-only** | Ship this page and the eval probe; install/registration stays a manual operator step. | Lowest cost and zero runtime surface, but DebugMCP is never available without per-operator setup, and the feasibility question stays unresolved in practice. |
| **Optional installer** | Add an opt-in script (or flag) that installs the extension host + DebugMCP on request. | Makes activation one command without forcing it on every sandbox, but adds an installer surface to maintain and still requires resolving the container-side feasibility `UNVERIFIED`. |
| **Default capability** | Bake the extension host + DebugMCP into the image so it is active out of the box. | Zero per-operator friction, but enlarges every image, adds a bound `:3001` listener to the attack surface by default, and commits the harness to maintaining the debug stack. |

**Decision (2026-06-23).** The maintainer committed the **agent-side
registration** at project scope — `.mcp.json` + `.codex/config.toml` + the
`enabledMcpjsonServers` approval — so DebugMCP is a default for Claude Code and
Codex sessions. The **runtime extension host stays operator-side Attach** (no
`Dockerfile`/`entrypoint.sh` change); the container-side headless host remains
deferred. This is the *default-capability* depth for registration without the
image-baking cost.

## Next Steps

If the maintainer selects a non-docs-only option, file the matching follow-on
issue. The blocks below are **pre-written, non-executable** issue bodies — copy
the one for the chosen option and run it after the decision, not before.

For the **optional installer** option:

```bash
gh issue create \
  --title "DebugMCP: optional installer for headless extension host" \
  --label autopilot \
  --body "Decision-gate outcome: optional installer (see docs/integrations/debugmcp.md § Maintainer Decision Gate).
Build an opt-in installer (script or flag) that provisions a headless VS Code
extension host plus the ozzafar.debugmcpextension v2.0.1 and verifies the MCP
server binds on :3001/mcp. Must first resolve the container-side feasibility
UNVERIFIED (code-server + Open VSX availability). No Dockerfile/entrypoint
changes until this is scoped."
```

For the **default capability** option:

```bash
gh issue create \
  --title "DebugMCP: make the debug capability active by default" \
  --label autopilot \
  --body "Decision-gate outcome: default capability (see docs/integrations/debugmcp.md § Maintainer Decision Gate).
Bake a headless VS Code extension host + ozzafar.debugmcpextension v2.0.1 into
the devcontainer image so DebugMCP is active out of the box. Scope the image-size
and attack-surface impact of a default-bound :3001 listener, and resolve the
container-side feasibility UNVERIFIED before any Dockerfile/entrypoint edit."
```
