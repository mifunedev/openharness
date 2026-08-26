# PRD — `prime-agent` harness surface

**Issue**: #838
**Branch**: `feat/838-prime-agent-harness`
**Slug**: `prime-agent-harness`

## Introduction

Open Harness installs eight agent CLIs but wires only four **provider surfaces** — the
directories that expose the vendored `.oh/skills` primitive pack to a CLI (`.claude/`,
`.codex/`, `.pi/`, and the opt-in `.hermes/skills/openharness`). Prime Intellect's
[`prime-agent`](https://github.com/PrimeIntellect-ai/prime-agent) is its own harness, not
a variant of any of these: project config at `.prime/agent/`, global config and auth at
`~/.prime/agent/`, native `AGENTS.md`/`CLAUDE.md` context loading, an Agent-Skills-standard
loader that discovers skills from `.prime/agent/skills/`, and `APPEND_SYSTEM.md` support.

Nothing in the repo references it today. This PRD adds it as a first-class harness with its
own surface.

## Goals

- An operator can run `oh harness install prime-agent` against a running sandbox and get a
  working CLI **with no image rebuild**.
- On the first launch, `prime-agent` loads `AGENTS.md` and every Open Harness skill, because
  `.prime/agent/skills` is a symlink into the vendored `.oh/skills` pack.
- Both wiring mechanisms know about the surface: `.oh/scripts/link-providers.sh` (the running
  repo) and `oh init` (a fresh scaffold).
- The surface ships a minimal, provider-neutral config — no Pi model pins, no Pi package list.
- Docs name the harness everywhere the other seven are named.
- The existing parity oracle `.oh/evals/probes/skills-vendored.sh` covers the new surface,
  including the clean-clone proof.

## Non-goals

Deferred deliberately, and recorded on issue #838 as follow-ups:

- **Image-level install.** No `ARG INSTALL_PRIME_AGENT` in `.devcontainer/Dockerfile`, no
  compose build arg, no `prime-auth` volume, no key in either `.example.env`. The catalog
  entry is therefore `kind: "on-demand"` (the `t3code` precedent). Adding those later
  promotes it to `optional`.
- **Build-executor wiring.** `.oh/scripts/firstmate.sh` hardcodes `claude | pi | codex`;
  `FIRSTMATE_HARNESS_CMD` is the documented escape hatch until that changes.
- **Cron fallback chain.** `isValidAgentBin()` is a pattern check, so `agent: prime-agent`
  already works in cron frontmatter; only the claude→codex fallback would need an edit.
- **Messenger bridge.** `.oh/scripts/gateway.sh` accepts only `pi | hermes`.

## Facts that drive the design

| Concern | Value |
|---|---|
| Binary | `prime-agent` |
| Install | `curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh \| sh` → npm global install of a versioned tarball; needs Node ≥ 20.6 (the image has it) |
| Project config | `.prime/agent/settings.json` |
| Global config / auth | `~/.prime/agent/` (`auth.json`, `sessions/`, `telemetry.json`) |
| Skill discovery | `.prime/agent/skills/` — directories containing `SKILL.md`, recursive |
| System prompt | `.prime/agent/APPEND_SYSTEM.md` (append) or `SYSTEM.md` (replace) |
| Context files | Native `AGENTS.md` / `CLAUDE.md` — no alias work needed |
| Headless | `-p/--print`, `--mode json`, `--mode rpc`, `--autonomous --autonomous-gate <cmd>` |

## User stories

1. **US-001** — Wire `.prime/agent/skills` in `link-providers.sh`.
2. **US-002** — Wire the same link in the `oh init` scaffolder.
3. **US-003** — Ship the `.prime/agent/` config surface (live + template).
4. **US-004** — Ignore prime runtime state.
5. **US-005** — Add the on-demand harness catalog entry.
6. **US-006** — Own `~/.prime` in the container entrypoint.
7. **US-007** — Document the harness.
8. **US-008** — Extend the parity probe.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/prime-agent-harness.md` to create
- **Spec alignment**: The entry must describe `prime-agent` as its own harness with its own
  provider surface — not a variant of Pi — and state the two independent wiring mechanisms
  (`link-providers.sh` for a live repo, `oh init`'s `PROVIDER_LINKS` for a fresh scaffold),
  the `kind: "on-demand"` catalog classification and why this pass chose it over `optional`,
  and the non-goals above so a reader does not assume image-level install exists.
- **Acceptance criteria**: carried by US-007 — the entry exists, cites the source files and
  line numbers for each claim, carries a `## See Also`, and
  `bash .oh/evals/probes/wiki-readme-index.sh` passes after a `/wiki lint` index refresh.
