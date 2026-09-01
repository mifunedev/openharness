# `/spec execute` — implementation ⇄ audit → evidence → spec-retro → improve

> Detail doc for the **`execute`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form:
> `execute <slug> [--pr <N>] [--repo <owner/name>] [--remote <name>] [--base <branch>]`.
> The dispatcher passes the argument string after `execute` to this procedure as
> `$ARGUMENTS`. Authority: `.oh/skills/spec/SKILL.md`.

The **execute** node of the `/spec` workflow is pointed at a
planned `.oh/tasks/<slug>/` folder whose `prd.md` the operator has approved, it drives the
implementation to a ready-for-review PR and stops at the human merge gate. It contains the
workflow's one adversarial loop — `implementation ⇄ audit`.

**This file is the whole workflow.** Every mechanic it needs — the issue, the branch, the draft
PR, the implementation, the `/eval` gate, the wiki gate, the promotable classification, and the
undraft — is written out below, in order, with no deferral to another skill. Reading it top to
bottom tells you what `/spec execute` does; you never have to open a second skill to learn the
next step.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — reads the four-file contract in `.oh/tasks/<slug>/` and `prd.json`'s `branchName`. Required. |
| `--pr <N>` | Resume against an existing PR rather than creating one. |
| `--repo <owner/name>` | GitHub repo (default `mifunedev/openharness`; read from the folder if `/spec plan` recorded it). |
| `--remote <name>` | Git remote (resolved from `--repo` if absent). |
| `--base <branch>` | PR base + branch start point (default `development`). |

```bash
SPEC_REPO="${SPEC_REPO:-mifunedev/openharness}"
SPEC_BASE="${SPEC_BASE:-development}"
case "${ARGUMENTS:-}" in *--repo*) SPEC_REPO=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--repo[ =]\([^ ]*\).*/\1/p') ;; esac
case "${ARGUMENTS:-}" in *--base*) SPEC_BASE=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--base[ =]\([^ ]*\).*/\1/p') ;; esac
resolve_spec_remote() {
  git remote -v | awk -v repo="$SPEC_REPO" '
    BEGIN { want=tolower(repo) }
    $3 == "(fetch)" {
      url=$2
      sub(/\.git$/, "", url)
      sub(/^.*github.com[:\/]/, "", url)
      if (tolower(url) == want) { print $1; exit }
    }'
}
case "${ARGUMENTS:-}" in *--remote*) SPEC_REMOTE=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--remote[ =]\([^ ]*\).*/\1/p') ;; esac
SPEC_REMOTE="${SPEC_REMOTE:-$(resolve_spec_remote)}"
[ -n "$SPEC_REMOTE" ] || { echo "ERROR: no local git remote for $SPEC_REPO"; exit 1; }
echo "spec execute target: repo=$SPEC_REPO remote=$SPEC_REMOTE base=$SPEC_BASE"
```

Do not let implicit `gh` repo resolution or a bare `git push origin` send this build's
issue or PR to a fork. The remote is resolved from the repo URL, and the run fails closed
when no local remote matches.

Precondition: `.oh/tasks/<slug>/` carries the four-file contract (`prd.md`, `prd.json`,
`prompt.md`, `progress.txt`) produced by `/spec plan`, and its `prd.md` has been approved.
**Approving the plan is the commitment gate** — there is no separate critique or approve
node (`.oh/skills/spec/SKILL.md`). If the folder is incomplete, refuse and route back to
`/spec plan`.

**There is no executor argument, no handoff, and no separate implementation process.**
`/spec execute` has exactly one implementation owner: **the agent that is running it**. That
agent implements the approved task graph, validates each story, records progress, runs the
audit/eval/wiki/evidence gates, and finalizes the PR. Ownership is a **role**, not a terminal
topology — it is not a tmux session, a Herdr tab or pane, a background shell, or any other
runtime identifier. `/delegate` is available only for bounded, disjoint worker tasks whose
results this owner reconciles; it never becomes a second supervisor, a second PR owner, or a
replacement workflow. `STATUS: COMPLETE` is a durable task record, not a handoff signal.

