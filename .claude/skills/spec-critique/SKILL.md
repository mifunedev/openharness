---
name: spec-critique
description: >-
  The critique+approve node of the canonical workflow (AGENTS.md § The Workflow)
  — point it at a tasks/<slug>/ folder and it runs the two adversarial critics
  (/critique) then the commitment gate (/approve), looping back to /spec-plan on
  DENIED. The first of the two adversarial loops (plan ⇄ critique). Composes the
  existing /critique + /approve loop-node skills; runs on local artifacts only,
  before any GitHub-side state.
  TRIGGER when: a planned tasks/<slug>/ folder needs adversarial review + a go/no-go
  decision before building; the critique step of AGENTS.md § The Workflow;
  "critique <slug>", "spec-critique <slug>", "vet the plan for <slug>".
argument-hint: "<slug> [--auto]"
---

# Spec Critique — the plan ⇄ critique adversarial loop

The **critique** member of the `spec-*` family (`AGENTS.md § The Workflow`). It is the
first of the two adversarial loops — `spec-plan ⇄ spec-critique` vets the *plan*
(`build ⇄ audit` later vets the *build*). Pointed at a `tasks/<slug>/` folder, it runs
the critics and the gate, then hands off.

**Core principle: gate the spec while it is still the cheapest thing to revise.** Critics
review `tasks/<slug>/prd.md` and the gate decides **before** any GitHub-side state exists
(`AGENTS.md § The Workflow` critic-before-commitment invariant). A `DENIED` is fully
reversible — it routes back to `/spec-plan` to revise the PRD and re-critique; nothing
GitHub-side is created until `APPROVED`.

This composes two existing loop-node skills — it does **not** re-implement them:

| Step | Skill | Produces |
|------|-------|----------|
| 1. critics | `/critique <slug>` | `tasks/<slug>/critique.md` (2 critics, implementer + user lens, SEVERITY-tagged + protected-paths cross-check) |
| 2. gate | `/approve <slug> [--auto]` | the `APPROVED` / `DENIED` verdict over that `critique.md` |

It is the decomposed, folder-pointed form of `/ship-spec` Stages 3–4.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — locates `tasks/<slug>/prd.md`; critics write `tasks/<slug>/critique.md`. Required. |
| `--auto` | Unattended mode (passed through to `/approve`): the SEVERITY auto-gate alone decides; never prompt a human. |

If `tasks/<slug>/prd.md` is absent there is nothing to critique — print an error pointing
at `/spec-plan` and emit no `STATUS:` line (a missing spec is a failure, not a clean pass).

---

## Run the loop

1. **Critics** — invoke `/critique <slug>`. It launches the two `critic` agents in
   parallel (different lenses; both cross-check `.claude/protected-paths.txt`) and writes
   `tasks/<slug>/critique.md` with the SEVERITY tally and a `Recommendation`. Do not run
   the critics inline here — delegate to `/critique` so the single authoring of that
   prompt is reused.

2. **Gate** — invoke `/approve <slug> [--auto]`. It reads `critique.md` and applies the
   first-match decision table (any unmitigated `SEVERITY: H` or `[PROTECTED-PATH]`, or a
   critics' `HALT`, → `DENIED`; only `M`/`L` or clean → `APPROVED`). Without `--auto` a
   borderline high may surface an `AskUserQuestion` human override.

3. **Route**:
   - `APPROVED` → the spec clears the gate; hand off to `/spec-execute <slug>`.
   - `DENIED` → name the blocking finding(s), point at `tasks/<slug>/critique.md`, and hand
     back to `/spec-plan <slug>` to revise the PRD and re-run this node. The revision is
     local-only — nothing GitHub-side exists yet.

---

## What this skill does NOT do

- **Re-implement the critics or the gate.** It composes `/critique` and `/approve`; their
  prompts and decision table are authored once, there.
- **Create GitHub-side state.** No issue, branch, or PR — that is `/spec-execute`, after
  `APPROVED`.
- **Revise the PRD.** On `DENIED`, remediation is `/spec-plan`'s job.

---

## Memory Protocol

`/critique` and `/approve` each append their own log entry. `spec-critique` adds one
roll-up line to `memory/<UTC-date>/log.md` per `context/rules/memory.md`:

```markdown
## spec-critique -- HH:MM UTC
- **Result**: OP | PARTIAL (a composed skill failed mid-run) | FAIL
- **Spec**: <slug>
- **Findings**: H<n> / M<n> / L<n>
- **Verdict**: APPROVED | DENIED (blocking: <finding>)
- **Observation**: <one sentence>
```

---

## Pipeline position

Within `AGENTS.md § The Workflow` (`select → spec-plan ⇄ spec-critique → spec-execute →
merge → reset|clean`), `spec-critique` closes the first adversarial loop. On `APPROVED` the
next step is `/spec-execute <slug>`; on `DENIED` it routes back to `/spec-plan <slug>` to
revise + re-critique. Print one of these bare tokens as the final line:

    STATUS: SPEC-APPROVED

    STATUS: SPEC-DENIED

The `spec-*` family is **not** wired into the deprecated executable loop
(`context/rules/loop.md` § 2); `AGENTS.md § The Workflow` is its authority. No
`critique.md` → the gate cannot decide: print an error directing the caller to
`/spec-plan`/`/critique` and emit no `STATUS:` line — never infer approval from silence.
