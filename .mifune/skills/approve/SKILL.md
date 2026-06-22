---
name: approve
description: >-
  The approve (approve|deny) decision gate of the canonical workflow — read a spec's
  critique findings and decide go/no-go BEFORE any GitHub-side state exists, then
  emit a single APPROVED/DENIED verdict. Auto-gates on critic SEVERITY (any
  unmitigated high → deny), with an optional human override for borderline
  findings. This is the decision half of the critique→approve pair; the critics
  that produce the findings are the separate `/critique` node.
  TRIGGER when: a plan/PRD has been critiqued and needs a commitment decision
  before implementation;
  "approve this spec", "should we build <slug>", "gate <slug> on its critique".
argument-hint: "<slug> [--auto]"
---

# Approve — the critic-before-commitment gate

The **approve** gate, composed by `/spec-critique` in `AGENTS.md § The Workflow` — the
`approve|deny` decision point. It
answers one question: *do the critic findings clear this spec to build, or must it
go back to planning?* — and emits exactly one verdict the `/autopilot` runner
routes on.

**Core principle: gate the spec before anything is committed.** This embodies
critic-before-commitment: the cheapest thing to revise is the spec itself, so the
gate runs while ONLY local artifacts exist (`tasks/<slug>/prd.md`, `prd.json`,
`critique.md`) — **before** the GitHub issue, branch, or PR. A `DENIED` is therefore
fully reversible (`rm -rf tasks/<slug>/`); no GitHub-side state is created until
after `APPROVED`. (Mirrors `/ship-spec` Stage 4, which encodes the same HALT gate
inline; this node makes it a reusable decision.)

This is the **decision** half of the pair. The `critique` node runs the critics and
writes `critique.md`; `/approve` only *reads* that artifact and decides. It does not
run the critics itself — if `critique.md` is absent, the gate cannot decide (see
*Honest exits* below).

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — locates `tasks/<slug>/critique.md` (the critic findings) and `tasks/<slug>/prd.md`. Required. |
| `--auto` | Unattended mode (e.g. under `/autopilot`): never prompt a human; the SEVERITY auto-gate alone decides. Without it, a borderline finding may surface an `AskUserQuestion` override (see gate). |

---

## The gate

Read `tasks/<slug>/critique.md`. The critics write findings in the established
shape (`/ship-spec` Stage 3):

```
[SEVERITY: H/M/L] [STORY: US-NNN or *] [FINDING] | [EVIDENCE: …] | [RECOMMENDATION]
```

plus a final `**Recommendation**: PROCEED | REVISE-PRD | HALT`. Apply this decision
table — the **first** matching row wins:

| Condition | Verdict |
|-----------|---------|
| Any `SEVERITY: H` finding with **no AC-level mitigation** (includes any `[PROTECTED-PATH]` finding) | `DENIED` → `plan` |
| Critics recommend `HALT` | `DENIED` → `plan` |
| Only `SEVERITY: M` / `L` findings, or none (clean) | `APPROVED` → `implement` |

"AC-level mitigation" means the spec's acceptance criteria already address the
finding concretely — the same bar `/ship-spec` Stage 4 uses. A high-severity finding
whose mitigation is vague or merely *claimed* does **not** clear the gate.

### Optional human override (interactive only)

When **not** `--auto` and the auto-gate is borderline — a single `SEVERITY: H` that
*claims* an AC-level mitigation, or the critics' `Recommendation` disagrees with the
SEVERITY tally — surface the call with `AskUserQuestion`: present the finding, its
evidence, and the auto-leaning, and let the human pick `APPROVED` / `DENIED`. Under
`--auto` (unattended), skip the prompt and apply the table conservatively: an
unresolved high-severity finding is `DENIED`. Never auto-approve a borderline high.

---

## Verdict

| Spec clears the gate | Spec is blocked |
|---|---|
| `APPROVED` → `implement` | `DENIED` → `plan` (revise the PRD and re-critique) |

On `DENIED`, name the blocking finding(s) and point at `tasks/<slug>/critique.md` so
the `plan` node knows exactly what to revise. The revision is local-only — nothing
GitHub-side exists yet.

---

## Honest exits

- **No `critique.md`** → the gate cannot decide. This is **not** `DENIED` (which means
  "critiqued and found blocking") and **not** `APPROVED`. Print an error directing the
  caller to run the `critique` node first, and emit **no** `STATUS:` token — the runner
  reads silence as failure, never as approval. Never infer approval from the absence of
  a critique.
- **Unparseable findings** → treat as blocking (`DENIED`), not clear. Ambiguity fails
  closed.

---

## What this skill does NOT do

- **Run the critics.** That is the `critique` node (2× `critic` agents). `/approve`
  only consumes their `critique.md`.
- **Create GitHub-side state.** No issue, branch, or PR — that is downstream of
  `APPROVED` (e.g. `/ship-spec` Stage 5+). The whole point is to gate *before* commitment.
- **Revise the PRD.** Remediation on `DENIED` is the `plan` node's job.

---

## Memory Protocol

After a run, append to `memory/<UTC-date>/log.md` per `.mifune/skills/retro/references/memory-protocol.md`:

```markdown
## approve -- HH:MM UTC
- **Result**: OP
- **Spec**: <slug>
- **Findings**: H<n> / M<n> / L<n> (critics' recommendation: PROCEED|REVISE-PRD|HALT)
- **Verdict**: APPROVED | DENIED (blocking: <finding>)
- **Mode**: auto | human-override
- **Observation**: <one sentence>
```