`/spec` defines and verifies the execution contract. **It does not create the agent that
executes it.** The operator starts the coding-agent session — in Herdr, a terminal, an IDE, or
anywhere else — and pastes the task into it; from that point the receiving agent owns the task
through every gate below.

---

## The pipeline

### 1. Locate (or open) the issue

The approved plan is the commitment, so GitHub-side state may now be created.

`prd.json`'s `branchName` already embeds `<N>`. In the canonical flow that is the issue
the human selected and `/spec plan` consumed — **locate** it, do not open a second one:

```bash
gh issue view <N> --repo "$SPEC_REPO"
```

Open an issue only in a standalone run that has none yet. Compose the body from `prd.md`'s
introduction and goals; the title format is `<prefix>: <slug-as-prose>` per
`.claude/skills/git/SKILL.md`:

```bash
gh issue create \
  --repo "$SPEC_REPO" \
  --title "<prefix>: <slug-as-prose>" \
  --label "<prefix>" \
  --body-file <(printf '%s\n' \
    "## Summary" \
    "<from prd.md introduction>" \
    "" \
    "## Goals" \
    "<from prd.md goals>" \
    "" \
    "## PRD" \
    "- .oh/tasks/<slug>/prd.md (this branch)" \
    "" \
    "## Wiki Alignment" \
    "- Impact: <REQUIRED | NOT-APPLICABLE from prd.md>" \
    "" \
    "## Tracking" \
    "Planned by /spec plan; the operator approved prd.md, which is the commitment gate. Draft PR to follow.")
```

Capture the issue number `<N>`. If `gh label create <prefix> --repo "$SPEC_REPO"` is needed
(the label does not exist), create it first with a sensible color. Heredoc bodies are safe —
the `deny-env-dump.sh` hook strips heredoc bodies before pattern-scanning, so
`--body "$(cat <<'EOF' ... EOF)"` is fine.

### 2. Branch + scaffold commit + push

```bash
# Resume-safe: checkout existing branch or create new
git fetch "$SPEC_REMOTE" "$SPEC_BASE"
git checkout -b "<prefix>/<N>-<slug>" "$SPEC_REMOTE/$SPEC_BASE" 2>/dev/null \
  || git checkout "<prefix>/<N>-<slug>"

git add -f ".oh/tasks/<slug>/"
git commit -m "$(cat <<'EOF'
<prefix>: scaffold <slug> task

Four-file contract:
- prd.md: <N> user stories
- prd.json: schemaVersion 1, branchName <prefix>/<N>-<slug>
- prompt.md: the rendered single-owner task prompt
- progress.txt: empty header

Tracks #<N>. PRD generated by /prd; converted by /ralph.

Submitted-by: <active submitter>
EOF
)"

git push -u "$SPEC_REMOTE" "<prefix>/<N>-<slug>"
```

`.oh/tasks/` is gitignored, so the `-f` on that `git add` is load-bearing: a bare
`git add .oh/tasks/<slug>/` stages nothing and the scaffold commit silently omits the
contract.

`Submitted-by:` is mandatory and must name the model/agent that actually submits the commit
(for example `Submitted-by: Claude`, `Submitted-by: Codex`, or `Submitted-by: Pi`). Do not
hard-code Claude when the active submitter is a fallback harness.

Pre-commit hook runs lint + tests; do not bypass.

### 3. `gh pr create --draft` — the observability checkpoint

