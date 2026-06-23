# PRD: Explore optional DebugMCP integration — MCP debugging capability for harness agents

GitHub issue: [ryaneggz/openharness#297](https://github.com/ryaneggz/openharness/issues/297)
Branch: `feat/297-debugmcp-integration` · Base: `development` · Repo: `ryaneggz/openharness`

> Revision note (2026-06-23): revised after `/spec-critique` DENIED (4 highs). Changes close: US-006 frontmatter completeness + sequencing contradiction; US-001 cost/benefit honesty + container-vs-operator tiering; US-003 v2.0.1 version anchor + tool-name verification; US-004 PASS/REGRESSION precision; US-005 `/really-debug` ghost-reference; US-007 decision dead-end. See `critique.md`.

## Introduction

Evaluate and document [DebugMCP](https://github.com/microsoft/DebugMCP) as an **optional** debugging capability for Open Harness coding agents via the Model Context Protocol. DebugMCP is an MIT-licensed VS Code extension (`ozzafar.debugmcpextension`, **v2.0.1** — the version this spec is validated against) that activates an MCP server on `http://localhost:3001/mcp` (Streamable HTTP) and exposes 13 structured debugging tools (breakpoints, stepping, variable inspection, expression evaluation) to any MCP-capable agent.

This task is **feasibility validation, documentation, eval coverage, and a maintainer decision gate** — it vendors no source, makes no capability default, writes no companion skill, and edits no `Dockerfile`/`entrypoint.sh`. It supersedes the earlier `debugger-cli` framing (a GPL-3.0-only Rust/DAP terminal binary); the MIT license dissolves the vendoring boundary and the daemon-IPC lifecycle that blocked the previous spec.

**This documents an integration contract and its feasibility *status*, not a proven-running capability.** The central open question — whether a headless VS Code extension host can activate the extension in the Debian devcontainer — may legitimately resolve `UNVERIFIED` (US-001). When it does, downstream docs must say so plainly rather than read as if the capability works today.

## Goals

- Determine whether a **headless (container-side)** VS Code extension host can activate DebugMCP in the current Debian `bookworm-slim` devcontainer, with evidence per path — kept distinct from trivially-available operator-side IDE paths.
- Document MCP registration for the harness's MCP-capable agents (Claude Code, Codex), explicitly flagging Pi/Hermes as unverified.
- Document per-language debug workflows (Python, JS/TS, Go, Rust) using only the canonical 13 v2.0.1 MCP tool names, each carrying the feasibility status forward.
- Ship a deterministic 3-state eval probe for DebugMCP runtime availability with a precise PASS/REGRESSION/SKIPPED contract.
- Document the security model (`bindHost` risk) and the `/really-debug` companion-skill relationship in one bounded sentence.
- Present a maintainer decision gate (docs-only / optional installer / default capability) with no pre-selected option and a concrete follow-on action per choice.

## User Stories

### US-001: Feasibility spike — headless VS Code extension host in Debian bookworm-slim

**Description:** As a harness maintainer, I want a documented feasibility assessment of running DebugMCP's VS Code extension in the current devcontainer so that all subsequent docs and probe work is grounded in verified facts.

**Acceptance Criteria:**

- [ ] `docs/integrations/debugmcp.md` is **created** with a `## Feasibility` section split into two tiers: **Container-side (headless, no host IDE)** — `code serve-web`, code-server (apt/binary); and **Operator-side (requires host VS Code)** — Attach-to-Container (devcontainer Option B), Remote-SSH (Option C).
- [ ] The section states plainly that the filed open question is the **container-side** one; operator-side paths are noted as available-but-host-dependent, not given equal weight.
- [ ] Each path verdict is exactly one of `VIABLE` (with evidence), `BLOCKED` (with exact constraint text), or `UNVERIFIED` (with what would confirm it). No bare "unknown"/"works"/"unclear".
- [ ] `grep -q '## Feasibility' docs/integrations/debugmcp.md` exits 0 **and** `grep -qE '\b(VIABLE|BLOCKED|UNVERIFIED)\b' docs/integrations/debugmcp.md` exits 0.
- [ ] No changes to `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`, or `entrypoint.sh` — prose assessment only.

### US-002: MCP registration docs (Claude Code, Codex; Pi/Hermes flagged unverified)

**Description:** As a harness agent operator, I want copy-pasteable MCP registration snippets per agent so that I can activate DebugMCP without guessing config paths or formats.

**Acceptance Criteria:**

- [ ] `docs/integrations/debugmcp.md` gains an `## Agent MCP Registration` section.
- [ ] Codex snippet is a fenced TOML block referencing `.codex/config.toml` (exists; currently has **no** `[mcp_servers.*]` block) with a `[mcp_servers.debugmcp]` block and `url = "http://localhost:3001/mcp"`, plus the `codex mcp add` one-liner.
- [ ] Claude Code snippet is a fenced **JSON** block (machine-parseable, not prose) for project **`.mcp.json`** (note it does **not** exist — operator creates it) with an `mcpServers.debugmcp` entry of `type: "http"`, plus the `claude mcp add --transport http debugmcp http://localhost:3001/mcp` one-liner.
- [ ] Pi and Hermes each have a present section explicitly labeled `unverified — MCP support not confirmed`, with **no** config snippet.
- [ ] Notes these are project-local config files that may be committed to git with the loopback URL visible (not a credential, but flagged).
- [ ] The implementer **must not create** `.mcp.json` — it stays operator-created (committing it would cross the no-default-capability Non-Goal); the story documents it only.
- [ ] `grep -q 'mcp_servers.debugmcp' docs/integrations/debugmcp.md` and `grep -q 'unverified' docs/integrations/debugmcp.md` both exit 0.
- [ ] Typecheck passes.

### US-003: Per-language debug workflow docs (Python, JS/TS, Go, Rust)

**Description:** As a harness coding agent, I want language-specific debug workflow examples using real DebugMCP tool calls so that I can follow a concrete sequence without improvising tool names.

**Acceptance Criteria:**

- [ ] `docs/integrations/debugmcp.md` gains a `## Debug Workflows` section that states the tool surface is **anchored to DebugMCP v2.0.1** (so drift is detectable), with Python, JS/TS, Go, Rust sub-sections.
- [ ] Every tool name used is one of the canonical 13 (v2.0.1): `start_debugging`, `stop_debugging`, `restart_debugging`, `step_over`, `step_into`, `step_out`, `continue_execution`, `add_breakpoint`, `remove_breakpoint`, `clear_all_breakpoints`, `list_breakpoints`, `get_variables_values`, `evaluate_expression`. Verify by extracting every `*_*(`-style tool token in the section and confirming each is in that set (no `get_variable_values`-style typo passes).
- [ ] No CLI `debugger <subcommand>` syntax: `grep -nE '^\s*debugger [a-z]' docs/integrations/debugmcp.md` returns empty (prose mentions of "the debugger" are fine; the guard targets command-line invocation lines only).
- [ ] Each section names its required VS Code extension (`ms-python.python`; built-in `js-debug`; `golang.Go`; `rust-lang.rust-analyzer` **plus** a DAP provider such as `vadimcn.vscode-lldb`/CodeLLDB — rust-analyzer alone ships no debug adapter).
- [ ] Each scenario includes ≥ `start_debugging`, one breakpoint tool, one inspection tool, `stop_debugging`.
- [ ] **Feasibility honesty:** if US-001's container-side verdict is `UNVERIFIED` or `BLOCKED` for all headless paths, each workflow carries a one-line "pending feasibility confirmation (see `## Feasibility`)" note; no workflow is presented as verified-working.
- [ ] Typecheck passes.

### US-004: Eval probe `evals/probes/debugmcp-availability.sh`

**Description:** As a harness eval runner, I want a deterministic probe reporting DebugMCP runtime availability so that evals detect whether the extension is active without starting a VS Code host themselves.

**Acceptance Criteria:**

- [ ] `evals/probes/debugmcp-availability.sh` is **created**, executable, and follows the existing tier/source/desc header comment pattern.
- [ ] **Precise 3-state contract:**
  - **SKIPPED (exit 2):** port 3001 is not bound / connection refused / not reachable (the clean-sandbox default).
  - **PASS (exit 0):** port 3001 is bound **and** `GET /mcp` returns HTTP 2xx with a DebugMCP-consistent content-type (`text/event-stream` or `application/json`).
  - **REGRESSION (exit 1):** port 3001 is bound **but** `/mcp` does not respond as above (non-2xx, wrong/empty content-type) — a definite detected-bad-state, never the catch-all for timeouts.
- [ ] All human output to stderr (`>&2`); `bash <probe> 2>/dev/null` produces no stdout.
- [ ] Probe starts no process: `grep -E '(^|[^a-z])(code|code-server|node|npm)([^a-z]|$)' evals/probes/debugmcp-availability.sh` returns empty.
- [ ] Uses `curl -sf` (or a strict-mode-guarded portable check) — **not** a hard `nc` dependency, and not an unguarded bash `/dev/tcp` that would exit 1 on a closed port under `set -euo pipefail`.
- [ ] Cleans up any probe-opened resource via `trap ... EXIT` (close the fd if `/dev/tcp` is used; no-op if `curl`).
- [ ] `evals/RESULTS.md` gains a **single hand-inserted row** for `debugmcp-availability` with initial status **SKIPPED** (the clean-sandbox truth), inserted in alphabetical probe-id order. Do **not** regenerate the table or churn other rows' timestamps.
- [ ] Typecheck passes.

### US-005: Security note — `bindHost` risk + `/really-debug` skill relationship

**Description:** As a harness maintainer, I want explicit documentation of DebugMCP's security model so that operators understand the attack surface before configuring non-default bind hosts.

**Acceptance Criteria:**

- [ ] `docs/integrations/debugmcp.md` gains a `## Security` section.
- [ ] States that setting `debugmcp.bindHost` to a non-loopback address exposes an **unauthenticated** `evaluate_expression` endpoint — a do-not-do (`grep -q 'unauthenticated' …` exits 0).
- [ ] Clarifies Host/Origin validation is a **DNS-rebinding** defense, not an intra-container process defense (`grep -q 'DNS-rebinding' …` exits 0).
- [ ] References the `/really-debug` companion skill in **one sentence** as a design consideration (auto-install relationship to `.mifune/skills` + provider symlinks) — not a substantive description of a skill that does not exist (`grep -q 'really-debug' …` exits 0).
- [ ] No `.mifune/skills/really-debug/` directory is created.
- [ ] Typecheck passes.

### US-006: Wiki entry `wiki/debugmcp.md`

**Description:** As a harness agent, I want a wiki entry for DebugMCP so that `/wiki-query` can load integration facts into context without re-reading the full doc each session.

**Acceptance Criteria:**

- [ ] `wiki/debugmcp.md` is **created** with valid YAML frontmatter per `.mifune/skills/wiki-ingest/references/schema.md` §2: `title`, `slug: debugmcp`, `tags` (incl. `mcp`, `debugging`), `created`/`updated` = today (UTC), `sources` (≥ the raw snapshot path), `related` (≥ one existing slug), `confidence: provisional`.
- [ ] All required frontmatter present: `awk '/^---$/{f=!f; next} f{print}' wiki/debugmcp.md` output contains `title:`, `slug: debugmcp`, `tags:`, `sources:`, `related:`, `confidence:` (grep each).
- [ ] A `wiki/raw/<YYYY-MM-DD>-debugmcp.md` snapshot exists, **force-added** (`git add -f` — `wiki/raw/*` is gitignored), capturing the **v2.0.1 tool schema** as the version anchor.
- [ ] Body sections in order: `## Relevant Source Files`, `## Summary`, `## Detail`, `## See Also`; body ≤ 600 words.
- [ ] `## Detail` states the current feasibility status (mirrors US-001's verdict) so the entry is not aspirational; `confidence` stays `provisional` until feasibility is `VIABLE`.
- [ ] `## See Also` cross-links ≥ one **existing** wiki slug, preferring the closest sandbox-constraint adjacency (e.g. `[[sandbox-auth-volumes]]`); inbound-orphan status is expected and acceptable.
- [ ] `wiki/README.md` is regenerated deterministically (via `/wiki-lint` or the `wiki-readme-index.sh` logic) and contains a `debugmcp` row; `bash evals/probes/wiki-readme-index.sh` passes.
- [ ] Typecheck passes.

### US-007: Maintainer decision gate

**Description:** As a harness maintainer, I want a structured decision gate so that I can choose integration depth with full awareness of trade-offs, no pre-selected recommendation, and a concrete follow-on action per choice.

**Acceptance Criteria:**

- [ ] `docs/integrations/debugmcp.md` gains a `## Maintainer Decision Gate` section with exactly three options: docs-only / optional installer / default capability.
- [ ] Each option names ≥ one trade-off; none is marked recommended/preferred/default (`grep -iE '(recommended|preferred|default option)'` within the gate section returns empty).
- [ ] The decision-gate section prescribes no `Dockerfile`/`entrypoint.sh` change (those are post-decision only).
- [ ] A `## Next Steps` stub provides a **separate** **pre-written non-executable** `gh issue create` body — one fenced block per non-docs-only option (optional installer, default capability) — so the maintainer's choice has a concrete follow-on action rather than relying on memory.
- [ ] `grep -q 'Decision Gate' docs/integrations/debugmcp.md` exits 0.
- [ ] Typecheck passes.

## Functional Requirements

- FR-1: All integration documentation lives in a single new file `docs/integrations/debugmcp.md`, modeled on sibling integration docs (`docs/integrations/slack.md`, `github.md`) including Docusaurus `title`/`sidebar_position` frontmatter where siblings carry it.
- FR-2: The eval probe is read-only with respect to runtime — it detects, never activates, and leaves no orphan process or bound port.
- FR-3: Claude Code MCP registration is documented as project `.mcp.json` (not `.claude/settings.json`); Codex as `.codex/config.toml`.
- FR-4: Pi and Hermes are never asserted as MCP-capable; they are labeled unverified.
- FR-5: The wiki entry follows `.mifune/skills/wiki-ingest/references/schema.md` schema and keeps `wiki/README.md` index-consistent.
- FR-6: The tool surface and every parameter claim are anchored to DebugMCP v2.0.1.

## Non-Goals (Out of Scope)

- Claiming DebugMCP runs in the devcontainer today — US-001 may land `UNVERIFIED`; this documents the integration contract and feasibility status, not a proven-working capability.
- Writing a `.mifune/skills/really-debug` companion skill — `/really-debug` is a **named future possibility**, not a planned artifact of this PR.
- Making DebugMCP a default sandbox capability before the decision gate.
- Editing `Dockerfile`/`entrypoint.sh`/`devcontainer.json`, or reserving port 3001 in `forwardPorts` (all post-decision only).
- Asserting Pi or Hermes MCP support as fact.
- Vendoring or copying DebugMCP source.

## Technical Considerations

- **Same-file sequencing (critical for `/delegate`):** US-002, US-003, US-005, US-007 all edit the *same* `docs/integrations/debugmcp.md`. US-001 **creates** the file; the rest **append** sections. These docs stories run **sequentially** (Ralph's one-story-per-iteration order handles this) and are **not** safe to parallel-fan-out. Only **US-004** (probe; disjoint path) is safely parallel once US-001 lands. **US-006 (wiki) depends on US-002/003/005** and must run after them (priority 6) — it carries their final content forward; it is **not** parallelizable.
- **Repo facts (validated against disk):** `.codex/config.toml` exists, no `[mcp_servers.*]` block yet; `.mcp.json` does not exist; `.pi/settings.json` exists (Pi MCP unverified); Dockerfile base `debian:bookworm-slim`, no `code`/`code-server`/VS Code server binary installed at build time; `forwardPorts` is empty.
- **Probe template:** `evals/probes/agent-browser-cli.sh` is the canonical 3-state model (`exit 2`=SKIPPED, `exit 1`=REGRESSION, `exit 0`=PASS, all messages `>&2`). REGRESSION there means a *definite detected-bad-state*, not a catch-all — US-004 mirrors that.
- **RESULTS.md discipline:** hand-insert only the new probe row (status `SKIPPED`, alphabetical position); `git checkout` timestamp churn on existing rows (lesson: a probe-adding PR commits one row, not a regenerated table).
- **Version anchor:** the 13-tool surface, `start_debugging` params (`fileFullPath` + `workingDirectory`), `add_breakpoint` content-matching (`lineContent`), and `get_variables_values` `scope` are all as of **v2.0.1**; the `wiki/raw` snapshot pins this so future drift is detectable.
- **docs-build decoupling:** the Docusaurus `docs:build` job is decoupled from ci-harness; broken MDX in `debugmcp.md` surfaces only at release build — keep the doc plain Markdown/MDX-safe.

## Wiki Alignment

**Impact: REQUIRED.**

- **Local entries:** existing related wiki entries are `sandbox-auth-volumes` (sandbox-env constraints — closest adjacency to the feasibility spike), `pi-messenger-bridge` (agent integration), `pi-fff`. No existing `debugmcp` entry.
- **Spec alignment:** US-006 creates `wiki/debugmcp.md` capturing the integration facts (MCP server on `:3001/mcp`, 13-tool v2.0.1 surface, MIT license, loopback security model, **and the feasibility verdict from US-001**) and must reflect the **final** documented state once US-002–US-005 land — including the feasibility status, not aspirational framing. `confidence: provisional` until feasibility is `VIABLE`.
- **DeepWiki comparison:** DebugMCP is a brand-new external integration with no page in the public DeepWiki for `mifunedev/openharness`; there is no existing page to reconcile against, so the new entry establishes the baseline.
- **Wiki acceptance criteria (carried by US-006):** complete frontmatter (`title`/`slug`/`tags`/`created`/`updated`/`sources`/`related`/`confidence`) per `.mifune/skills/wiki-ingest/references/schema.md`, a force-added `wiki/raw/` v2.0.1 snapshot, ≤600-word body in the required section order, ≥1 valid `[[slug]]` cross-link, and `wiki/README.md` regenerated so `evals/probes/wiki-readme-index.sh` passes.

## Success Metrics

- A maintainer can decide the integration depth from `## Maintainer Decision Gate` alone, and act on it immediately via the `## Next Steps` stub.
- `bash evals/probes/debugmcp-availability.sh` exits 2 in a clean sandbox and leaves no listener/process.
- Every MCP tool name in the docs is one of the canonical 13 (v2.0.1); zero `debugger <subcommand>` CLI references; no workflow reads as verified-working if feasibility is UNVERIFIED.

## Open Questions

- Can the headless devcontainer activate the extension host without a host VS Code client supplying the server binary? (US-001 resolves this; it may land `UNVERIFIED` with a named follow-up — and the docs then say so.)
- Which integration depth does the maintainer choose at the gate? (US-007 presents options + follow-on actions; the choice itself is out of scope.)
