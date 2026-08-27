# Audit implementation — per-unit verdict gate

The **audit** gate, composed by `/spec execute` in `.oh/skills/spec/SKILL.md`. It answers
one question: *does this one implementation satisfy its task graph and is it
promotable?* — and emits exactly one verdict the caller routes on.

**Core principle: compose, don't re-derive — and never infer green from silence.**
This skill owns the *verdict*, not the checks. Each gate below is an existing
primitive; `/audit implementation` runs them in fail-fast order and integrates their results
into a single `AUDIT-PASS` / `AUDIT-FAIL`. It is **read-only**: it decides, it
does not mutate (no `gh pr ready`, no `gh pr merge`) and does not fix — promotion
is a downstream concern and remediation belongs to the build step on
`AUDIT-FAIL` (single-owner handoff: the outcome is decided here, acted on elsewhere).

> **Not a survey target.** `/audit prs` triages the *whole* open-PR queue in one
> bulk query (*"never loop per-PR"*, `audit/references/prs.md`); `/audit implementation`
> is the opposite shape — a single unit (1 impl vs. 1 `prd.json`). It consumes the
> same focused classifier used by `/audit pr`; it does not replace or fork it.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — locates `.oh/tasks/<slug>/prd.json` and `.oh/tasks/<slug>/progress.txt`. Required. |
| `--pr <N>` | The PR for this unit, if one exists. When set, gate 3 uses the shared focused classifier (which reads `statusCheckRollup`, subsuming `/ci-status`). |
| `--repo <owner/name>` | Repository passed unchanged to focused PR acquisition. Required with `--pr`; never inferred from the process checkout or a hard-coded default. |
| `--base <branch>` | Expected PR base for focused classification. Defaults to `development`; set it to the parent branch for a stacked PR. |
| `--branch <branch>` | The work branch. Used by gate 3's `/ci-status` fallback when there is no PR yet (e.g. an autopilot pre-PR audit). Defaults to the current branch. |

---

## The four gates (fail-fast, in order)

Run in order; the **first** gate that fails decides the verdict (`AUDIT-FAIL`,
naming the gate). Only when **all** applicable gates pass is the verdict
`AUDIT-PASS`. A gate whose signal is missing or ambiguous is a FAIL, never a pass
(honest exits).

### Gate 1 — Task-graph conformance + artifact contract

Gate 1 has **two gating sub-checks**; either failing is an `AUDIT-FAIL`. Execute
the production helper `"$AUDIT_ROOT/.oh/skills/audit/scripts/implementation-gates.sh" gate1 "$SLUG"`;
the snippets below explain its behavior and are not a second implementation.

**(a) Task-graph conformance.** Every user story in the task graph must be marked
complete. The ralph loop flips `passes: false → true` as it finishes each story, so
the graph is conformant only when **zero** stories remain unfinished:

```bash
SLUG="$1"; PRD="$AUDIT_ROOT/.oh/tasks/$SLUG/prd.json"
[ -f "$PRD" ] || { echo "FAIL gate1: no $PRD"; exit 1; }
unfinished=$(jq '[.userStories[] | select(.passes != true)] | length' "$PRD")
total=$(jq '.userStories | length' "$PRD")
echo "task-graph: $((total - unfinished))/$total stories pass"
[ "$unfinished" -eq 0 ] || { echo "FAIL gate1: $unfinished story(ies) not passing"; exit 1; }
```

