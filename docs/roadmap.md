---
sidebar_position: 8
title: "Roadmap"
---

# Roadmap — the B-state north-star

This page is the maintained north-star for Open Harness's primitive-taxonomy
migration: collapsing five behavior surfaces (skills, agents, hooks, rules,
identity) into **three portable primitives plus one small always-on identity
core**. It mirrors the pinned `roadmap` epic
[#301](https://github.com/ryaneggz/openharness/issues/301); the source of truth
for the full vision is `.claude/plans/context-as-a-logical-marble.md`.

## Vision

Skills moved to `.mifune/skills/` because a skill is a **portable primitive** —
it works across Claude, Codex, Pi, and Hermes. That exposed the real
consolidation target: **rules (`context/rules/`) are Claude-Code-only.** Only
`.claude/rules` auto-loads them; Codex, Pi, and Hermes do not. A "rule" is thus a
*non-portable* mechanism holding *provider-agnostic* knowledge — a mismatch.

The B-state **deprecates the rules tier into skills**, so behavioral norms become
portable across every provider instead of Claude-only. The pattern is already
proven on one rule: `context/rules/git.md` is a three-line pointer whose source
of truth is the `/git` skill. Every other rule follows that template.

The headline: **the rules tier disappears.** Norms that are *task-triggered*
become skills (loaded on demand — no permanent context tax). Norms that must be
*always-on* shrink to one-line pointers in `AGENTS.md` / identity. The result is
fewer primitive types, portable behavior, and a single source of truth per norm.

## The export-ness axis

The governing principle for every namespace decision:

> **A dotdir namespace is earned by EXPORT — being addressed as a unit by an
> external consumer (providers, a registry, an installer/CLI) — not by
> ownership.**

Machinery (`scripts/`, `evals/`, `crons/`, `context/`) stays at the repo root
because it is consumed *in place* by this repo's own runtime — `cron-runtime`
resolves `crons/`, the eval runner resolves `ROOT/evals/`, skills call
`scripts/ralph.sh`. No *external* consumer addresses these as a unit, so they
fail the export test. Relocating them would buy dozens of reference rewrites and
runtime-path breakage for zero export gain — and a hidden dotdir hurts the
discoverability of directories humans actively navigate.

## Namespaces

Three surfaces, keyed by external consumer:

| Namespace | External consumer | Holds |
|---|---|---|
| `.mifune/` | the 4 providers + the `mifunedev/skills` registry | portable primitives: skills, agents, hooks |
| `.oh/` *(proposed)* | the `oh` CLI + `oh harness add` + container build | deploy/compose overrides, install/pack config (rescopes the dead `.openharness/`) |
| repo **root** | this repo's own runtime | machinery + identity: `scripts/`, `evals/`, `crons/`, `context/`, `install/` (consumed in place) |

`.oh/` is worth creating, but **only** as the `oh`-CLI / installer config surface
— it does not absorb the runtime machinery. Harness-native skills still live in
`.mifune/skills/` because they share the *identical* export mechanism;
portability is a property recorded in `skills.lock` metadata, not a location, so
there is no separate `.oh/skills/`.

## A-state to B-state

The primitive taxonomy collapses from five behavior surfaces to three portable
primitives plus one small always-on identity core:

| | A-state (today) | B-state (target) |
|---|---|---|
| Portable (`.mifune/`) | `skills/` (agents still in `.claude/`) | `skills/` · `agents/` · `hooks/` — all behavior lives here |
| Always-on identity (`context/`) | `rules/` (auto-loaded, Claude-only) + SOUL / IDENTITY / TOOLS / USER / REPO_MAP | SOUL / IDENTITY / TOOLS / USER / REPO_MAP — no `rules/` tier, or pointers only |
| Provider dirs | `.claude` `.codex` `.pi` `.hermes` (config + symlinks) | `.claude` `.codex` `.pi` `.hermes` (thin config + symlinks) |

Five behavior surfaces become **3 portable + 1 small always-on core**:
`{skills, agents, hooks, rules, identity}` → `{skills, agents, hooks}` +
`{identity}`. Each milestone below is an independently shippable, reversible step
in that sequence; the eval suite is the oracle at every step.

## Milestones

Each milestone is a `roadmap`-labeled GitHub issue. Only the **next-ready**
milestone also carries the `autopilot` label, so autopilot
(oldest-open-`autopilot`-first) builds milestones in dependency order and never
jumps to a blocked step. M1 is the next-ready `autopilot` step.

| Milestone | Gist | Depends on | Status | Issue |
|---|---|---|---|---|
| M0 | Namespace taxonomy + B-state north-star (this page + the milestone issues) | — | In progress (this PR) | [#302](https://github.com/ryaneggz/openharness/issues/302) |
| M1 | Agents → `.mifune/agents` — **`autopilot` next-ready** | M0 | Planned | [#303](https://github.com/ryaneggz/openharness/issues/303) |
| M2 | `.oh/` config surface (rescope the dead `.openharness/`) | M0 | Planned | [#304](https://github.com/ryaneggz/openharness/issues/304) |
| M3 | Rules → skills (easy first): `remote-installers` delete · `advisor` + `recursive-delegation` → `/advisor` · `wiki` → `wiki-ingest/references` · `sandbox-processes` → skill ref | M1 | Planned | [#305](https://github.com/ryaneggz/openharness/issues/305) |
| M4 | Always-on collapse (identity-core): `memory.md` → `/retro` + `AGENTS.md` one-liner; remove `context/rules/` | M3 | Planned | [#306](https://github.com/ryaneggz/openharness/issues/306) |
| M5 | Hooks → `.mifune/hooks` | M1 | Planned | [#307](https://github.com/ryaneggz/openharness/issues/307) |
| M6 | Skill-private scripts → skill dirs (`autopilot-caps`, `prompt-miner-caps`); shared scripts stay at root | M1 | Planned | [#308](https://github.com/ryaneggz/openharness/issues/308) |

## Maintenance pattern

The roadmap self-advances:

- The pinned `roadmap` epic ([#301](https://github.com/ryaneggz/openharness/issues/301))
  lists all milestones; this page mirrors it for the `/roadmap` view. This is the
  living north-star.
- Each milestone is a `roadmap`-labeled issue. Only the next-ready milestone also
  carries the `autopilot` label.
- As a milestone merges: tick it on this page, then promote the next milestone by
  adding the `autopilot` label to its issue.

## Per-rule disposition

The A→B map for each `context/rules/` file:

| Rule | Nature | B-state home | Why |
|---|---|---|---|
| `git.md` | task procedure | done — pointer → `/git` | the template for all the rest |
| `advisor-model.md` | delegation pattern | → `/advisor` skill (or `delegate` references) | invoked when delegating; not always-on |
| `recursive-delegation.md` | extends advisor | → same skill as a `references/` doc | one concept, one home |
| `wiki.md` | schema spec | → `wiki-ingest/references/schema.md` | the `/wiki-*` skills already implement it |
| `memory.md` | end-of-skill protocol + schema | → `/retro` (canonical) + a one-line always-on pointer in `AGENTS.md` | `/retro` already operationalizes it; the protocol must still fire after every skill |
| `sandbox-processes.md` | tmux lifecycle norm | → skill `references/` (cloudflared / t3) | task-triggered |
| `directory-readme.md` | repo-authoring convention | stays a small `context/` doc | applies to this repo's authors, not portable behavior |
| `remote-installers.md` | safety norm, orphan | fold into a skill or delete | no inbound references |
| `README.md` | dir index | regenerate / trim with the tier | — |

## Per-script disposition

A script consolidates into a skill iff exactly one skill-feature owns it (so it
rides along when the skill syncs — the same portability thesis as rules→skills).
Shared, runtime, or concurrency scripts **stay at root**.

| Script | Verdict | Target |
|---|---|---|
| `locked-append.sh` | STAY — concurrency primitive, max-shared | root |
| `cron-runtime.ts` | STAY — the cron engine (runtime) | root |
| `ralph.sh` | STAY — shared build executor (spec-* + autopilot) | root |
| `ablate.sh` | STAY — shared ablation harness (audit family) | root |
| `autopilot-caps.sh` | → SKILL | `.mifune/skills/autopilot/` |
| `prompt-miner-caps.sh` | → SKILL | `.mifune/skills/prompt-miner/` |
| `sandbox-healthcheck.sh` | → SKILL *(verify `/health-check` owns it)* | `.mifune/skills/health-check/` |
| `repo-orientation-benchmark-score.mjs` | → SKILL *(verify `/benchmark` owns it)* | `.mifune/skills/benchmark/` |
| `install.sh`, `harness-config.sh`, `docker-compose.sh`, `check-pnpm-pin.sh` | → `.oh/` (M2 surface) | `.oh/` |
| `sandbox-boot-smoke.sh`, `README.md` | STAY | root |
