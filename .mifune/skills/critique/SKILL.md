---
name: critique
description: >-
  The critique node of the canonical workflow — run two adversarial critics in
  parallel (implementer lens + user lens) against a freshly-planned spec, write
  their findings to tasks/<slug>/critique.md, and hand off to the approve gate.
  This is the EVIDENCE half of the critique→approve pair; it produces findings,
  it does not decide (the /approve gate decides). Runs on local artifacts only,
  before any GitHub-side state.
  TRIGGER when: a PRD/plan exists and needs adversarial review before the
  commitment gate; "critique
  this spec", "run the critics on <slug>", "review prd before we build".
argument-hint: "<slug> [--weigh]"
---

# Critique — two adversarial critics before commitment

The **critique** node of the canonical workflow (`AGENTS.md § The Workflow`), composed by `/spec critique`. It runs
the short adversarial feedback loop on a planned spec *before* anything is committed,
and writes the `critique.md` artifact the `approve` gate then decides on.

**Core principle: surface risk while the spec is still the cheapest thing to revise.**
Two critics with **different framings** review `tasks/<slug>/prd.md` in parallel —
symmetric critics waste context. Every finding is SEVERITY-tagged so the downstream
`/approve` gate can act on it mechanically. This node produces evidence; it does not
gate (that is `/approve`). Like the gate, it touches only local artifacts — no
GitHub-side state exists yet (critic-before-commitment). Formalizes `/ship-spec` Stage 3 as a
reusable node.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — the critics read `tasks/<slug>/prd.md`; output is written to `tasks/<slug>/critique.md`. Required. |

If `tasks/<slug>/prd.md` is absent there is nothing to critique — print an error
pointing at `/spec plan` and emit **no** `STATUS:` token (honest exits: a missing
spec is a failure, not a clean critique).

---

## Run the critics (parallel)

Launch **two `Agent` tool calls in a single message** (parallel execution) with
`subagent_type: "critic"`. Both also receive the protected-paths cross-check: read
`.claude/protected-paths.txt` and flag any proposed deletion of an entry on that list
as `SEVERITY: H` unless the AC carries an explicit override note (the gate that would
have caught the v0.7 convergence regression, PR #212 / US-012).

### Critic A — Implementer lens

> You are an adversarial implementer reviewing a PRD before any code is written. Read
> `tasks/<slug>/prd.md`. Read `.claude/protected-paths.txt` and treat its entries as
> MUST-NOT-DELETE without an override note. Surface technical risks BEFORE
> implementation. Focus on: (1) vague/unverifiable acceptance criteria; (2) missing
> dependencies each story silently assumes; (3) pattern conflicts with this repo (read
> `AGENTS.md` + the relevant `.mifune/skills/*/SKILL.md` and sibling `tasks/*/prd.json`); (4) scope creep — "single
> iteration" stories that are really 2+; (5) hidden destructive operations not
> explicitly gated; (6) protected-path violations → `SEVERITY: H` + `[PROTECTED-PATH]`.
> Return:
> ```
> CRITIC_A — IMPLEMENTER LENS
> [SEVERITY: H/M/L] [STORY: US-NNN or *] [FINDING] | [EVIDENCE: file or AC text] | [RECOMMENDATION]
> ```

### Critic B — User lens

> You are an adversarial user reviewing a PRD before implementation. Read
> `tasks/<slug>/prd.md` and `context/USER.md` (the single-developer / single-project
> framing). Read `.claude/protected-paths.txt` and treat its entries as MUST-NOT-DELETE
> without an override note. Surface scope and framing risks BEFORE the team commits.
> Focus on: (1) scope ambiguity — what's missing from Non-Goals; (2) audience
> misalignment vs. `context/USER.md`; (3) hidden expectations the PRD doesn't address;
> (4) premature optimization — solving a problem the user doesn't have yet; (5) missing
> rollback/escape hatch for destructive stories; (6) protected-path violations →
> `SEVERITY: H` + `[PROTECTED-PATH]`. Return:
> ```
> CRITIC_B — USER LENS
> [SEVERITY: H/M/L] [STORY: US-NNN or *] [FINDING] | [EVIDENCE: file or PRD section] | [RECOMMENDATION]
> ```

---

## Self-consistency weighting (optional, default-off)

> Opt-in only. **Default behavior is unchanged**: without the flag this node runs exactly the
> two single-pass critics above (K=1) and writes the same `critique.md` — zero added agent
> calls, byte-for-byte the same cost model.

When invoked with `--weigh` (or `CRITIQUE_WEIGH=1`), each lens is sampled **K times** (`K`
default 1 = current behavior; opt-in **K=2**, hard cap 2) and the per-lens samples are routed
through `/weigh` (`vote` method) so a finding that fires in only 1 of K samples is
**down-weighted** relative to one that fires in all K, *before* the SEVERITY tally. This trades
up to 2× critic cost for a flakiness-resistant tally; it never raises a finding's severity,
only discounts low-consistency ones.

Invariants (the seam is schema-preserving):
- The `critique.md` output schema below — `## Critic A`, `## Critic B`, `## Synthesis`, the
  SEVERITY tally, and the `Recommendation` — is **identical** in both modes; `/approve` and
  `/ship-spec` Stage 4 parse it unchanged.
- A down-weighted finding is still listed (with a `consistency: n/K` note), never silently
  dropped; the SEVERITY auto-gate still fails closed on any unmitigated high.
- `K` is capped at 2 — total critique cost never exceeds 2× the default 2-agent baseline.

---

## Write `tasks/<slug>/critique.md`

Persist both critics' raw output plus a synthesis, in the exact shape `/approve` (and
`/ship-spec` Stage 4) parses:

```markdown
# Critique — <slug>

Generated <date>; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens
<raw output>

## Critic B — User lens
<raw output>

## Synthesis
- **High-severity findings**: <count>
- **Medium-severity findings**: <count>
- **Recommendation**: PROCEED | REVISE-PRD | HALT
```

The `Recommendation` reflects the SEVERITY tally: any unmitigated `SEVERITY: H` (or
`[PROTECTED-PATH]`) → `HALT`; only `M`/`L` → `PROCEED` (note the acknowledged risks);
none → `PROCEED`. This node only *records* that judgment — the binding decision is the
`/approve` gate's.

---

## What this skill does NOT do

- **Decide.** It produces `critique.md`; the `approve` node reads it and emits the
  `APPROVED`/`DENIED` verdict. Keep evidence and decision separate.
- **Run symmetric critics.** The two lenses MUST differ; identical framings add no
  coverage.
- **Touch GitHub-side state or the PRD.** Output is `critique.md` only. Revising
  `prd.md` on a `HALT` is the `plan` node's job after `/approve` denies.

---

## Memory Protocol

After a run, append to `memory/<UTC-date>/log.md` per `.mifune/skills/retro/references/memory-protocol.md`:

```markdown
## critique -- HH:MM UTC
- **Result**: OP
- **Spec**: <slug>
- **Findings**: H<n> / M<n> / L<n>
- **Recommendation**: PROCEED | REVISE-PRD | HALT
- **Observation**: <one sentence>
```
