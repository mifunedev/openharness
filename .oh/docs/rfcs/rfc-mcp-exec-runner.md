# RFC: MCP exec-runner — the openharness sandbox as an A3 runner target

Status: Draft — companion to [#592](https://github.com/mifunedev/openharness/issues/592) (runtime taxonomy) and its implementation epic [#591](https://github.com/mifunedev/openharness/issues/591). Scoped as an **A3 (fan-out) runner candidate**, not a new taxonomy.

This RFC proposes making the openharness sandbox a **remotely-drivable MCP runner** by vendoring *only* the `exec-server` MCP proxy from [`mifunedev/sandboxes/ubuntu`](https://github.com/mifunedev/sandboxes/tree/master/ubuntu). It is a candidate under the [runtime-support contract](rfc-runtime-support.md) — it implements one concrete mechanism for the "harness *becomes* a runner target" option that `rfc-runtime-support.md` §6 raises but defers. Wiki mechanics: [[mcp-exec-runner]].

## 1. What the proxy is

`mifunedev/sandboxes/ubuntu` is not a base image worth importing — it is a ~100-line Node MCP **server** (`@modelcontextprotocol/sdk` ^1.12.1 + `express` + `zod`) exposing a single tool:

- `exec_command { cmd, timeout? }` → `{ stdout, stderr, exitCode }`, run via `child_process.exec()` (120s max, 10MB buffer).
- Transport: **Streamable HTTP** (`mcp-session-id` sessions). Endpoints `POST/GET/DELETE /mcp`, `GET /health`. Port `3005` (`PORT`).
- Auth: optional `x-api-key` against `API_KEY` — **off by default** upstream.

Per the requester's scope: **only the proxy** (`index.js` + `package.json`) is in scope — not the upstream Dockerfile/entrypoint or its "OpenClaw" `/workspace` scaffolding.

## 2. Where it fits the #592 taxonomy

| Axis | Fit | Why |
|---|---|---|
| **A1 — Substrate** | ✗ | Adds no isolation; it presumes the substrate decision is made elsewhere. Under docker.sock it *weakens* the boundary. |
| **A2 — Deploy target** | ✗ | Not a "ship the app" runtime. |
| **A3 — Scale / fan-out** | ✓ | It is the **runner endpoint** that lets an external control plane drive N sandboxes over one uniform protocol (MCP), instead of tmux/ralph inside the one container. |

**Direction.** This is the *inverse* of DebugMCP: there the sandbox is an MCP **client** dialing out to `:3001`; here it **hosts** an MCP endpoint an outside orchestrator drives. It is the MCP-shaped answer to `rfc-runtime-support.md` §6's deferred question — "would the harness *be* a runner target (`provider: ssh`)?" — with `provider: mcp-http` as a fourth option alongside Crabbox embed/integrate.

## 3. Meeting the "supported runtime" contract

Mapped to `rfc-runtime-support.md` §2:

1. **Documented** — `.oh/docs/integrations/mcp-exec-runner.md` (mirror `debugmcp.md`: registration + Maintainer Decision Gate) + a runtimes-overview row.
2. **One-toggle** — `harness.yaml` `install.mcp_exec_runner` → build-arg/env via `.oh/scripts/harness-config.sh` (mirrors `INSTALL_HERMES`). Never multi-step.
3. **Validated** — boots inside the sandbox, `GET :3005/health` ok, MCP `initialize` handshake returns a session id, `exec_command` runs; boot-lint + probe floor stay green.
4. **Guarded** — `.oh/evals/probes/mcp-exec-runner-availability.sh` (handshake + health), mirroring `debugmcp-availability.sh`.

**Friction principle (§3):** default install ships *nothing* new — the trusted single-operator container stays the zero-config default; the runner is opt-in and off by default.

## 4. Security — the gating concern

`exec_command` is arbitrary RCE, and the sandbox bind-mounts `/var/run/docker.sock` (`.devcontainer/docker-compose.yml`), so RCE here reaches the Docker daemon → host — exactly the "root-on-host boundary / weakest link once untrusted code runs unattended" `rfc-runtime-support.md` §Purpose names. Non-negotiable posture, drawn from the third-party-MCP governance checklist (`.oh/skills/harness-audit/references/external-proposal-implementation-audit.md`):

- **Off by default**, opt-in single toggle; default installs unchanged (`.oh/templates/full/`, `init.test.ts` stay green).
- **Loopback-bound by default**; external reach only via a deliberate `cloudflared` tunnel or explicit `forwardPorts`. **Never `0.0.0.0` by default.**
- **`API_KEY` required whenever enabled** (fail-closed) — do not inherit the upstream keyless default.
- Vendored + **pinned** `@modelcontextprotocol/sdk`; minimal reviewed config; no auto-granted permissions.
- Open: run as `sandbox` (matches bind-mount owner, but has sudo + docker group) vs a dedicated low-priv `executor` user to shrink blast radius. **This RFC recommends the low-priv `executor` user** so a compromised runner cannot trivially reach the socket.

## 5. Decides vs defers

- **Decides:** that the MCP exec-runner is the A3 *runner-endpoint* candidate under #592, its contract mapping (§3), and the security floor (§4).
- **Defers to #591 / the primary-driver decision:** whether A3 lands as this MCP-runner endpoint, a Crabbox-style offload, or CI-as-runtime — and the ordering. This RFC does not preempt that; it makes the MCP-runner option concrete and costed.

## 6. Proposed merge into `rfc-runtime-support.md` (for the maintainer to apply)

Rather than edit the in-flight #592 draft here, two additive changes are proposed:

- **§4 fit matrix — new row:**
  `| openharness-as-MCP-runner (exec-server, mifunedev/sandboxes) | A3 | MCP-HTTP runner endpoint | Sandbox hosts one exec_command tool over Streamable HTTP; RCE + docker.sock → opt-in/loopback/API_KEY. Inverse of DebugMCP. |`
- **§6 / §9 — new open decision:** add `provider: mcp-http` as a fourth A3 option beside Crabbox *be / embed / integrate*: expose the sandbox as an MCP runner vs. an SSH runner vs. a Crabbox offload.

## 7. Next steps (non-executable — for after the decision)

```bash
# Only after the maintainer accepts the A3 primary-driver ordering:
gh issue create \
  --title "RFC: MCP exec-runner — sandbox as A3 MCP runner target (child of #591)" \
  --label autopilot \
  --body "Decision-gate: A3 runner endpoint via the mifunedev/sandboxes exec-server.
Vendor only index.js+package.json into .oh/mcp/exec-runner/ (repoint /workspace->/home/sandbox/harness, executor->low-priv user, pin SDK).
Opt-in install.mcp_exec_runner toggle; loopback + required API_KEY; .oh/docs/integrations/mcp-exec-runner.md + eval probe.
Gate: must satisfy rfc-runtime-support.md §2 contract and §4 security floor. No Dockerfile/compose change until accepted."
```

## Non-goals

- No proxy is vendored or wired here — this is a decision artifact.
- Not a substrate (A1) and not a deploy target (A2).
- Does not import the upstream base image or its OpenClaw workspace scaffolding.