```bash
gh pr create \
  --repo "$SPEC_REPO" \
  --draft \
  --base "$SPEC_BASE" \
  --head "<prefix>/<N>-<slug>" \
  --title "FROM <prefix>/<N>-<slug> TO $SPEC_BASE" \
  --body "$(cat <<'EOF'
Closes #<N>.

**Status: DRAFT — implementation, /eval, and /audit pr promotable gates are still pending.**

## Summary
<from prd.md introduction, 2-3 lines>

## Stories
<numbered list from prd.json — title only>

## Next steps
1. The agent running `/spec execute` is this task's single implementation owner; it works in the isolated worktree `.worktrees/<prefix>/<N>-<slug>`.
2. It implements the stories directly, using `/delegate` only for bounded disjoint work; it validates the stories, runs `/audit implementation`, and revises required wiki entries.
3. It runs a fresh `/audit pr` immediately before any undraft; this PR is marked ready (`gh pr ready`) only when that audit classifies it promotable (CI green + mergeable + clean). Heartbeat stale-draft watchdog output — including draft-age and draft-cap/backlog warnings — is only a resume/investigation hint, never an undraft signal.

🤖 Generated with [Claude Code](https://claude.com/claude-code) via /spec execute
EOF
)"
```

Capture the PR URL and PR number `<PR>`. This is an observability checkpoint, not the
terminal state.

### 4. Implement — the running agent is the owner

**This node launches nothing.** No Advisor session, no detached multiplexer session and no
piped pane log, no Herdr workspace, tab, or pane created on the operator's behalf, no
background-shell launch, and no runner selection. There is **no fallback runner because there
is no handoff step**. The agent that reached this line implements the task itself and carries
it through every gate below.

**Build worktree — reuse vs. create.** Isolation stays. When this run is ALREADY inside an
isolated worktree that step 2 put on the feature branch, **reuse it** — do NOT create a second
worktree (a second `git worktree add` for the same branch would nest under the current worktree
via the relative path, or fail with `branch already checked out`). Otherwise create
`.worktrees/<prefix>/<N>-<slug>` via `/worktrees` and work there:

```bash
if [ "$(git rev-parse --abbrev-ref HEAD)" != "<prefix>/<N>-<slug>" ]; then
  git worktree add ".worktrees/<prefix>/<N>-<slug>" "<prefix>/<N>-<slug>"
  cd ".worktrees/<prefix>/<N>-<slug>"
fi
```

Then implement, in this same session:

1. Read `.oh/tasks/<slug>/prompt.md` — the rendered task prompt — and `prd.json`'s story graph.
2. Implement the dependency-ready stories directly. Use `/delegate` **only** for bounded,
   disjoint worker tasks, and reconcile every worker result yourself. A delegated worker never
   becomes a second supervisor, never owns the whole task, and never finalizes the PR.
3. Validate every acceptance criterion against the repository, flip each story's `passes` to
   `true` only after that validation, and append a dated `progress.txt` entry naming the files,
   the commit, the result, and the learnings.
4. Append `STATUS: COMPLETE` to `progress.txt` only after every story in `prd.json` passes.
   That marker is a durable task record for resume and cleanup; it hands control to no one.

Commit story changes on `<prefix>/<N>-<slug>` with a `Submitted-by:` trailer and keep worktree
isolation intact. `RUNNING` describes the **task's** state — an approved folder whose stories
are not all `passes: true` — never the existence of a named process, session, tab, or pane. If
implementation is incomplete, leave the PR draft and resume `/spec execute` against the same
task folder; do not create a second implementation owner.

Then continue, in this same session, with steps 5 through 9 below.

### 5. `implementation ⇄ audit` — the adversarial loop

When implementation is complete, run the per-unit verdict gate:

```
/audit implementation <slug> --pr <N> --repo <owner/name> --base <base> --branch <prefix>/<N>-<slug>
```

`/audit implementation` composes `prd.json` task-graph conformance + the `/eval` regression
floor + `/audit pr` promotable classification (+ `/agent-browser` for UI stories, + the
gate-5 slop check) into one verdict:

- `AUDIT-FAIL` → loop back to implementation in this same session to finish the
  unmet stories, then re-audit. This is the implementation-side adversary — keep looping
  until the owner satisfies the task graph.
- `AUDIT-PASS` → implementation is promotable; continue to the tail.

