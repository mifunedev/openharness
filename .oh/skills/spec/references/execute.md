# `/spec execute` — re-ground → implementation ⇄ audit → knowledge → evidence → improve

> Detail doc for the **`execute`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form:
> `execute <slug> [--pr <N>] [--repo <owner/name>] [--remote <name>] [--base <branch>]`.
> The dispatcher passes the argument string after `execute` to this procedure as
> `$ARGUMENTS`. Authority: `.oh/skills/spec/SKILL.md`.

The **execute** node is pointed at a planned `.oh/tasks/<slug>/` folder whose
`prd.md` the operator has approved. It re-grounds the plan against current
repository state, drives the implementation to a ready-for-review PR, feeds what
the run learned back into durable knowledge, and stops at the human merge gate.
It contains the workflow's one adversarial loop — `implementation ⇄ audit`.

**This file is the whole workflow.** Every mechanic it needs — the issue, the
branch, the draft PR, the implementation step, the `/eval` gate, the knowledge-impact
gate, the evidence gate, the promotable classification, and the undraft — is
written out below, in order, with no deferral to another skill.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — reads the three-file contract in `.oh/tasks/<slug>/` and `prd.json`'s `branchName`. Required. |
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

Do not let implicit `gh` repo resolution or a bare `git push origin` send this
build's issue or PR to a fork. The remote is resolved from the repo URL, and the
run fails closed when no local remote matches.

Precondition: `.oh/tasks/<slug>/` carries the three-file contract (`prd.md`,
`prd.json`, `progress.txt`) produced by `/spec plan`, its `prd.md` has been
approved, and its `## Plan Reconciliation` says `Intent preserved: YES`.
**Approving the plan is the commitment gate** (`.oh/skills/spec/SKILL.md`). If
the folder is incomplete, or reconciliation says `NO`, refuse and route back to
`/spec plan`.

`/spec execute` has exactly one implementation owner:
**the agent that is running it**.
That agent implements the approved task graph, validates each story, records
progress, runs the audit / eval / knowledge / evidence gates, and finalizes the
PR. Ownership is a **role**, not a terminal topology — it is not conferred by a
session, a tab, or a pane, and this node creates none of those. `/delegate` is
available only for bounded, disjoint worker tasks; a delegated worker never
becomes a second supervisor, never owns the whole task, and never finalizes the
PR, and the owner reconciles and validates every result itself.

---

## Lifecycle and the status file

This node can return while the task is still building — a cron run, a resume, or
an interrupted build all reach a terminal line with stories still open — so it
reports the state it actually reached and never promises a ready PR it has not
seen:

```text
PLANNED ──▶ RUNNING ──▶ READY
                   └──▶ DRAFT-BLOCKED(<gate>)
```

| State | Meaning | Written when |
|---|---|---|
| `PLANNED` | The folder exists and is approved; nothing GitHub-side yet | before step 1 |
| `RUNNING <phase>` | The task is being built: its stories are not all `passes: true` | at every phase change, from step 3 onward |
| `READY <pr-url>` | `gh pr ready` succeeded after a promotable classification | step 10 |
| `DRAFT-BLOCKED(<gate>) <pr-url>` | A named gate held the undraft; the PR stays draft | step 10, or any halt |

**`RUNNING` describes the task, never a process.** It is an approved folder whose
stories are not all `passes: true` —
never the existence of a named process, session, tab, or pane.
The authority is `prd.json`:

```bash
jq -e 'all(.userStories[]; .passes == true)' ".oh/tasks/<slug>/prd.json"   # 0 => not RUNNING
```

The owner mirrors the phase into one line at `/tmp/spec-<slug>.state` so a
resume, the stale-draft watchdog, and an operator asking "what is it doing" have
something to read without inspecting the task graph:

```bash
STATE_FILE="/tmp/spec-<slug>.state"
printf 'RUNNING %s\n' "<phase>" > "$STATE_FILE"
```

The file is a convenience mirror, not the source of truth: if it disagrees with
`prd.json`, the task graph wins. Update it at every phase change. Both terminal
states are also reported on the PR itself, which remains the authority a later
reader sees.

---

## The pipeline

### 0. Re-ground the plan against current state

Planning and execution can happen against different repository states — minutes
apart, or weeks. Before implementing anything:

