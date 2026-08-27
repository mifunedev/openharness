---
title: "Prime Agent"
---

# Prime Agent

Prime Agent is Prime Intellect's terminal coding agent. It is its own harness — not a
variant of any other CLI listed here — with its own config surface at `.prime/agent/`, its
own global state at `~/.prime/agent/`, and a daemon that keeps sessions alive in the
background so you can detach from one and attach to it later.

It reads `AGENTS.md` and `CLAUDE.md` natively, and it implements the
[Agent Skills standard](https://agentskills.io/specification), so the vendored Open Harness
skill pack reaches it through the same symlink mechanism the other providers use.

## Install

Prime Agent is **not baked into the sandbox image**. Install it into the running container
on demand:

```bash
oh harness install prime-agent
```

That is the whole install — there is no `INSTALL_*` flag to set and no image rebuild, so
`oh harness install prime-agent --persist-only` has nothing to persist. The command runs the
upstream installer, which resolves the latest release, verifies its checksum, and does an
npm global install under the sandbox user's own prefix (`/home/sandbox/.local`), the same
prefix Pi uses. `prime-agent update` therefore needs no sudo.

The manual equivalent:

```bash
curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh
```

Node ≥ 20.6 is required; the sandbox image already satisfies it.

## Verify installation

```bash
prime-agent --version
```

## Authentication

Run `prime-agent`, then `/login`. Prime Agent supports subscription providers over OAuth and
API-key providers over environment variables:

- **Subscriptions**: ChatGPT Plus/Pro (Codex), Claude Pro/Max, GitHub Copilot.
- **API keys**: set the provider's environment variable, or store the key through `/login`.

Credentials land in `~/.prime/agent/auth.json`. That path is covered by the repo's
`**/auth.json` ignore rule, so a key can never be committed by accident. The container
entrypoint chowns `~/.prime` to the sandbox user, so `/login` can write there after an
on-demand install.

Resolution order is: environment variable, then the `auth.json` entry (API key or OAuth
token). Full provider matrix: `docs/providers.md` inside the installed package.

## Configuration

| Path | Scope |
|---|---|
| `.prime/agent/settings.json` | Project — tracked in this repo |
| `~/.prime/agent/settings.json` | Global, per machine |
| `.prime/agent/APPEND_SYSTEM.md` | Appends to the system prompt (`SYSTEM.md` replaces it) |
| `.prime/agent/skills/` | Project skills — a symlink into the vendored `.oh/skills` pack |
| `~/.prime/agent/auth.json` | Credentials (gitignored) |
| `.prime/agent/sessions/`, `.prime/agent/telemetry.json` | Runtime state (gitignored) |

The tracked `.prime/agent/settings.json` is deliberately minimal: a theme, a default
thinking level, and the steering/follow-up modes. It pins no model and no provider, so the
choice stays yours and the file needs no edit when upstream's model catalog moves.

## How the Open Harness skills reach the agent

`.prime/agent/skills` is a symlink to `../../.oh/skills`, the vendored primitive pack every
provider surface shares. `bash .oh/scripts/link-providers.sh --init` creates it and
`--check` verifies it; `oh init` creates the same link when scaffolding a fresh project.
Prime Agent discovers any directory containing a `SKILL.md` recursively under that path, so
a skill added to `.oh/skills/` is visible to Prime Agent with no further wiring.

`AGENTS.md` is loaded natively — Open Harness needs no provider-specific alias for it.

## Headless and background use

```bash
prime-agent -p "summarize the build failure"      # print a response and exit
prime-agent --mode json -p "..."                  # structured output
prime-agent --autonomous --autonomous-gate "npm test"   # loop until the gate passes
```

Sessions are daemon-backed. `prime-agent list` shows running agents, `attach` reattaches to
one, `stop` ends one, `status` and `doctor` inspect the background services, and `shutdown`
stops all of them.

## Not wired yet

These are deliberate gaps, not oversights:

- **No image-level install.** There is no `INSTALL_PRIME_AGENT` build arg, no compose auth
  volume, and no key in `.devcontainer/.example.env`. The harness is `on-demand` only.
- **No `/spec execute` provider integration.** `/spec execute` uses the active Advisor
  session and does not launch a provider-specific wrapper; run Prime Agent directly only
  for a bounded, explicitly selected task.
- **No messenger bridge.** `.oh/scripts/gateway.sh` accepts only `pi` and `hermes`.

## Upstream

[PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent). The
installed package ships its own docs under
`$(npm root -g)/prime-agent/docs/` — `providers.md`, `settings.md`, `skills.md`, and
`usage.md` are the ones this page draws on.

## See also

- [Harnesses Overview](./overview.md)
- [Pi](./pi.md) — the other npm-installed CLI under the sandbox user's prefix