**The simplify sub-loop — drive `netAdded` down.** Gate 5 asks whether the diff can be
smaller and still satisfy every acceptance criterion. On an `AUDIT-FAIL (gate 5)` the
owner removes the code the finding names — it does not argue with it — and re-audits.
The owner writes the round record; the read-only audit route only reads it:

```bash
COUNTER=".oh/tasks/<slug>/simplify-rounds.json"
ROUNDS=$(jq -r '.rounds // 0' "$COUNTER" 2>/dev/null || echo 0)
NET=$(AUDIT_ROOT="$PWD" bash .oh/skills/audit/scripts/implementation-gates.sh \
        slop-metrics "$BASE" | jq -r .netAdded)
cat > "$COUNTER" <<JSON
{ "rounds": $((ROUNDS + 1)), "netAdded": $NET, "lastCommit": "$(git rev-parse HEAD)" }
JSON
git add -f "$COUNTER"
```

Two things end this loop, and neither of them is agreement: the **cap** of 3 rounds, and a
**non-reducing round** — one whose `netAdded` did not strictly fall below the previous round's. Either way the
audit stops blocking and passes with `SIMPLICITY-RESIDUAL`, and those residual findings go
into `evidence.md` under *What remains unverified* for the operator to judge. A simplify
loop that cannot make the diff smaller has finished its work; one that keeps looping on
taste has stopped doing work.

Two further gates run inside this loop and must both clear before the audit can PASS.

**The `/eval` gate — run ONCE per cycle.** Run `/eval` while still on the work branch. If it
updates `.oh/evals/RESULTS.md`, commit the benchmark refresh on the branch. Treat only a NEW
green→red probe regression or a non-zero eval runner exit as blocking; a pre-existing red with
an unchanged delta is non-gating but should be disclosed in the PR. Key on the **delta and the
runner's exit code**, never on the bare presence of a `REGRESSION` row — a probe that was
already red on the base is pre-existing and this PR did not cause it.

This is the **only** suite run in the cycle. `/audit implementation` Gate 2 and `/benchmark`
Signal 1 read this result instead of re-running; three runs of the same 106 probes against the
same commit cost 318 probe executions and told us the same thing once. Publish the result
where they can find it, keyed to the commit it actually ran against:

```bash
bash .oh/skills/eval/run.sh ; rc=$?
cat > ".oh/tasks/<slug>/eval-result.json" <<EOF
{
  "commit": "$(git rev-parse HEAD)",
  "runnerExit": $rc,
  "ranAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "newRegressions": [<probe ids that went green→red this run, or empty>],
  "preExistingReds": [<probe ids already red on the base — non-gating, still disclosed>]
}
EOF
git add -f ".oh/tasks/<slug>/eval-result.json"
```

**`commit` is the freshness key, and it is what keeps the reuse honest.** A downstream reader
reuses this record only while `commit` equals the current `git rev-parse HEAD`. The moment the
branch moves, the record describes code that is no longer under test, and the reader must run
the suite itself rather than inherit a stale green. Reuse without that check is how a pipeline
starts reporting a floor it never measured.

**The wiki-revision gate.** If `.oh/tasks/<slug>/prd.md` has `## Wiki Alignment` with
`Impact: REQUIRED`, revise the named `.oh/skills/wiki/corpus/*.md` entries after
implementation and before the promotable gate. The revision must align with:

- the PRD's goals, non-goals, acceptance criteria, and completed behavior;
- `.oh/skills/wiki/references/schema.md`'s source-backed architecture standard: relevant
  source files, line-cited claims, system relationships for pipeline/runtime/architecture
  topics, and `## See Also` navigation.

There is **no DeepWiki comparison** in this gate. The public DeepWiki for this repo
regenerates on no schedule the gate can depend on, so requiring the comparison made the gate
answerable only by an unreliable third party — a disagreement with it measures upstream lag,
never the build. Wiki alignment is judged against the repo's own sources and the local
corpus.