1. Read `prd.md`'s `## Knowledge Context`: the planning `Base commit`, the slugs
   under `Knowledge used`, and the paths under `Grounded against`.
2. Determine what moved between the planning base and the execution base:

   ```bash
   PLAN_BASE=$(sed -n 's/^- \*\*Base commit\*\*: `\(.*\)`.*/\1/p' ".oh/tasks/<slug>/prd.md" | head -1)
   git fetch "$SPEC_REMOTE" "$SPEC_BASE"
   git diff --name-only "$PLAN_BASE" "$SPEC_REMOTE/$SPEC_BASE" > /tmp/spec-<slug>-drift.txt
   comm -12 \
     <(sort -u /tmp/spec-<slug>-drift.txt) \
     <(printf '%s\n' <paths from Grounded against> | sort -u)
   ```

3. **Re-read every authoritative source in that intersection.** Wiki and
   knowledge text is orientation, never authority: code and tests are
   implementation truth, canonical docs/RFCs/ADRs are intended-design truth.
4. If an assumption the plan rests on materially changed, reconcile before
   continuing — update `prd.md`'s `## Plan Reconciliation` with the new
   constraint. If the change is material to the operator's *intent* rather than
   to the mechanism, stop, set the status file to `DRAFT-BLOCKED(reconciliation)`,
   and ask for re-approval. Do not implement a plan whose premise moved.

The owner consumes the approved PRD's Knowledge Context and re-reads
the sources it names. It does **not** load the pattern set — patterns are the
planner/proposer's input (`.oh/skills/wiki/references/schema.md` § 3). If the
task turns into replanning, that is a `/spec plan` re-run, not a reason to widen
what the executor reads.

### 1. Locate (or open) the issue

The approved plan is the commitment, so GitHub-side state may now be created.

`prd.json`'s `branchName` already embeds `<N>`. In the canonical flow that is the
issue the human selected and `/spec plan` consumed — **locate** it, do not open a
second one:

```bash
gh issue view <N> --repo "$SPEC_REPO"
```

Open an issue only in a standalone run that has none yet. Compose the body from
`prd.md`'s introduction and goals; the title format is
`<prefix>: <slug-as-prose>` per `.oh/skills/git/SKILL.md`:

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
    "## Expected Knowledge Impact" \
    "- Impact: <REQUIRED | NOT-APPLICABLE from prd.md>" \
    "" \
    "## Tracking" \
    "Planned by /spec plan; the operator approved prd.md, which is the commitment gate. Draft PR to follow.")
```

Capture the issue number `<N>`. If `gh label create <prefix> --repo "$SPEC_REPO"`
is needed (the label does not exist), create it first with a sensible color.
Heredoc bodies are safe — the `deny-env-dump.sh` hook strips heredoc bodies
before pattern-scanning.

### 2. Branch + scaffold commit + push

```bash
# Resume-safe: checkout existing branch or create new
git fetch "$SPEC_REMOTE" "$SPEC_BASE"
git checkout -b "<prefix>/<N>-<slug>" "$SPEC_REMOTE/$SPEC_BASE" 2>/dev/null \
  || git checkout "<prefix>/<N>-<slug>"

git add -f ".oh/tasks/<slug>/"
git commit -m "$(cat <<'EOF'
<prefix>: scaffold <slug> task

Three-file contract:
- prd.md: <N> user stories, with Knowledge Context, Expected Knowledge Impact,
  and Plan Reconciliation
- prd.json: schemaVersion 1, branchName <prefix>/<N>-<slug>
- progress.txt: header plus the plan-phase entry

Tracks #<N>. PRD generated by /prd; converted by /ralph.

Submitted-by: <active submitter>
EOF
)"

