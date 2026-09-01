# Reviewer evidence doc

The human-readable proof artifact a reviewer reads to see *that the change works*,
not merely *that a verdict was emitted*. Written to `.oh/tasks/<slug>/evidence.md`
and committed with the change, so it travels in the PR diff.

**It is a gate condition.** `/spec execute` refuses to undraft a PR without it. The
operator's understanding of the work stops at the plan they approved; everything
after that happened inside a compacted session they did not watch. This doc is how
the build answers back to that plan, which is what makes approving a merge an
informed act rather than a trusting one.

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
- **Tracked**: `.oh/tasks/` is gitignored, so the file must be added with `git add -f`.
  An untracked `evidence.md` exists on disk and is **absent from the PR diff** — from
  the reviewer's seat that is identical to not having written it at all.
- **Follow-ups are cited, not named**: an acceptance criterion recorded as satisfied
  by work outside this repository — a mirror issue, a downstream PR, a tracked
  follow-up — is met only when that artifact **exists** and the doc carries its
  resolvable URL. Naming a follow-up in prose is a plan, and a plan reads as
  satisfaction to every reader who does not go looking. File it, then cite it. No
  gate here can see an artifact in another repository, so this line is the only
  thing standing between "deferred" and "done".
- **Answers back to the plan**: the five sections below are not optional prose. Three of
  them — *why this is better*, *divergence* and *unverified* — are the things a reviewer cannot reconstruct
  from the diff, so an empty one is written as `None` / `Nothing` explicitly. Omitting
  them reads as "nothing diverged, nothing unchecked", the most expensive claim this
  document can make by accident.

## The five questions

Every doc answers these, in this order, before the per-gate proof:

0. **Why this is better than not doing it** — the first question, because it is the only
   one a reviewer cannot answer for themselves. State the *before* and the *after* as the
   operator experiences them, with a number wherever one exists, and name the cost paid to
   get there. A benefit nobody can measure is written as *claimed, unmeasured* — never
   dressed up as proven. Verification output belongs to questions 2 and 4; this question
   is about consequence, not correctness. A doc that proves every gate green and never
   says what improved has failed its reader.
1. **What the plan asked for** — the approved `prd.md`'s goals in the operator's terms,
   not a restatement of the story titles.
2. **What was built** — the observable behavior that now holds.
3. **Where they diverged, and why** — every place the build differs from the approved
   plan: a criterion satisfied differently, a deliberate deviation, a mid-build scope
   call. Explicitly `None` when there was none.
4. **What remains unverified** — skipped gates, criteria argued rather than observed,
   pre-existing reds carried forward, a `SIMPLICITY-RESIDUAL` list the simplify loop
   ended on, anything a reviewer must check by hand. Explicitly `Nothing` when there is
   none.

**Why question 0 is first and separate.** Questions 1–4 prove the change is *correct*.
None of them establishes it was *worth making*. A doc can pass every gate, diverge nowhere,
and leave nothing unverified while the reader still cannot say what is better than the repo
without it — which is the review they were actually asked for. Correctness evidence answers
the auditor; this question answers the operator.

## Shape

```markdown
# Evidence — <slug>

- **PR**: #<N> (<owner/name>, base <branch>) · **Branch**: <branch>
- **Audit run**: <AUDIT_RUN_ID> · **Verdict**: <NATIVE-VERDICT>

## Why this is better

<the before/after a reviewer would otherwise have to infer: what was worse without this
change, what is better now, the number where one exists, and what it cost. Benefits with
no measurement behind them are labelled "claimed, unmeasured".>

## What the plan asked for

<the approved prd.md's goals in the operator's terms — 2-4 lines, not the story titles.>

## What was built

<2–4 sentences: the problem the change solves, and the observable behavior that
proves it is solved.>

## Where it diverged from the plan, and why

<every deliberate deviation, differently-satisfied criterion, and mid-build scope
call, each with its reason — or the single word "None".>

## What remains unverified

<skipped gates, criteria argued rather than observed, pre-existing reds carried
forward, anything needing a hand check — or "Nothing".>

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph | `prd.json` stories + artifact contract | `<t>/<t> stories pass` | PASS |
| Regression floor | `/eval` runner exit + delta | `rc=0`, no new green→red | PASS |
| Promotable / CI | focused classifier JSON | `promotable=true`, `evidenceComplete=true` | PASS |
| UI | browser criteria | n/a — no story declares browser verification | N/A |
| Slop | net lines + changed-function CCN | `+<netAdded>/-<netRemoved>`, `<n>` over CCN <max> | PASS |

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