**(b) Artifact contract.** If the `prd.json` declares an `artifact_contract` block
(see the [artifact-contract schema](../../../docs/artifact-contract-schema.md)), every
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
  case "$artifact" in /*) echo "FAIL gate1: artifact must be AUDIT_ROOT-relative: $artifact"; exit 1;; esac
  artifact_path="$AUDIT_ROOT/$artifact"
  resolved=$(realpath -e -- "$artifact_path") || exit 1
  [ "$resolved" = "$artifact_path" ] && case "$resolved" in "$AUDIT_ROOT"/*) :;; *) false;; esac \
    || { echo "FAIL gate1: required_artifact is non-canonical, symlinked, or outside AUDIT_ROOT: $artifact"; exit 1; }
done < <(jq -r '.artifact_contract.required_artifacts // [] | .[]' "$PRD")
```

A non-conformant graph **or** a missing required artifact is `AUDIT-FAIL` →
`implement` (resume the unfinished stories, or produce the promised artifact). Do
not advance to the later gates. A worked fixture proving the artifact sub-check
fails on a missing path lives at
[`../fixtures/artifact-contract.prd.json`](../fixtures/artifact-contract.prd.json)
(exercised by `.oh/evals/probes/artifact-contract-audit.sh`).

### Gate 2 — Regression floor (`/eval`)

The probe suite must stay green for this change. Gate on the runner's **exit code +
delta**, not its prose.

**Read the cycle's result before running the suite.** `/spec execute` runs `/eval` once
per cycle and publishes `.oh/tasks/<slug>/eval-result.json`. Reuse it **only while it
describes the code under test** — that is, while its `commit` equals the current
`HEAD`:

```bash
RESULT=".oh/tasks/<slug>/eval-result.json"
if [ -f "$RESULT" ] && [ "$(jq -r .commit "$RESULT")" = "$(git rev-parse HEAD)" ]; then
  rc="$(jq -r .runnerExit "$RESULT")"          # inherit the cycle's single run
else
  AUDIT_RUN_ID="$AUDIT_RUN_ID" AUDIT_ROOT="$AUDIT_ROOT" \
    bash "$AUDIT_ROOT/.oh/skills/eval/run.sh" ; rc=$?
fi
# rc=0 → no NEW green→red regression for this commit (pass)
# rc=1 → at least one new regression (FAIL gate2)
```

The commit check is what keeps the reuse honest: the moment the branch moves, the
record describes code that is no longer under test, and this gate runs the suite
itself rather than inheriting a stale green. **Never** reuse a record whose `commit`
you did not compare, and never treat a missing record as a pass.

Block only on a **new** `green→red` regression or a non-zero runner exit. A
pre-existing red with an unchanged delta is non-gating but MUST be disclosed in
the verdict. (Mirrors `/spec execute`'s `/eval` gate and `.oh/evals/probes/eval-gate.sh`.)

### Gate 3 — Promotable / CI state

The implementation must be promotable: CI green **and** (for a PR) mergeable and
clean.

- **PR exists (`--pr N --repo O/N`):** invoke
  `"$AUDIT_ROOT/.oh/skills/audit/scripts/implementation-gates.sh" classify-pr "$REPO" "$PR" "$BASE"`.
  That production helper calls the shared acquisition and classifier and returns
  their fresh JSON. Consume only
  `.promotable`, `.readyForReview`, `.readyToMerge`, and `.evidenceComplete`.
  Pass only when evidence is complete and promotable; `NONE` and `UNKNOWN` fail.
  Never parse Markdown or a human routing token. The acquisition reads
  `statusCheckRollup`, so do not also poll CI.
- **No PR yet:** fall back to `/ci-status` on `--branch`. A `NO-RUN` CI status is
  **not** a pass (no run ≠ green) — that is `AUDIT-FAIL` until a run is dispatched
  and lands green.

### Gate 4 — UI verification (conditional)

If the task graph contains any browser-verification criteria, the UI must be
confirmed visually:

```bash
grep -qi "agent-browser\|Verify in browser" "$AUDIT_ROOT/.oh/tasks/$SLUG/prd.json" && echo "UI gate applies"
```

Determine applicability with the production helper's `browser-required` mode. When
it applies, run its `browser-preflight` mode directly (do **not** run the ordinary
`/agent-browser` repair/install preflight): it requires `command -v agent-browser`
and a successful `agent-browser --version`, create a profile beneath
`$AUDIT_TMP_ROOT`, launch only `about:blank` in session `audit-$AUDIT_RUN_ID`, then
close that session and remove the profile. Set `HOME` to that profile for all
preflight commands. The preflight must not install/download/repair, navigate to the
application, write anywhere under `AUDIT_ROOT`, or touch GitHub; compare
compare status, tracked content, index, and untracked-content snapshots before/after and fail on any delta (including changes to files that were already dirty).
Failure fails Gate 4 before application navigation. After a successful preflight,
drive `/agent-browser` against the running app and confirm the acceptance criteria
render/behave as specified. Store screenshots under `$AUDIT_TMP_ROOT`, not in the
repository. No clean screenshot/snapshot for an applicable story is `AUDIT-FAIL`.
When no story declares browser verification, this gate is **not applicable** and
must not invoke `agent-browser` at all.

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
- **Fork PR classification.** It consumes the same private classifier JSON as
  `/audit pr` and `/audit prs`.
- **Re-run a passing gate.** Fail-fast: stop at the first failing gate.
- **Write the reviewer evidence doc.** The per-gate observations above are what
  `.oh/tasks/<slug>/evidence.md` is built from, but the orchestrating caller writes and
  commits it — see [`reviewer-evidence-doc.md`](reviewer-evidence-doc.md).

---

## Memory Protocol

Return this structured observation to the outer dispatcher; do not report a run record from this route. The dispatcher prints the one terminal run record:

```markdown
## audit -- HH:MM UTC
- **Result**: OP
- **Unit**: <slug> (PR #<N> / branch <branch>)
- **Verdict**: AUDIT-PASS | AUDIT-FAIL (gate <n>: <reason>)
- **Gates**: graph <p/t> · eval <rc> · promotable <class> · ui <pass|n/a>
- **Observation**: <one sentence>
```