git push -u "$SPEC_REMOTE" "<prefix>/<N>-<slug>"
```

`.oh/tasks/` is gitignored, so the `-f` on that `git add` is load-bearing: a bare
`git add .oh/tasks/<slug>/` stages nothing and the scaffold commit silently omits
the contract. (`.oh/knowledge/` is **not** gitignored — knowledge pages take a
plain `git add`.)

`Submitted-by:` is mandatory and must name the model/agent that actually submits
the commit (for example `Submitted-by: Claude`, `Submitted-by: Codex`, or
`Submitted-by: Pi`). Do not hard-code Claude when the active submitter is a
fallback harness.

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

**Status: DRAFT — implementation, /eval, knowledge impact, evidence, and the promotable gate are still pending.**

## Summary
<from prd.md introduction, 2-3 lines>

## Stories
<numbered list from prd.json — title only>

## Next steps (automated)
1. The agent running `/spec execute` implements the task itself, in an isolated worktree; task state moves to RUNNING.
2. It implements the stories directly, using `/delegate` only for bounded disjoint work; it validates the stories, runs the implementation-side audit loop, and updates every knowledge page the actual diff invalidates.
3. It runs a fresh PR audit immediately before any undraft; this PR is marked ready (`gh pr ready`) only when that audit classifies it promotable (CI green + mergeable + clean). Heartbeat stale-draft watchdog output is only a resume/investigation hint, never an undraft signal.

🤖 Generated with [Claude Code](https://claude.com/claude-code) via /spec execute
EOF
)"
```

Capture the PR URL and PR number `<PR>`, then move the lifecycle forward:

```bash
printf 'RUNNING implementation\n' > "/tmp/spec-<slug>.state"
```

This is an observability checkpoint, not the terminal state.

### 4. Implement — the running agent is the owner

**This node launches nothing.** No detached multiplexer session and no piped pane
log, no Herdr workspace, tab, or pane created on the operator's behalf, no
background-shell launch, and no runner selection.
There is **no fallback runner because there is no handoff step**.
`/spec` defines and verifies the execution contract;
**it does not create the agent that** executes it. The agent that reached this
line implements the task itself and carries it through every gate below.

**Render the task prompt now; do not persist it.** The template is
`.oh/skills/spec/templates/task-prompt.md`. Substitute `<slug>`, `<branch>`, and
`<issue>` from the task folder and `prd.json`'s `branchName`, and confirm no
angle-bracket placeholder survives the render. The rendered text is read and
discarded — a saved copy of a generated file is a second artifact that drifts
from the template it came from, which is why the task folder no longer carries a
generated prompt artifact at all.

