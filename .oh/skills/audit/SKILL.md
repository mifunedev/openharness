---
name: audit
description: >-
  Per-unit verdict gate (the build⇄audit gate composed by `/spec execute`) — decide whether ONE
  implementation satisfies its task graph and is promotable, then emit a single
  PASS/FAIL verdict. Composes (never forks) the existing checks: prd.json
  task-graph conformance + /eval regression floor + /pr-audit promotable
  classification (subsumes /ci-status) + /agent-browser for UI stories. Distinct
  from the audit-FAMILY survey skills (/pr-audit = whole open-PR queue,
  /context-audit = context budget, /harness-audit = whole harness): this is one
  impl vs. one spec → one verdict.
  TRIGGER when: an implementation is complete and needs a go/no-go verdict before
  retro; the build⇄audit gate of `/spec execute` runs; "audit this task",
  "is <slug> promotable", "verify the implementation against its prd.json".
argument-hint: "<slug> [--pr <N>] [--branch <branch>]"
---

# Audit — per-unit verdict gate

The **audit** gate, composed by `/spec execute` in `AGENTS.md § The Workflow`. It answers
one question: *does this one implementation satisfy its task graph and is it
promotable?* — and emits exactly one verdict the `/autopilot` runner routes on.

**Core principle: compose, don't re-derive — and never infer green from silence.**
This skill owns the *verdict*, not the checks. Each gate below is an existing
primitive; `/audit` runs them in fail-fast order and integrates their results
into a single `AUDIT-PASS` / `AUDIT-FAIL`. It is **read-only**: it decides, it
does not mutate (no `gh pr ready`, no `gh pr merge`) and does not fix — promotion
is a downstream concern and remediation belongs to the build step on
`AUDIT-FAIL` (single-owner handoff: the outcome is decided here, acted on elsewhere).

> **Not a survey skill.** `/pr-audit` triages the *whole* open-PR queue in one
> bulk query (*"never loop per-PR"*, `pr-audit/SKILL.md`); `/audit` is the
> opposite shape — a single unit (1 impl vs. 1 `prd.json`). `/audit` *consults*
> `/pr-audit`'s classification for its one PR; it does not replace or fork it.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — locates `.oh/tasks/<slug>/prd.json` and `.oh/tasks/<slug>/progress.txt`. Required. |
| `--pr <N>` | The PR for this unit, if one exists. When set, gate 3 uses `/pr-audit` (which reads `statusCheckRollup`, subsuming `/ci-status`). |
| `--branch <branch>` | The work branch. Used by gate 3's `/ci-status` fallback when there is no PR yet (e.g. an autopilot pre-PR audit). Defaults to the current branch. |

---

## The four gates (fail-fast, in order)

Run in order; the **first** gate that fails decides the verdict (`AUDIT-FAIL`,
naming the gate). Only when **all** applicable gates pass is the verdict
`AUDIT-PASS`. A gate whose signal is missing or ambiguous is a FAIL, never a pass
(honest exits).

### Gate 1 — Task-graph conformance + artifact contract

Gate 1 has **two gating sub-checks**; either failing is an `AUDIT-FAIL`.

**(a) Task-graph conformance.** Every user story in the task graph must be marked
complete. The ralph loop flips `passes: false → true` as it finishes each story, so
the graph is conformant only when **zero** stories remain unfinished:

```bash
SLUG="$1"; PRD=".oh/tasks/$SLUG/prd.json"
[ -f "$PRD" ] || { echo "FAIL gate1: no $PRD"; exit 1; }
unfinished=$(jq '[.userStories[] | select(.passes != true)] | length' "$PRD")
total=$(jq '.userStories | length' "$PRD")
echo "task-graph: $((total - unfinished))/$total stories pass"
[ "$unfinished" -eq 0 ] || { echo "FAIL gate1: $unfinished story(ies) not passing"; }
```

**(b) Artifact contract.** If the `prd.json` declares an `artifact_contract` block
(see the [artifact-contract schema](../../docs/artifact-contract-schema.md)), every
path in `artifact_contract.required_artifacts` must exist on disk. This is a
**gating** sub-check — a declared-but-missing artifact is a hard `AUDIT-FAIL`, not
an advisory warning. The block is **optional and additive**: a `prd.json` with no
`artifact_contract` key yields an empty list and passes this sub-check unchanged,
so the gate keeps its pre-contract behavior for specs that declare no contract:

