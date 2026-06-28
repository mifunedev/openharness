---
sidebar_position: 8
title: "Roadmap"
---

# Roadmap — the B-state north-star

This page is the **single source of truth** for Open Harness's primitive-taxonomy
migration: collapsing five behavior surfaces (skills, agents, hooks, rules,
identity) into **three portable primitives plus one small always-on identity
core**. The full vision is in `.claude/plans/context-as-a-logical-marble.md`.

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

> **Superseded — now generalized to FUNCTION-CLASS.** Export-ness was the
> original axis, but it left OpenHarness's own machinery scattered at root. The
> current rule (see [Namespaces](#namespaces)): a dotdir is earned by
> *function-class* — `.mifune/` holds provider-portable primitives, `.oh/` holds
> OpenHarness's own machinery addressed as one unit, root holds
> external-tooling-forced surfaces + live identity/state. Export is one way a
> namespace is addressed as a unit; being the harness's own tooling is another.

OpenHarness's own machinery — the `oh` CLI, the installer/lifecycle scripts,
and the container-install inputs — is now **grouped
under `.oh/`** so the harness can be addressed as a single unit, and the
top-level `packages/` folder is **retired**. The physical files moved
(`packages/oh → .oh/cli`, `packages/docs → openharness-web`, `scripts → .oh/scripts`,
`install → .oh/install`, plus the canonical `config.json → .oh/config.json`).

The runtime-machinery dirs (`scripts/`, `install/`) keep **tracked back-compat
symlinks at the old root paths** (exactly as `.claude/skills` → `.mifune/skills`),
so every consumer pinning a `scripts/…` / `install/…` literal — skills, cron
bodies, the `Makefile`, the boot-lint glob, vitest, the eval probes — resolves
unchanged. The `oh` CLI moved without a symlink (the `packages/` folder is gone), so
its consumers were repointed to `.oh/cli`. The docs-site package later moved out
entirely: the Docusaurus app/assets/blog now live in
[`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web),
while this core repo keeps GitHub-readable markdown under `docs/` and points
DeepWiki at generated repo navigation. (`evals/`, `crons/`, `context/`,
`memory/`, `tasks/`, `workspace/`, and `docs/` stay at root as live
identity/state/content, not machinery addressed as a unit.)

## Namespaces

This **supersedes** the earlier "earned by EXPORT only" rule: a dotdir namespace
is earned by **function-class**. Three surfaces:

| Namespace | Function-class | Holds |
|---|---|---|
| `.mifune/` | provider-portable primitives (exported to the 4 providers + the `mifunedev/skills` registry) | skills, agents, hooks |
| `.oh/` | OpenHarness's own machinery, addressed as one unit | the `oh` CLI (`cli/`), installer/lifecycle scripts (`scripts/`), container-install inputs (`install/`), deploy config (`config.json`) |
| repo **root** | external-tooling-forced surfaces + live identity/state | `.devcontainer/`, `harness.yaml`, `package.json`, `pnpm-*.yaml`, `.github/` · and `context/`, `evals/`, `crons/`, `memory/`, `tasks/`, `workspace/`, `docs/` content |

Harness-native skills still live in `.mifune/skills/` (not `.oh/`) because they
share the *identical* provider-export mechanism; portability is a property
recorded in `skills.lock` metadata, not a location, so there is no separate
`.oh/skills/`. The split is by function-class, not by repo: both `.mifune/` and
`.oh/` are machinery, divided by whether the artifact is a portable agent
primitive or OpenHarness's own tooling.

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

This page is the roadmap — milestones are **not** pre-filed as GitHub issues.
When a milestone is ready to build, file a single issue for it and add the
`autopilot` label so the self-improvement loop picks it up. Build them in
dependency order (the **Depends on** column); never start a blocked step.

| Milestone | Gist | Depends on | Status |
|---|---|---|---|
| M0 | Namespace taxonomy + B-state north-star (this page) | — | ✅ Done |
| M1 | Agents → `.mifune/agents` | M0 | ✅ Done |
| M2 | `.oh/` config surface (rescope the dead `.openharness/`) | M0 | ✅ Done |
| M3 | Rules → skills (easy first): `remote-installers` delete · `advisor` + `recursive-delegation` → `/advisor` · `wiki` → `wiki/references` · `sandbox-processes` → skill ref | M1 | ✅ Done |
| M4 | Always-on collapse (identity-core): `memory.md` → `/retro` + `AGENTS.md` one-liner; remove `context/rules/` | M3 | ✅ Done |
| M5 | Hooks → `.mifune/hooks` | M1 | ✅ Done |
| M6 | Skill-private scripts → skill dirs (`autopilot-caps`, `prompt-miner-caps`); shared scripts stay at root | M1 | ✅ Done |
| M7 | `.oh/` machinery grouping + retire `packages/`: `packages/oh → .oh/cli`, `packages/docs → .oh/docs` (intermediate), `scripts → .oh/scripts`, `install → .oh/install`, canonical `config.json → .oh/config.json`. Runtime dirs (`scripts/`, `install/`) keep back-compat symlinks (the `.mifune` precedent); package consumers repoint directly and the `packages/` folder is removed. Generalizes the namespace rule from export-ness to function-class. | M2 | ✅ Done |
| M8 | Docs-site extraction: Docusaurus app/assets/blog → `mifunedev/openharness-web`; core repo keeps concise `README.md` + GitHub-readable `docs/README.md`; DeepWiki becomes the generated navigation layer. | M7 | ✅ Done |

## Maintenance pattern

This page is the living north-star — keep it current:

- It is the single source of truth; milestones are tracked **here**, not as a
  bank of pre-filed GitHub issues.
- When you're ready to build the next milestone, file **one** issue for it and
  add the `autopilot` label so the self-improvement loop can pick it up.
- As a milestone ships, tick its **Status** here and mark the next one **Next**.

## Per-rule disposition

The A→B map for each `context/rules/` file:

| Rule | Nature | B-state home | Why |
|---|---|---|---|
| `git.md` | task procedure | done — pointer → `/git` | the template for all the rest |
| `advisor-model.md` | delegation pattern | → `/advisor` skill (or `delegate` references) | invoked when delegating; not always-on |
| `recursive-delegation.md` | extends advisor | → same skill as a `references/` doc | one concept, one home |
| `wiki.md` | schema spec | → `wiki/references/schema.md` | the consolidated `/wiki` skill implements it |
| `memory.md` | end-of-skill protocol + schema | → `/retro` (canonical) + a one-line always-on pointer in `AGENTS.md` | `/retro` already operationalizes it; the protocol must still fire after every skill |
| `sandbox-processes.md` | tmux lifecycle norm | → skill `references/` (cloudflared / t3) | task-triggered |
| `directory-readme.md` | repo-authoring convention | stays a small `context/` doc | applies to this repo's authors, not portable behavior |
| `remote-installers.md` | safety norm, orphan | fold into a skill or delete | no inbound references |
| `README.md` | dir index | regenerate / trim with the tier | — |

## Per-script disposition

A script consolidates into a skill iff exactly one skill-feature owns it (so it
rides along when the skill syncs — the same portability thesis as rules→skills).

> **M7 update:** the "stay at root" verdict below now means *physically in
> `.oh/scripts/`, reachable at `scripts/` via the back-compat symlink* — the
> whole `scripts/` directory was grouped under `.oh/` as OpenHarness machinery.
> The single-owner → SKILL verdicts (`autopilot-caps`, `prompt-miner-caps`) are a
> separate axis and already shipped in M6.

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
| `install.sh`, `harness-config.sh`, `docker-compose.sh`, `check-pnpm-pin.sh` | ✅ Done — moved with the whole dir (M7) | `.oh/scripts/` (symlink at `scripts/`) |
| `sandbox-boot-smoke.sh`, `README.md` | moved with the whole dir (M7) | `.oh/scripts/` (symlink at `scripts/`) |
