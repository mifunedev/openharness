# OpenHarness Ideal Customer Profile

This document fixes the v1 ICP. It is written to be read by both humans
making editorial decisions about README/docs/blog, and the orchestrator
deciding whether a feature request fits the product. When a request
doesn't fit, point at this document and decline.

## Primary persona

A **single working developer** building one ambitious project who wants
an autonomous agent loop helping with that project on a laptop or a
small cloud VPS they own. They:

- write code professionally (or are pursuing it seriously)
- run Docker locally and are comfortable on a terminal
- use Claude Code (or are willing to) as their default coding agent
- want their host machine to stay clean — toolchains live in a sandbox
- value owning the harness over renting a SaaS

This is **one developer, one project, one harness** — agent-tended
over time. The harness lives in the project repo and ships with it.

## Jobs to be done

1. **Stop polluting my laptop.** Every new agent CLI ships its own
   Node version, Python version, system tool list. The sandbox absorbs
   that — host stays Docker + git + an editor.
2. **Give my coding agent durable context.** Identity, memory, and
   schedule files live in the repo, version-controlled, so the agent
   picks up where it left off across sessions and machines.
3. **Run scheduled work without standing up infrastructure.** A small
   cron runtime inside the sandbox fires recurring tasks (cleanup,
   wiki lint, PR babysit) — no Kubernetes, no managed scheduler, no
   third-party service.

## Top three needs

1. **One-command provisioning.** `docker compose up -d --build` on a
   fresh laptop produces a working sandbox in under ten minutes.
2. **A clean upgrade path.** The harness is a folder of plain files
   (Dockerfile, compose, scripts, markdown) — version it, fork it,
   diff it, merge it. No hidden state.
3. **Extension via packs, not core changes.** Add Pi/Mom Slack, a
   different default agent, custom crons — install a pack, leave the
   core harness alone.

## Anti-ICP — who this is NOT for

| Not for | Why |
|---|---|
| **Multi-tenant SaaS operators** | OpenHarness is a per-developer harness, not a hosted multi-tenant agent runtime. No quota, no billing, no tenant isolation beyond the host's user/UID model. |
| **Non-developers** | Setting up the sandbox requires Docker, git, a terminal, and willingness to read a Dockerfile when something breaks. There is no GUI, no managed dashboard, no "just sign up" path. |
| **Production agent operators** | The sandbox is a development substrate. It has no SLA, no observability beyond tmux logs, no multi-region replication. Don't run customer-facing agents on it. |
| **Comparison-shopping tinkerers** | OpenHarness is opinionated: Claude Code default, Docker substrate, single project per harness, packs for the rest. If the appeal is "let me race five CLIs side-by-side and pick a winner," that workflow is not the v1 product surface — pin v0 (April 2026) for it. |

## How to apply this

When evaluating a feature request, doc rewrite, or marketing copy:

- Does it serve **one developer building one project**? Keep.
- Does it serve **multi-tenant SaaS operators** or **non-developers**?
  Decline; point at this file.
- Does it require **multi-agent comparison framing** to make sense?
  Belongs in a pack (e.g., `@ryaneggz/mifune`) or a v0 archived blog
  post — not in the v1 surface.
- Is it **production observability / SRE work**? Out of scope; treat
  the sandbox as a dev environment, not a runtime platform.

## Versioning

This file is the v1 ICP statement. v0 framing (multi-agent
comparison, "run Claude/Codex/Gemini side-by-side") is preserved in
`blog/archive/` for history and explicitly rejected here. Future ICP
shifts get a new version section above this one — never edit the
existing statement; append.
