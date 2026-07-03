# Repair-operator registry

A named catalogue of the **repair classes** the self-improving harness may
apply to itself, ordered by how much trust each one is granted before it may
touch state. This is the concrete realization of item 7 of the
[self-improving harness roadmap](rfcs/rfc-selfimprove-roadmap.md) — *"Scoped
repair-operator registry … define safe-by-default, stronger-gate, and
human-approval-required repair classes that proposal generation and audit can
enforce."*

**This registry documents behavior the harness already enforces; it adds no
new runtime machinery.** Each tier below points at the *existing* mechanism
that already draws the line — a proposal generator or an auditor cites this
page instead of re-deriving the boundary.

> **The safe tier is guarded by a path set, not a hook.** There is no
> `owned-surface-guard` *hook* on disk. The tier-1 boundary is the
> `OWNED_PATHS` array in `.oh/skills/autopilot/SKILL.md` (the §1 clean-state
> check and every §5–§7 restore scope to it). The only file on disk named
> `owned-surface-guard.sh` is the eval probe
> `.oh/evals/probes/owned-surface-guard.sh`, which asserts the array is used in
> its word-splitting `"${OWNED_PATHS[@]}"` form — it is a *test of* the tier-1
> surface, not a separate enforcer and not a tier source.

## Tier 1 — safe-by-default

Edits confined to the harness-infra self-edit surface. The unattended loop
mutates only these paths; a foreign edit outside the set neither blocks a run
nor is clobbered by the restore. A repair whose entire file set is inside this
surface is **safe-by-default** — no extra gate beyond the standard build ⇄ audit
loop and the human merge.

**Source of truth — `OWNED_PATHS`, defined once at `.oh/skills/autopilot/SKILL.md:134`:**

```bash
OWNED_PATHS=(.claude/ .oh/context/ docs/ scripts/ .oh/crons/ .oh/skills/wiki/ .oh/evals/ .oh/memory/ .oh/tasks/ CHANGELOG.md)
```

The tier-1 surface is exactly those ten tokens, verbatim:

```
.claude/
.oh/context/
docs/
scripts/
.oh/crons/
.oh/skills/wiki/
.oh/evals/
.oh/memory/
.oh/tasks/
CHANGELOG.md
```

*Runner-logic distinction (prose, not a second tier):* the `scripts/` surface
holds runner code such as the ralph loop. **Editing** such a file is
safe-by-default (it is in the set above); what raises operational caution is
changing a runner's *runtime behavior*, which is reviewed at the human merge
gate — the file's home tier does not change, and no path here is repeated in
Tier 2 or Tier 3.

## Tier 2 — stronger-gate

Repairs that reach toward secret-exposure or network surfaces pass a
**deterministic pre-tool-use gate** before any command or file read executes.
The gate holds even when the interactive permission engine is bypassed, so the
line is drawn by code, not by model self-restraint. A repair-operator proposal
whose commands touch these surfaces is *stronger-gate* — it is not forbidden,
but it must survive the guard below.

Enforcers (cite these; do not rebuild them):

- `deny-env-dump.sh` — `PreToolUse` `Bash` scanner: **denies** bulk env dumps,
  history dumps, token-printing CLIs, and secret-named-variable echoes;
  **asks** on narrow reads that might be public.
- `deny-secret-paths.sh` — `PreToolUse` `Read|Write|Edit|NotebookEdit` guard:
  blocks the credential-path family (env files, private keys, `.netrc`, shell
  history, cloud/kube config) for the file tools.
- `warn-devtcp.sh` — non-blocking `PreToolUse` warning when a command uses a
  raw `/dev/tcp` or `/dev/udp` socket.
- Backing deny-list + wiring: the `settings.json` permission deny-list, which
  the hooks re-assert under `bypassPermissions`. See
  `security-considerations.md §2` (secret-exposure guards) for the full model.

## Tier 3 — human-approval-required

Repairs that a machine may **propose but never land on its own**. The authority
is a human, applied at a review gate; no automation merges these.

- Sandbox **application code** (business logic, APIs, UIs) is out of bounds for
  the unattended loop entirely — the scope boundary is stated in
  `CLAUDE.md` § "What You Do NOT Do" and mirrored by
  `security-considerations.md §5` (owned-surface guard).
- Any change to the trunk itself: no agent merges its own work. The canonical
  path in `AGENTS.md` § The Workflow ends `… → merge (human) → reset|clean`,
  and the loop is rate-capped and never auto-merges. See
  `security-considerations.md §4` (human merge gate / no auto-merge).
- The ultimate hard gate for this tier is server-side branch protection on the
  trunk, which lives in repo settings rather than this tree.

## Tier → enforcer summary

| Tier | Repair class | Drawn by |
|------|--------------|----------|
| 1 | safe-by-default | `OWNED_PATHS` self-edit surface — `.oh/skills/autopilot/SKILL.md:134` |
| 2 | stronger-gate | `deny-env-dump.sh` · `deny-secret-paths.sh` · `warn-devtcp.sh` + `security-considerations.md §2` |
| 3 | human-approval-required | `CLAUDE.md` § "What You Do NOT Do" · `AGENTS.md` § The Workflow · `security-considerations.md §4`/`§5` |

Each token in the Tier 1 surface belongs to Tier 1 only; Tiers 2 and 3 name
*mechanisms and prose boundaries*, never a Tier 1 path, so no surface is
classified twice.