```bash
# Gating: a declared required_artifact that is absent on disk fails Gate 1.
# Optional block — no .artifact_contract ⇒ empty list ⇒ unchanged pass.
while IFS= read -r artifact; do
  [ -z "$artifact" ] && continue
  [ -e "$artifact" ] || { echo "FAIL gate1: required_artifact missing: $artifact"; exit 1; }
done < <(jq -r '.artifact_contract.required_artifacts // [] | .[]' "$PRD")
```

A non-conformant graph **or** a missing required artifact is `AUDIT-FAIL` →
`implement` (resume the unfinished stories, or produce the promised artifact). Do
not advance to the later gates. A worked fixture proving the artifact sub-check
fails on a missing path lives at
[`references/artifact-contract-fixture.prd.json`](references/artifact-contract-fixture.prd.json)
(exercised by `.oh/evals/probes/artifact-contract-audit.sh`).

### Gate 2 — Regression floor (`/eval`)

The probe suite must stay green for this change. Run the runner and gate on its
**exit code + delta**, not its prose:

```bash
bash .claude/skills/eval/run.sh ; rc=$?
# rc=0 → no NEW green→red regression this run (pass)
# rc=1 → at least one new regression (FAIL gate2)
```

Block only on a **new** `green→red` regression or a non-zero runner exit. A
pre-existing red with an unchanged delta is non-gating but MUST be disclosed in
the verdict. (Mirrors `/ship-spec` Stage 11 and `.oh/evals/probes/eval-gate.sh`.)

### Gate 3 — Promotable / CI state

The implementation must be promotable: CI green **and** (for a PR) mergeable and
clean.

- **PR exists (`--pr N`):** run `/pr-audit` focused on PR `#N` and read its draft
  sub-class. **promotable** (CI green + mergeable + clean) passes; **still-WIP**
  or **limbo** fails. `/pr-audit` reads `statusCheckRollup`, so this subsumes a
  bare `/ci-status` check — do not also poll CI separately.
- **No PR yet:** fall back to `/ci-status` on `--branch`. A `NO-RUN` CI status is
  **not** a pass (no run ≠ green) — that is `AUDIT-FAIL` until a run is dispatched
  and lands green.

### Gate 4 — UI verification (conditional)

If the task graph contains any browser-verification criteria, the UI must be
confirmed visually:

```bash
grep -qi "agent-browser\|Verify in browser" ".oh/tasks/$SLUG/prd.json" && echo "UI gate applies"
```

When it applies, drive `/agent-browser` against the running app for the changed
surface(s) and confirm the acceptance criteria render/behave as specified. No
clean screenshot/snapshot for an applicable story is `AUDIT-FAIL`. When no story
declares browser verification, this gate is **not applicable** (skipped, not
failed).

---

## Verdict

| All applicable gates pass | Any gate fails |
|---|---|
| `AUDIT-PASS` → `retro` | `AUDIT-FAIL` → `implement` (resume) |

State the verdict, then — on the **final line** — emit the routing token. Always
name the deciding gate on `AUDIT-FAIL` and disclose any non-gating pre-existing
red from gate 2.

---

## What this skill does NOT do

- **Mutate PR state.** No `gh pr ready`, no `gh pr merge`, no labels. The verdict
  is read-only; undrafting/merging is a separate, downstream decision.
- **Fix anything.** Remediation is the `implement` node's job on `AUDIT-FAIL`.
- **Fork `/pr-audit`.** It consults the existing fleet-triage tool for one PR; it
  never reimplements the bulk query (which is probe-pinned by
  `.oh/evals/probes/autopilot-executor-toggle.sh`).
- **Re-run a passing gate.** Fail-fast: stop at the first failing gate.

---

## Memory Protocol

After a run, append to `.oh/memory/<UTC-date>/log.md` per `.oh/skills/retro/references/memory-protocol.md`:

```markdown
## audit -- HH:MM UTC
- **Result**: OP
- **Unit**: <slug> (PR #<N> / branch <branch>)
- **Verdict**: AUDIT-PASS | AUDIT-FAIL (gate <n>: <reason>)
- **Gates**: graph <p/t> · eval <rc> · promotable <class> · ui <pass|n/a>
- **Observation**: <one sentence>
```