Refresh `.oh/skills/wiki/corpus/README.md` via `/wiki lint` or the atomic fallback in
`/wiki ingest`, then run:

```bash
bash .oh/evals/probes/wiki-readme-index.sh
```

Commit wiki changes with the implementation branch. If the wiki impact was `REQUIRED` and the
named entries were not updated or the index probe fails, leave the PR draft and comment the
missing wiki gate.

**`/compact` after implementation.** Implementation and `/eval` have spent significant context
in this session; run `/compact` so the promotable gate and the undraft decision start
clean. Preserve the finalize keys:

```text
Preserve /spec execute finalize context: slug <slug>, branch <prefix>/<N>-<slug>, issue #<N>, PR #<PR>, implementation complete (STATUS: COMPLETE), /eval result, wiki alignment gate result (REQUIRED updated or NOT-APPLICABLE), undraft gate (/audit pr promotable → gh pr ready, else comment + stay draft), no auto-merge.
```

Non-blocking — if `/compact` is unavailable or errors, log a warning and continue.

### 6. Write `evidence.md` — the answer back to the plan

**This is a gate condition, not a formality.** Step 9 refuses to undraft without it — this
artifact carries the implementation's answer to the reviewer.

The operator's understanding of this work stops at the plan they approved. The same owner
implements the stories and records the result. `evidence.md` answers back to the plan
with the observed behavior, deviations, and remaining gaps.

Write `.oh/tasks/<slug>/evidence.md` and **commit it on the branch**, so it travels in the PR
diff. The full contract — path, linkage, observed-output rule, correlation to one audit run,
honesty about gaps — is `.oh/skills/audit/references/reviewer-evidence-doc.md`. Follow it, and
make sure the doc answers these five questions in this order:

0. **Why this is better than not doing it** — the before and after in the operator's terms,
   with a number wherever one exists, and the cost paid to get it. This question comes first
   because it is the only one the reviewer cannot answer from the diff, the gates, or the
   plan. **A doc that proves every gate green and never says what improved has failed.** A
   benefit with no measurement behind it is written *claimed, unmeasured* rather than
   asserted — and "the gates are green" is not an answer to this question.
1. **What the plan asked for** — the approved `prd.md`'s goals in the operator's terms, not a
   restatement of the story titles.
2. **What was built** — the observable behavior that now holds, with the commands and real
   output that show it.
3. **Where they diverged, and why** — every place the implementation differs from the approved plan:
   a criterion satisfied differently, a deviation taken deliberately, a scope call made
   mid-implementation. **A run with no divergence says "none" explicitly**; silence here reads as
   "nothing diverged" and is the most expensive thing this document can get wrong.
4. **What remains unverified** — gates that were skipped, criteria that were argued rather
   than observed, pre-existing reds carried forward, and anything a reviewer would have to
   check by hand.

`/audit implementation` and `/audit pr` are read-only and do not write this file; this node
writes it from what those routes observed.

### 7. `spec-retro` — capture the lessons

On `AUDIT-PASS`, run `/spec retro <slug>` (the execution-side retro). It turns the run's
signals into falsifiable, evidence-tested lessons and promotes the supported ones behind a
propose-then-confirm gate. It writes no file; step 8's `compound` is where its supported
lessons become durable.

### 8. `improve` — compound · compress · benchmark

The self-improvement tail (`.oh/skills/spec/SKILL.md`):

- **compound** — promote durable knowledge so it is reused, not re-derived. Run
  `/wiki compile` on step 7's retro report to turn its supported lessons into
  `kind: pattern` entries the next `/builder` proposal will read; run `/wiki ingest`
  for any external source the run depended on; mint a probe from any guardrail lesson.
- **compress** — keep the always-loaded context lean and clear (`/audit context`).
- **benchmark** — confirm the change earned its complexity (`/benchmark`): the `/eval`
  regression floor stays green AND the capability-benchmark ceiling held or moved. It reads
  step 5's `eval-result.json` for the floor; it does not re-run the suite.