**Build worktree — reuse vs. create.** Isolation stays. When `$CRON_WORKTREE` is
set (a `worktree: true` cron's default), this run is ALREADY inside an isolated
worktree that step 2 put on the feature branch, so **reuse it** — do NOT create a
second worktree (a second `git worktree add` for the same branch would nest under
the cron worktree via the relative path, or fail with `branch already checked
out`). Standalone (no `$CRON_WORKTREE`), create `.worktrees/<prefix>/<N>-<slug>`
via `/worktrees` and work there:

```bash
WT="${CRON_WORKTREE:-}"                       # set by the cron runtime in worktree mode
if [ -n "$WT" ]; then
  cd "$WT"                                    # already on <prefix>/<N>-<slug>
else
  git worktree add ".worktrees/<prefix>/<N>-<slug>" "<prefix>/<N>-<slug>"
  cd ".worktrees/<prefix>/<N>-<slug>"
fi
```

Then implement, in this same session:

1. Read the rendered task prompt, `prd.md` — including the `## Knowledge Context`
   sources step 0 re-read — and `prd.json`'s story graph.
2. Implement the dependency-ready stories directly. Use `/delegate` **only** for
   bounded, disjoint worker tasks, and reconcile every worker result yourself. A
   delegated worker **never becomes a second supervisor**, never owns the whole
   task, and never finalizes the PR.
3. Validate every acceptance criterion against the repository, flip each story's
   `passes` to `true` only after that validation, and append a dated
   `progress.txt` entry naming the files, the commit, the result, and the
   learnings.
4. Do not load the pattern set. Patterns are the planner's input
   (`.oh/skills/wiki/references/schema.md` § 3); the owner re-reads the
   authoritative sources the approved Knowledge Context names. If the task turns
   into replanning, that is a `/spec plan` re-run, not a reason to widen what the
   executor reads.

Commit story changes on `<prefix>/<N>-<slug>` with a `Submitted-by:` trailer and
keep worktree isolation intact. Completion is read from `prd.json`, never from
prose: the task is done when
`jq -e 'all(.userStories[]; .passes == true)' .oh/tasks/<slug>/prd.json` exits 0.
`RUNNING` describes the **task's** state — an approved folder whose stories are
not all `passes: true` —
never the existence of a named process, session, tab, or pane.
If implementation is incomplete, leave the PR draft and resume `/spec execute`
against the same task folder;
**do not create a second implementation owner**.

Then continue, in this same session, with steps 5 through 10 below.

### 5. `implementation ⇄ audit` — the adversarial loop

When implementation is complete, run the per-unit verdict gate:

```
/audit implementation <slug> --pr <N> --repo <owner/name> --base <base> --branch <prefix>/<N>-<slug>
```

`/audit implementation` composes `prd.json` task-graph conformance + the `/eval`
regression floor + the PR promotable classification (+ `/agent-browser` for UI
stories, + the gate-5 slop check) into one verdict:

- `AUDIT-FAIL` → loop back to implementation in this same session to finish the
  unmet stories, then re-audit. This is the implementation-side adversary — keep
  looping until the owner satisfies the task graph.
- `AUDIT-PASS` → implementation is promotable; continue to the tail.

**The simplify sub-loop — drive `netAdded` down.** Gate 5 asks whether the diff
can be smaller and still satisfy every acceptance criterion. On an
`AUDIT-FAIL (gate 5)` the owner removes the code the finding names — it does not
argue with it — and re-audits. The owner keeps the round record; the read-only
audit route only reads it:

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

Two things end this loop, and neither of them is agreement: the **cap** of 3
rounds, and a **non-reducing round** — one whose `netAdded` did not strictly fall
below the previous round's. Either way the audit stops blocking and passes with
`SIMPLICITY-RESIDUAL`, and those residual findings go into `evidence.md` under
*What remains unverified* for the operator to judge.

**The `/eval` gate — run ONCE per cycle.** Run `/eval` while still on the work
branch. If it updates `.oh/evals/RESULTS.md`, commit the benchmark refresh on the
branch. Treat only a NEW green→red probe regression or a non-zero eval runner
exit as blocking; a pre-existing red with an unchanged delta is non-gating but
must be disclosed in the PR body and in `evidence.md`. Key on the **delta and the
runner's exit code**, never on the bare presence of a `REGRESSION` row.

This is the **only** suite run in the cycle. `/audit implementation` Gate 2 and
`/benchmark` Signal 1 read this result instead of re-running; three runs of the
same probe set against the same commit cost three times the probe executions and
told us the same thing once. Publish the result where they can find it, keyed to
the commit it actually ran against:

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

**`commit` is the freshness key, and it is what keeps the reuse honest.** A
downstream reader reuses this record only while `commit` equals the current
`git rev-parse HEAD`. The moment the branch moves, the record describes code that
is no longer under test, and the reader must run the suite itself rather than
inherit a stale green.

### 6. Actual Knowledge Impact — the diff decides

`prd.md`'s `## Expected Knowledge Impact` was the planner's prediction. The
implementation now exists, so the prediction stops being authoritative. Derive
the real answer:

```text
Expected Knowledge Impact  +  actual changed paths  +  page dependency metadata
                                    ↓
                          Actual Knowledge Impact
```

```bash
git diff --name-only "$SPEC_REMOTE/$SPEC_BASE"...HEAD > /tmp/spec-<slug>-changed.txt
bash .oh/skills/wiki/scripts/knowledge-impact.sh \
  --changed $(tr '\n' ' ' < /tmp/spec-<slug>-changed.txt)
```

`knowledge-impact.sh` is the one implementation of dependency-aware invalidation
(`/wiki lint` calls the same script with `--verified`). `/spec` does not carry a
second copy of the logic.

Take the union of the pages the script reports `NEEDS-REVIEW` and the pages
`Expected Knowledge Impact` named. **Every page in that union ends in exactly one
explicit state**, recorded in `evidence.md`:

| State | Means | Required action |
|---|---|---|
| `UPDATED` | The change made the page wrong; the page was rewritten to match | Edit the page, advance `updated:`, and for `kind: repo` advance `verified_at:` to the current commit |
| `REVERIFIED` | A declared source moved but the page's claims still hold | Re-read the page against those sources, then advance `verified_at:` only |
| `NOT-AFFECTED (<reason>)` | The page does not describe what changed | Record the reason; touch nothing |

`NOT-AFFECTED` with no reason is not a state, it is a skipped page. Advancing
`verified_at:` without re-reading launders staleness into freshness and is the
one failure this gate cannot detect afterwards.

New pages the run should create — an external source the work depended on — go
through `/wiki ingest` here. Pattern pages are **not** written here; they are
step 9's job, because they need the retro's verdicts.

Then regenerate the index and verify it:

```bash
bash .oh/evals/probes/wiki-readme-index.sh
```

Commit knowledge changes with the implementation branch (a plain `git add` —
`.oh/knowledge/` is tracked). If `Expected Knowledge Impact` was `REQUIRED` and
the union is unresolved, or the index probe fails, leave the PR draft, set
`DRAFT-BLOCKED(knowledge)`, and comment the missing gate.

### 7. Write `evidence.md` — the answer back to the plan

**This is a gate condition, not a formality.** Step 10 refuses to undraft without
it — this artifact carries the implementation's answer to the reviewer.

The operator's understanding of this work stops at the plan they approved. The
same session implements the stories and records the result.
`evidence.md` answers back to the plan with the observed behavior, deviations,
and remaining gaps.

Write `.oh/tasks/<slug>/evidence.md` and **commit it on the branch**, so it
travels in the PR diff. The full contract — path, linkage, observed-output rule,
correlation to one audit run, honesty about gaps — is
`.oh/skills/audit/references/reviewer-evidence-doc.md`. Follow it, and make sure
the doc answers these five questions in this order:

0. **Why this is better than not doing it** — the before and after in the
   operator's terms, with a number wherever one exists, and the cost paid to get
   it. This question comes first because it is the only one the reviewer cannot
   answer from the diff, the gates, or the plan. **A doc that proves every gate
   green and never says what improved has failed.** A benefit with no measurement
   behind it is written *claimed, unmeasured* rather than asserted — and "the
   gates are green" is not an answer to this question.
1. **What the plan asked for** — the approved `prd.md`'s goals in the operator's
   terms, not a restatement of the story titles.
2. **What was built** — the observable behavior that now holds, with the commands
   and real output that show it.
3. **Where they diverged, and why** — every place the implementation differs from
   the approved plan: a criterion satisfied differently, a deviation taken
   deliberately, a scope call made mid-implementation. **A run with no divergence
   says "none" explicitly**; silence here reads as "nothing diverged" and is the
   most expensive thing this document can get wrong.
4. **What remains unverified** — gates that were skipped, criteria that were
   argued rather than observed, pre-existing reds carried forward, and anything a
   reviewer would have to check by hand.

Step 6's Actual Knowledge Impact table belongs in this document, under *What was
built*. The read-only audit routes do not write this file; this node writes it
from what those routes observed.

### 8. `spec-retro` — capture the lessons

On `AUDIT-PASS`, run `/spec retro <slug>`, which is a thin wrapper for
`/retro --task <slug>`. It turns the run's signals into falsifiable,
evidence-tested lessons with verdicts and confidence levels. `/retro` is
report-only by contract and writes no file; step 9 is where its supported lessons
become durable.

### 9. `improve` — compound, then optionally compress, then benchmark

The order here is load-bearing. High-resolution execution evidence is worth the
most immediately after the run and decays with every summarization, so it is
**distilled into durable artifacts before anything discards context**:

1. **compound** — run `/wiki compile` on step 8's retro report to turn its
   supported lessons into `kind: pattern` pages under `.oh/knowledge/patterns/`,
   which the next `/builder` proposal and the next `/spec plan` will read. Mint a
   probe from any guardrail lesson.
2. **compress (optional, non-gating)** — `/compact` and any other runtime
   housekeeping happen **here and no earlier**, after evidence, retro, and
   pattern compilation have already captured what the context was carrying.
   Compaction is a runtime optimization, not a semantic stage of the build: if it
   is unavailable or errors, log a warning and continue. Nothing gates on it.
3. **benchmark** — confirm the change earned its complexity (`/benchmark`): the
   `/eval` regression floor stays green AND the capability-benchmark ceiling held
   or moved. It reads step 5's `eval-result.json` for the floor; it does not
   re-run the suite.

The **groom triad** (`/audit skills` · `/wiki lint` · `/audit drift`) is
deliberately NOT here. `/audit drift` already runs hourly from the heartbeat
cron, and the other two are report-only health checks that never blocked a merge.
The checks worth enforcing per cycle were given deterministic probes instead, so
the suite that already runs catches their findings.

### 10. Promotable gate → undraft → human merge gate

Push the branch so CI runs:

```bash
git push "$SPEC_REMOTE" HEAD
```

Run a fresh `/audit pr` focused on PR `#<PR>` in `$SPEC_REPO` immediately before
any undraft attempt. The read-only audit classifies the draft as **promotable**
only when CI is green AND the PR is mergeable AND clean (it reads the
`statusCheckRollup`, so it subsumes a bare `/ci-status` check). Do not infer
green from silence — a no-run CI status is not promotable. Do not treat heartbeat
stale-draft watchdog output as promotable evidence; it is only a signal to
investigate or resume the draft.

**The evidence gate.** Before the undraft, `.oh/tasks/<slug>/evidence.md` must
exist, be committed on the branch, and answer the five questions step 7 names.
**Refuse the undraft without it** — a PR whose reviewer cannot see how the built
thing differs from the plan they approved is not ready for review, whatever CI
says:

```bash
if [ ! -f ".oh/tasks/<slug>/evidence.md" ]; then
  gh pr comment <PR> --repo "$SPEC_REPO" --body "spec execute: PR left draft — .oh/tasks/<slug>/evidence.md is missing. The merge gate requires the implementation's answer back to the approved plan (what was asked, what was built, where they diverged, what is unverified). Resume: write it, commit it on the branch, re-run the promotable gate."
  printf 'DRAFT-BLOCKED(evidence) %s\n' "<pr-url>" > "/tmp/spec-<slug>.state"
  exit 0
fi
git ls-files --error-unmatch ".oh/tasks/<slug>/evidence.md" >/dev/null 2>&1 \
  || { echo "ERROR: evidence.md exists but is untracked — .oh/tasks/ is gitignored; commit it with 'git add -f'"; exit 1; }
```

The `git ls-files` half is not redundant: `.oh/tasks/` is gitignored, so an
`evidence.md` that was written but added without `-f` is present on disk and
**absent from the PR diff** — which is the same as not having it, from the
reviewer's seat.

**Promote the implementation narrative into the PR body.** `progress.txt` holds
the per-story record the owner wrote. Update the PR body from it and from
`evidence.md` so the reviewer meets the work in the PR rather than by opening the
task folder:

```bash
gh pr edit <PR> --repo "$SPEC_REPO" --body "$(cat <<'EOF'
Closes #<N>.

**Status: READY — implementation audit PASSED, /eval clean, knowledge impact resolved, PR audit promotable.**

## What the plan asked for
<from the approved prd.md's goals, in the operator's terms — 2-4 lines>

## What was built
<the observable behavior that now holds, one line per story, from progress.txt>

## Knowledge impact
<each impacted page and its final state: UPDATED / REVERIFIED / NOT-AFFECTED (reason)>

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

The **diverged** and **unverified** sections are the two the reviewer cannot
reconstruct from the diff, so neither may be omitted; an empty one is written as
`None` / `Nothing` explicitly. A body that silently drops them reads as "nothing
diverged, nothing unchecked", which is the most expensive claim this pipeline can
make by accident.

Then mark the PR ready — **only** when the implementation audit PASSED,
`evidence.md` is present and committed, the knowledge-impact union is resolved,
and that immediately preceding fresh PR audit classified it promotable:

```bash
gh pr ready <PR> --repo "$SPEC_REPO"
printf 'READY %s\n' "<pr-url>" > "/tmp/spec-<slug>.state"
```

Otherwise (not promotable: red/pending CI, conflicts, a new eval regression, an
unresolved knowledge page, or missing evidence) keep the PR draft, name the gate,
and record it:

```bash
gh pr comment <PR> --repo "$SPEC_REPO" --body "spec execute: PR left draft — <blocking gate>. Resume: <command>."
printf 'DRAFT-BLOCKED(%s) %s\n' "<gate>" "<pr-url>" > "/tmp/spec-<slug>.state"
```

Then **stop**. The human owns the merge (`.oh/skills/spec/SKILL.md`: human merge
is the final gate; no auto-merge). Never `gh pr merge`. Print the PR URL and the
terminal status (`READY` or `DRAFT-BLOCKED(<gate>)`) as the final pipeline
output.

---

## Halt conditions

| Step | Halt trigger | Recovery |
|---|---|---|
| pre | Three-file contract incomplete, or `prd.md` not approved | Refuse; route back to `/spec plan` |
| 0 | A source the plan grounded on changed materially against the operator's intent | `DRAFT-BLOCKED(reconciliation)`; re-approve the plan before implementing |
| 1 | `gh issue create` fails (auth, label, repo perms) | Diagnose; create the issue manually; re-run with the issue located |
| 2 | Pre-commit hook fails (lint, tests) | Fix the issue; re-run from step 2 |
| 3 | `gh pr create` fails (no remote, branch missing on target remote) | Verify the push from step 2; re-run from step 3 |
| 4 | The run stops, or leaves acceptance criteria incomplete | Leave the PR draft and comment the resume command (`/spec execute <slug>` against the same task folder). Do not start a second implementation owner. |
| 5 | `/eval` reports a NEW green→red regression or exits non-zero | Leave the PR draft; fix or document the regression, then re-run `/eval` |
| 6 | A page in the impact union has no explicit final state, or the index probe fails | `DRAFT-BLOCKED(knowledge)`; resolve every page, regenerate the index, re-run the gate |
| 7 | `evidence.md` cannot be written because a gate produced no observed output | Record the gap in the doc and leave the PR draft — a gate with no observed output is a gap, never a pass |
| 9 | `/compact` unavailable or errors | Non-blocking; log a warning and continue |
| 10 | `.oh/tasks/<slug>/evidence.md` is missing, or present but untracked (added without `-f`) | `DRAFT-BLOCKED(evidence)`; write and commit it, then re-run the promotable gate |
| 10 | The PR audit cannot classify (gh/API error), or CI is red/pending so the PR is not promotable | Leave the PR draft; fix CI and re-run the audit executor |
| 10 | PR not promotable, or `gh pr ready` fails | Leave draft + comment the blocking gate; diagnose PR state/permissions; never merge |

## Idempotency

Every step checks for prior state and resumes rather than duplicating:

| Step | Resume check | Behavior |
|---|---|---|
| 0 | `## Plan Reconciliation` already records the current base's constraints | Continue; otherwise re-ground |
| 1 | The issue named by `prd.json`'s `branchName` exists, or `--pr <N>` was passed | Reuse `<N>`; never create a duplicate |
| 2 | Branch exists on the target remote | Checkout + commit on top |
| 3 | Draft PR exists for this branch | Update the body; do not create a duplicate |
| 4 | `jq -e 'all(.userStories[]; .passes == true)'` on `prd.json` exits 0 | Implementation is complete; continue to the tail. Worktree present → reuse |
| 5 | `eval-result.json`'s `commit` equals HEAD and records no new regression | Continue; otherwise re-run `/eval` |
| 6 | Every page in the impact union already carries a final state for the current HEAD | Continue |
| 7 | `evidence.md` exists and correlates to the CURRENT audit run id | Reuse; a doc citing a stale run id is rewritten, not kept |
| 10 | The PR audit already classified this PR promotable | Continue to the undraft |
| 10 | PR is already ready-for-review | Print the terminal status; do not mutate |

The whole pipeline can be re-invoked safely. Failed step = fix + re-run; resume
happens automatically. `/tmp/spec-<slug>.state` tells a resuming session
which phase to re-enter.

## Finalization contract

`execute` opens a draft PR early so reviewers can observe the scaffold, and it
can return at `RUNNING` because the task is still building — but a successful run
does not end there. The terminal successful state is a
**ready-for-review** PR, reached only after implementation completes, the
implementation audit returns AUDIT-PASS, `/eval` shows no new green→red
regression, every page in the Actual Knowledge Impact union carries an explicit
final state, **`.oh/tasks/<slug>/evidence.md` is committed and answers back to
the approved plan**, and a fresh PR audit immediately classifies the PR
**promotable** (CI green + mergeable + clean) before `gh pr ready`.

Draft is reserved for blocked states: an incomplete build, a new eval regression,
an unresolved knowledge page, **missing or untracked evidence**, a not-promotable
PR (red/pending CI or conflicts), or an explicit user stop. Each is reported as
`DRAFT-BLOCKED(<gate>)` with the gate named — a silent stop is not a terminal
state. Heartbeat stale-draft watchdog output may trigger investigation or resume
work, but it never authorizes `gh pr ready`. Never auto-merge.

---

## What this node does NOT do

- **Launch a coding agent.** No tmux session, no Herdr workspace/tab/pane, no
  background shell, no runner selection, no fallback runner. The agent already
  running `/spec execute` is the implementation owner, and `/spec` never creates
  the agent that executes it.
- **Merge.** The terminal state is a **ready** PR. Merge is the human's gate;
  reset/clean is the runner's job after merge.
- **Select work.** Selection is the human's; `execute` builds the one folder it
  is handed.
- **Plan.** The three-file folder and its approved `prd.md` come from
  `/spec plan`.
- **Load the pattern corpus.** Patterns inform the planner. The executor consumes
  the approved Knowledge Context and re-reads the sources it names.
- **Promise a PR it has not seen.** A task whose stories are not all passing is
  reported `RUNNING`.

---

## Reference

### Branch + commit conventions (from `.oh/skills/git/SKILL.md`)

- Branch: `<prefix>/<issue#>-<slug>`
- Commit: `<type>: <description>` (where `<type>` matches `<prefix>` for scaffold commits)
- PR title: `FROM <branch> TO <target>` (literal)
- PR body: `Closes #<N>` link required

### Primitives this composes

| Primitive | Path | Role |
|---|---|---|
| Task prompt template | `.oh/skills/spec/templates/task-prompt.md` | Step 4 — rendered at execution time; never persisted |
| `/worktrees` skill | `.oh/skills/worktrees/SKILL.md` | Step 4 — isolated `.worktrees/<branch>` for the implementation |
| `/delegate` skill | `.oh/skills/delegate/SKILL.md` | Step 4 — optional bounded fan-out beneath the one owner |
| `/audit implementation` | `.oh/skills/audit/SKILL.md` | Step 5 — the per-unit verdict gate |
| `/eval` skill | `.oh/skills/eval/SKILL.md` | Step 5 — probe regression floor, run once |
| Knowledge invalidation | `.oh/skills/wiki/scripts/knowledge-impact.sh` | Step 6 — the one dependency-aware impact implementation |
| Knowledge schema | `.oh/skills/wiki/references/schema.md` | Step 6 — page kinds, `verified_at`, provenance forms |
| Reviewer evidence doc | `.oh/skills/audit/references/reviewer-evidence-doc.md` | Step 7 — the contract `evidence.md` follows |
| `/retro` skill | `.oh/skills/retro/SKILL.md` | Step 8 — report-only lesson engine, task-scoped |
| `/wiki compile` | `.oh/skills/wiki/references/compile.md` | Step 9 — the durable pattern writer |
| `/compact` | (built-in) | Step 9 — optional, non-gating, after distillation |
| `/benchmark` skill | `.oh/skills/benchmark/SKILL.md` | Step 9 — the progress-ceiling verdict |
| `/audit pr` skill | `.oh/skills/audit/SKILL.md` | Step 10 — promotable classification (gates the undraft) |
| `/ci-status` skill | `.oh/skills/ci-status/SKILL.md` | CI verification (subsumed by the PR audit's promotable check) |
| Protected-paths list | `.claude/protected-paths.txt` | Load-bearing items a spec must not propose deleting |

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, `execute` is the
implementation node. It ends at the human merge gate. The runner resets or cleans
after the human merges. When a gate blocks the undraft, the next step is to
resume implementation or fix the named gate.

Report the terminal state as **`READY`** (the PR is ready for review) or
**`DRAFT-BLOCKED(<gate>)`** naming the gate that held it, alongside the PR URL,
and mirror it into `/tmp/spec-<slug>.state`. The PR's own draft/ready state
is the authority — it is what the next reader and the next run both look at.
Never infer a promotable PR from silence: an incomplete implementation or unrun
CI is `DRAFT-BLOCKED`, not ready.
