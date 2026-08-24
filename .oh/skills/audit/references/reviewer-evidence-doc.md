# Reviewer evidence doc

The human-readable proof artifact a reviewer reads to see *that the change works*,
not merely *that a verdict was emitted*. Written to `.oh/tasks/<slug>/evidence.md`
and committed with the change, so it travels in the PR diff.

**This is not the lifecycle evidence contract.** `AUDIT_EVIDENCE_PATH`
(`evidence.json`, schema v1, invocation-scoped and never inside `AUDIT_ROOT`) is the
machine record that lets the boundary log `complete`. The reviewer evidence doc is a
separate, tracked Markdown artifact for humans.

## Ownership — the audit routes do not write it

`/audit implementation` and `/audit pr` are read-only: they decide, they do not
mutate the repository. Neither route creates, updates, or commits this file. The
**orchestrating caller** writes it from the observations those routes returned — in
the shipped workflow that caller is `/spec execute`, after its
`/audit pr` delegation returns. A route that wrote this file itself would break its
report-only contract.

## Contract

- **Path**: `.oh/tasks/<slug>/evidence.md` — inside the scoped task folder, so it is
  included with the submitted changes — the evidence doc ships with the PR it vouches for, never as a side artifact.
- **Linked**: the PR body links it by path; a doc no reviewer is pointed at is not
  evidence.
- **Observed only**: every claim quotes output that actually ran during the audit —
  the exact command and its real output, trimmed but never paraphrased into a
  summary that could not be reproduced. Predicted, expected, or reconstructed
  output is forbidden; a gate with no observed output is recorded as a gap, not as
  a pass.
- **Correlated**: record the `AUDIT_RUN_ID` and the native verdict verbatim
  (`AUDIT-PASS` / `AUDIT-FAIL` / `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` /
  `PR-AUDIT-UNKNOWN`), so the doc is traceable to one audit log entry.
- **Honest**: non-gating pre-existing reds, skipped gates, and not-applicable gates
  are stated as such. An `AUDIT-FAIL` still gets a doc — it records what was proven
  and what blocked.
- **Repo-safe**: screenshots and scratch output stay under `AUDIT_TMP_ROOT`
  (invocation-scoped, deleted); describe what was observed rather than committing
  binaries into the task folder.

## Shape

```markdown
# Evidence — <slug>

- **PR**: #<N> (<owner/name>, base <branch>) · **Branch**: <branch>
- **Audit run**: <AUDIT_RUN_ID> · **Verdict**: <NATIVE-VERDICT>

## What was broken, and what now holds

<2–4 sentences: the problem the change solves, and the observable behavior that
proves it is solved.>

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` stories + artifact contract | `<t>/<t> stories pass` | PASS |
| Regression floor | `/eval` runner exit + delta | `rc=0`, no new green→red | PASS |
| Promotable / CI | focused classifier JSON | `promotable=true`, `evidenceComplete=true` | PASS |
| UI | browser criteria | n/a — no story declares browser verification | N/A |

## Observed output

```text
$ <exact command>
<real output, trimmed>
```

## Acceptance criteria → proof

| Story | Criterion | Proof |
|-------|-----------|-------|
| US-001 | <criterion> | <file:line, or the observed-output block above> |

## Gaps and non-gating findings

- <pre-existing red, skipped check, or explicit "none">
```