The **groom triad** (`/audit skills` · `/wiki lint` · `/audit drift`) is deliberately NOT here.
`/audit drift` already runs hourly from the heartbeat cron, and the other two are report-only
health checks that never blocked a merge — running them per cycle spent the cycle's budget on
advisory output nobody gated on. Run them on their own cadence, or on demand.

### 9. Promotable gate → undraft → human merge gate

Push the branch so CI runs:

```bash
git push "$SPEC_REMOTE" HEAD
```

Run a fresh `/audit pr` focused on PR `#<PR>` in `$SPEC_REPO` immediately before any
undraft attempt. The read-only audit classifies the draft as **promotable** only when CI is
green AND the PR is mergeable AND clean (it reads the `statusCheckRollup`, so it subsumes a
bare `/ci-status` check). Do not infer green from silence — a no-run CI status is not
promotable. Do not treat heartbeat stale-draft watchdog output as promotable evidence; it is
only a signal to investigate or resume the draft.

**The evidence gate.** Before the undraft, `.oh/tasks/<slug>/evidence.md` must exist, be
committed on the branch, and answer the five questions step 6 names. **Refuse the undraft
without it** — a PR whose reviewer cannot see how the built thing differs from the plan they
approved is not ready for review, whatever CI says:

```bash
if [ ! -f ".oh/tasks/<slug>/evidence.md" ]; then
  gh pr comment <PR> --repo "$SPEC_REPO" --body "spec execute: PR left draft — .oh/tasks/<slug>/evidence.md is missing. The merge gate requires the implementation's answer back to the approved plan (what was asked, what was built, where they diverged, what is unverified). Resume: write it, commit it on the branch, re-run the promotable gate."
  # terminal status: DRAFT-BLOCKED (evidence)
  exit 0
fi
git ls-files --error-unmatch ".oh/tasks/<slug>/evidence.md" >/dev/null 2>&1 \
  || { echo "ERROR: evidence.md exists but is untracked — .oh/tasks/ is gitignored; commit it with 'git add -f'"; exit 1; }
```

The `git ls-files` half is not redundant: `.oh/tasks/` is gitignored, so an `evidence.md` that
was written but added without `-f` is present on disk and **absent from the PR diff** — which
is the same as not having it, from the reviewer's seat.

**Promote the implementation narrative into the PR body.** `progress.txt` holds the per-story
record the owner wrote — what it did, what it learned, and what it deviated on. Update the
PR body from it and from `evidence.md` so the reviewer meets the work in the PR rather than by
opening the task folder:

```bash
gh pr edit <PR> --repo "$SPEC_REPO" --body "$(cat <<'EOF'
Closes #<N>.

**Status: READY — /audit implementation PASSED, /eval clean, /audit pr promotable.**

## What the plan asked for
<from the approved prd.md's goals, in the operator's terms — 2-4 lines>

## What was built
<the observable behavior that now holds, one line per story, from progress.txt>

## Where it diverged from the plan, and why
<every deliberate deviation, differently-satisfied criterion, and mid-build scope call — or the single word "None">

## What remains unverified
<skipped gates, argued-not-observed criteria, pre-existing reds carried forward, anything needing a hand check — or "Nothing">

## Evidence
- `.oh/tasks/<slug>/evidence.md` — observed output per gate, correlated to audit run `<AUDIT_RUN_ID>`
- `.oh/tasks/<slug>/progress.txt` — the per-story implementation narrative

🤖 Generated with [Claude Code](https://claude.com/claude-code) via /spec execute
EOF
)"
```

The **divergence** and **unverified** sections are the two the reviewer cannot reconstruct
from the diff, so neither may be omitted; an empty one is written as `None` / `Nothing`
explicitly. A body that silently drops them reads as "nothing diverged, nothing unchecked",
which is the most expensive claim this pipeline can make by accident.

Then mark the PR ready — **only** when `/audit implementation` PASSED, `evidence.md` is
present and committed, and that immediately preceding fresh `/audit pr` classified it
promotable:

```bash
gh pr ready <PR> --repo "$SPEC_REPO"
```

Otherwise (not promotable: red/pending CI, conflicts, a new eval regression, or missing
evidence) keep the PR draft and add a comment naming the blocking gate plus resume/fix
instructions:

```bash
gh pr comment <PR> --repo "$SPEC_REPO" --body "spec execute: PR left draft — <blocking gate>. Resume: <command>."
```

Then **stop**. The human owns the merge (`.oh/skills/spec/SKILL.md`: human merge is
the final gate; no auto-merge). Never `gh pr merge`. Print the PR
URL and terminal status (`READY` or `DRAFT-BLOCKED`) as the final pipeline output.

---

## Halt conditions

| Step | Halt trigger | Recovery |
|---|---|---|
| pre | Four-file contract incomplete, or `prd.md` not approved | Refuse; route back to `/spec plan` |
| 1 | `gh issue create` fails (auth, label, repo perms) | Diagnose; create the issue manually; re-run with the issue located |
| 2 | Pre-commit hook fails (lint, tests) | Fix the issue; re-run from step 2 |
| 3 | `gh pr create` fails (no remote, branch missing on target remote) | Verify the push from step 2; re-run from step 3 |
| 4 | Implementation stops, or leaves acceptance criteria incomplete | Leave the PR draft and comment the resume command (`/spec execute <slug>` against the same task folder). Do not start a second implementation owner. |
| 5 | `/eval` reports a NEW green→red regression or exits non-zero | Leave the PR draft; fix or document the regression, then re-run `/eval` |
| 5 | Wiki impact REQUIRED but entries are missing, stale against the implemented behavior, or the README index probe fails | Leave the PR draft; fix the wiki entries/index, then re-run the wiki gate |
| 5 | `/compact` unavailable or errors | Non-blocking; log a warning and continue |
| 6 | `evidence.md` cannot be written because a gate produced no observed output | Record the gap in the doc and leave the PR draft — a gate with no observed output is a gap, never a pass |
| 9 | `.oh/tasks/<slug>/evidence.md` is missing, or present but untracked (added without `-f`) | Leave the PR draft (`DRAFT-BLOCKED (evidence)`); write and commit it, then re-run the promotable gate |
| 9 | `/audit pr` cannot classify (gh/API error), or CI is red/pending so the PR is not promotable | Leave the PR draft; fix CI and re-run the audit executor |
| 10 | PR not promotable, or `gh pr ready` fails | Leave draft + comment the blocking gate; diagnose PR state/permissions; never merge |

## Idempotency

Every step checks for prior state and resumes rather than duplicating:

| Step | Resume check | Behavior |
|---|---|---|
| 1 | The issue named by `prd.json`'s `branchName` exists, or `--pr <N>` was passed | Reuse `<N>`; never create a duplicate |
| 2 | Branch exists on the target remote | Checkout + commit on top |
| 3 | Draft PR exists for this branch | Update the body; do not create a duplicate |
| 4 | `prd.json` already has all stories passing | Skip re-implementation and continue to the gates; worktree present → reuse |
| 5 | `.oh/evals/RESULTS.md` already reflects the current probe set and no new regression exists | Continue; otherwise re-run `/eval` |
| 5 | Wiki impact NOT-APPLICABLE, or required entries already match the implementation and the index probe passes | Continue |
| 6 | `evidence.md` exists and correlates to the CURRENT audit run id | Reuse; a doc citing a stale run id is rewritten, not kept |
| 10 | `/audit pr` already classified this PR promotable | Continue to the undraft |
| 10 | PR is already ready-for-review | Print the terminal status; do not mutate |

The whole pipeline can be re-invoked safely. Failed step = fix + re-run; resume happens
automatically.

## Finalization contract

