# PRD — B-state roadmap (M0): namespace taxonomy + north-star

> Milestone **M0** of the B-state roadmap epic (#301). Source of truth for the
> full vision, taxonomy, and per-rule / per-script dispositions:
> `.claude/plans/context-as-a-logical-marble.md`.

## Problem

Open Harness's behavioral surface is split across **five primitive types** —
skills, agents, hooks, rules, identity. Four of them are portable, but
`context/rules/` is **Claude-Code-only**: only `.claude/rules` auto-loads it, so
Codex / Pi / Hermes never see those norms (`AGENTS.md:31` admits it). A "rule" is
thus a *non-portable* mechanism holding *provider-agnostic* knowledge — a
mismatch. The fix is a multi-milestone migration (rules→skills, agents→`.mifune/`,
a `.oh/` config surface), and a migration of that size needs a **maintained,
forward-looking roadmap** that autopilot can build in dependency order.

## Goal (M0 only)

Stand up the roadmap surface — **no migration executed in this unit.** Ship a
Docusaurus `docs/roadmap.md` north-star, plus the GitHub tracking state (a pinned
`roadmap` epic and one issue per milestone M0–M6), with the first buildable
milestone (M1, agents → `.mifune/agents`) promoted to the `autopilot` label.

## Non-Goals (explicitly deferred to M1–M6)

- No `git mv` (agents, scripts), no rule deletion, no skill authoring.
- No `.oh/` directory creation, no `AGENTS.md` rewrite, no session-start loader change.
- No `wiki/` entry authoring.

## The taxonomy this roadmap encodes

**Export-ness axis** — a dotdir namespace is earned by being *addressed as a unit
by an external consumer*, not by ownership:

| Namespace | External consumer | Holds |
|---|---|---|
| `.mifune/` | the 4 providers + `mifunedev/skills` registry | portable primitives: skills, agents, hooks |
| `.oh/` *(proposed)* | the `oh` CLI + installer + container build | deploy/compose overrides, install/pack config (rescopes the dead `.openharness/`) |
| repo **root** | this repo's own runtime | machinery: `scripts/`, `evals/`, `crons/`, `context/`, `install/` (consumed in place) |

The B-state collapses 5 behavior surfaces → **3 portable** (`skills` · `agents` ·
`hooks` in `.mifune/`) **+ 1 small always-on identity core**. `context/rules/`
disappears; `git.md`'s 3-line pointer to `/git` is the proven precedent.

## Milestone graph (the maintained TaskGraph)

| M | Milestone | Issue | Depends on | autopilot |
|---|-----------|-------|------------|-----------|
| M0 | Namespace taxonomy + north-star (this unit) | #302 | — | — |
| M1 | Agents → `.mifune/agents` | #303 | M0 | ✅ |
| M2 | `.oh/` config surface | #304 | M0 | — |
| M3 | Rules → skills (easy first) | #305 | M1 | — |
| M4 | Always-on collapse (identity-core) | #306 | M3 | — |
| M5 | Hooks → `.mifune/hooks` | #307 | M1 | — |
| M6 | Skill-private scripts → skill dirs | #308 | M1 | — |

Maintenance: only the next-ready milestone carries `autopilot`; as each merges,
tick `docs/roadmap.md` + the epic and promote the next.

## Wiki Alignment

- **Impact: NOT-APPLICABLE.**
- **Local entries:** none touched. `wiki/README.md` index unchanged.
- **Rationale:** M0 ships a *human-facing* Docusaurus roadmap page (`docs/`) plus
  GitHub issues — neither is the LLM-facing `wiki/` corpus. Authoring a wiki
  taxonomy entry (the "export-ness" synthesis) is a candidate for a later
  milestone but is out of M0 scope per the approved plan's Non-Goals (no skill /
  wiki authoring in M0).
- **DeepWiki comparison:** the DeepWiki treatment of `mifunedev/openharness` is
  architecture-first; the roadmap page mirrors that spirit (namespace table,
  A→B sequence) without adding a `wiki/` entry this unit.

## Acceptance criteria (rollup)

1. `docs/roadmap.md` exists, valid Docusaurus frontmatter, all sections present.
2. `roadmap` label exists; epic #301 pinned + `roadmap`-labeled + links M0–M6.
3. Issues #302–#308 open and `roadmap`-labeled; #303 (M1) also `autopilot`.
4. `CHANGELOG.md` `[Unreleased]` carries an `### Added` entry referencing #302.
5. No migration artifact changed (no `git mv`, rule deletion, skill/wiki authoring).
