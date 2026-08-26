# Source: in-repo capture — the reconciliation contract introduced by issue #816 (US-005)

Capture date: 2026-08-24 (UTC). Captured from the working tree of branch
`feat/spec-simplification` at commit `dcef9085`. Verbatim excerpts read directly out of
the repository files the `plan-vs-built-reconciliation.md` wiki entry cites. This file is
**provenance**, not a restatement of the entry: it records what the source said at capture
time so a later reader can tell drift from synthesis.

## Captured source files

| Path | Role | Size at capture |
| --- | --- | --- |
| `.oh/skills/spec/references/execute.md` | The pipeline. Step 6 writes the doc; step 10 gates the undraft on it | 629 lines |
| `.oh/skills/audit/references/reviewer-evidence-doc.md` | The doc's contract: path, linkage, observed-output rule, correlation, honesty | 122 lines |
| `.oh/evals/probes/spec-ready-finalization.sh` | The probe that holds the gate in place | 105 lines |

## Verbatim excerpts

### `execute.md:345-352` — why the doc exists

> ### 6. Write `evidence.md` — the answer back to the plan
>
> **This is a gate condition, not a formality.** Step 9 refuses to undraft without it.
>
> The operator's understanding of this work stops at the plan they approved. Everything after
> that happened inside a compacted session they did not watch. `evidence.md` is how the build
> answers back to that plan, and it is the artifact that makes approving a merge an informed
> act rather than a trusting one.

### `execute.md:421-436` — the gate, both halves

> **The evidence gate.** Before the undraft, `.oh/tasks/<slug>/evidence.md` must exist, be
> committed on the branch, and answer the four questions step 6 names. **Refuse the undraft
> without it** — a PR whose reviewer cannot see how the built thing differs from the plan they
> approved is not ready for review, whatever CI says

```bash
git ls-files --error-unmatch ".oh/tasks/<slug>/evidence.md" >/dev/null 2>&1 \
  || { echo "ERROR: evidence.md exists but is untracked — .oh/tasks/ is gitignored; commit it with 'git add -f'"; exit 1; }
```

> The `git ls-files` half is not redundant: `.oh/tasks/` is gitignored, so an `evidence.md` that
> was written but added without `-f` is present on disk and **absent from the PR diff** — which
> is the same as not having it, from the reviewer's seat.

### `reviewer-evidence-doc.md:33-37` — the observed-output rule

> - **Observed only**: every claim quotes output that actually ran during the audit —
>   the exact command and its real output, trimmed but never paraphrased into a
>   summary that could not be reproduced. Predicted, expected, or reconstructed
>   output is forbidden; a gate with no observed output is recorded as a gap, not as
>   a pass.

### `reviewer-evidence-doc.md:50-55` — why an empty section is written out

> - **Answers back to the plan**: the four sections below are not optional prose. Two of
>   them — *divergence* and *unverified* — are the things a reviewer cannot reconstruct
>   from the diff, so an empty one is written as `None` / `Nothing` explicitly. Omitting
>   them reads as "nothing diverged, nothing unchecked", the most expensive claim this
>   document can make by accident.

### `reviewer-evidence-doc.md:13-16` — the two evidence artifacts are distinct

> **This is not the lifecycle evidence contract.** `AUDIT_EVIDENCE_PATH`
> (`evidence.json`, schema v1, invocation-scoped and never inside `AUDIT_ROOT`) is the
> machine record that lets the boundary log `complete`. The reviewer evidence doc is a
> separate, tracked Markdown artifact for humans.

### `reviewer-evidence-doc.md:18-24` — the routes do not write it

> `/audit implementation` and `/audit pr` are read-only: they decide, they do not
> mutate the repository. Neither route creates, updates, or commits this file. The
> **orchestrating caller** writes it from the observations those routes returned — in
> the shipped workflow that caller is `/spec execute`

### `spec-ready-finalization.sh:58-71` — the three assertions that hold the gate

```bash
# US-005: the merge gate answers back to the approved plan. evidence.md is a GATE
if ! grep -qF 'evidence.md' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's merge gate no longer requires .oh/tasks/<slug>/evidence.md" >&2
if ! grep -qE 'Refuse the undraft|left draft[^|]*evidence\.md is missing' <<<"$final_section"; then
  echo "REGRESSION: /spec execute mentions evidence.md but no longer REFUSES the undraft without it" >&2
# .oh/tasks/ is gitignored, so an untracked evidence.md is absent from the PR diff — which
  echo "REGRESSION: /spec execute's evidence gate no longer verifies evidence.md is TRACKED (gitignored path)" >&2
```

Note on the probe's scoping: the assertions are evaluated against `$final_section`, not the
whole file. During US-005 the file-scoped versions of these greps stayed green after the real
gate text was deleted, because the strings `gh pr ready` and `evidence.md` each appear several
times elsewhere in the document. Section scoping is what makes the assertion attributable.

## Adjacent files read but not captured here

- `.oh/skills/audit/scripts/audit-run.sh:215-220` — the terminal log append that produces the
  `AUDIT_RUN_ID` an evidence doc correlates to (`$AUDIT_LOG_ROOT/.oh/memory/<date>/log.md`).
- `.oh/tasks/spec-simplification/prd.md:363-381` — the `## Wiki Alignment` block that named
  this entry as a gap.