`execute` opens a draft PR early so reviewers can observe the scaffold, but a successful run
does not stop there. The terminal successful state is a **ready-for-review** PR, reached only
after implementation completes, `/audit implementation` returns AUDIT-PASS, `/eval` shows no
new green→red regression, required wiki entries are updated against the spec,
**`.oh/tasks/<slug>/evidence.md` is committed and answers back to the approved
plan**, and a fresh `/audit pr` immediately classifies the PR **promotable**
(CI green + mergeable + clean) before `gh pr ready`. Draft is reserved for blocked states: an
incomplete build, a new eval regression, missing or stale wiki alignment, **missing or
untracked evidence**, a not-promotable PR (red/pending CI or conflicts), or an explicit user
stop. Heartbeat stale-draft watchdog output
may trigger investigation or resume work, but it never authorizes `gh pr ready`. Never
auto-merge.

---

## What this node does NOT do

- **Launch a coding agent.** No tmux session, no Herdr workspace/tab/pane, no background
  shell, no runner selection, no fallback runner. The agent already running `/spec execute`
  is the implementation owner, and `/spec` never creates the agent that executes it.
- **Merge.** The terminal state is a **ready** PR. Merge is the human's gate; reset/clean is
  the runner's job after merge.
- **Select work.** Selection is the human's; `execute` builds the one folder it is
  handed.
- **Plan.** The four-file folder and its approved `prd.md` come from `/spec plan`.

---

## Reference

### Branch + commit conventions (from `.claude/skills/git/SKILL.md`)

- Branch: `<prefix>/<issue#>-<slug>`
- Commit: `<type>: <description>` (where `<type>` matches `<prefix>` for scaffold commits)
- PR title: `FROM <branch> TO <target>` (literal)
- PR body: `Closes #<N>` link required

### Primitives this composes

| Primitive | Path | Role |
|---|---|---|
| Task prompt template | `.oh/skills/spec/templates/task-prompt.md` | Step 4 — the owner's implementation and gate instructions |
| `/worktrees` skill | `.claude/skills/worktrees/SKILL.md` | Step 4 — isolated `.worktrees/<branch>` for the implementation |
| `/delegate` skill | `.claude/skills/delegate/SKILL.md` | Step 4 — optional bounded fan-out beneath the owner |
| `/audit implementation` | `.claude/skills/audit/SKILL.md` | Step 5 — the per-unit verdict gate |
| `/eval` skill | `.claude/skills/eval/SKILL.md` | Step 5 — probe regression floor |
| Wiki schema | `.oh/skills/wiki/references/schema.md` | Step 5 — source-backed wiki alignment |
| `/compact` | (built-in) | Step 5 — clears implementation context before the promotable gate |
| Reviewer evidence doc | `.oh/skills/audit/references/reviewer-evidence-doc.md` | Step 6 — the contract `evidence.md` follows |
| `/audit pr` skill | `.claude/skills/audit/SKILL.md` | Step 9 — promotable classification (gates the undraft) |
| `/ci-status` skill | `.claude/skills/ci-status/SKILL.md` | CI verification (subsumed by `/audit pr`'s promotable check) |
| Protected-paths list | `.claude/protected-paths.txt` | Load-bearing items a spec must not propose deleting |

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, `execute` is the
implementation node. It ends at the human merge gate. The runner resets or cleans after
the human merges. When a gate blocks the undraft, the next step is to resume
implementation or fix the named gate.

Report the terminal state as **`READY`** (the PR is ready for review) or
**`DRAFT-BLOCKED (<gate>)`** naming the gate that held it, alongside the PR URL. The PR's own
draft/ready state is the authority — it is what the next reader and the next run both look at.

There is no `STATUS: SPEC-*` token. The four that used to be printed here
(`SPEC-PLANNED` / `SPEC-EXECUTED` / `SPEC-BLOCKED` / `SPEC-RETRO-DONE`) had **zero executable
consumers repo-wide** — nothing parsed them, so they were ceremony that emitted a line and
bought nothing. Never infer a promotable PR from silence: an incomplete implementation or unrun CI
is `DRAFT-BLOCKED`, not ready.
