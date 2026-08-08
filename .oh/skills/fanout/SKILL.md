---
name: fanout
description: |
  Ship a set of related issues as parallel PRs — one isolated worktree and one
  briefed agent session per unit of work, then merge, verify closure, and tear
  down. Runner-agnostic: herdr, tmux, or background shells.
  TRIGGER when: asked to work several issues at once, "ship these issues in
  parallel", "spawn an agent per issue", "fan out", or clearing a queue before
  a larger refactor.
argument-hint: "<issue numbers or task slugs> [--runner herdr|tmux|bg] [--dry-run]"
disable-model-invocation: true
allowed-tools: Bash Read Write
---

# Fanout

Take N units of work to N merged PRs, in parallel, without the agents colliding.

**The runner is a swappable detail.** What makes this work is worktree isolation, a
brief that front-loads the traps, and a merge phase that assumes conflicts are
semantic. Encode those; pick whatever runner is installed.

Mechanics this skill does not own: `/worktrees` for worktree lifecycle, `/herdr`
for the herdr CLI, `/git` for branch and PR conventions. Compose them; do not
restate them. `/delegate` is the sibling for in-process Agent-tool waves — use it
when the work does not need isolated checkouts or long-running interactive sessions.

## Terminal states

| State | Meaning |
|-------|---------|
| `SHIPPED` | Every unit merged, every issue verified closed, all worktrees removed. |
| `PARTIAL` | Some units merged; the rest named with their blocker and left intact. |
| `BLOCKED` | Stopped before launching. Nothing created. |
| `DRY-RUN` | Plan reported; no worktree, branch, or session created. |

## 1. Group by coupling — before anything is created

Do not treat the issue list as the unit list. Read each issue and find the
dependencies **between** them.

- If fixing A alone would create or multiply the defect B fixes, A and B are **one
  unit and one PR**. Splitting them ships a regression.
- If two issues touch the same component, note it — they will conflict at merge.
- If an issue's priority depends on an unmade decision, drop it from this run and
  say so rather than guessing.

State the grouping and the reason for each merge before continuing. This step is
the highest-leverage part of the skill; a wrong grouping cannot be recovered by a
good brief.

Stop with `BLOCKED` if the units cannot be separated into independently mergeable
PRs.

## 2. Check the ground

```bash
git -C "$REPO" fetch origin --quiet
git -C "$REPO" log --oneline -1
git -C "$REPO" status --short
git -C "$REPO" worktree list
ps aux | grep -Ei 'vite|uvicorn|next|taskiq|worker' | grep -v grep
```

Establish and record:

- the **base branch** (per `/worktrees` DETECT BASE — usually `development`);
- whether the primary checkout is **occupied** by a running dev stack, and which
  ports it holds. If it is, every brief must forbid entering it and forbid binding
  those ports.

## 3. One worktree per unit

Create each off the freshly-fetched base, never off local HEAD. Follow `/worktrees`
and `/git` for paths and branch names.

```bash
git -C "$REPO" worktree add -b "fix/<n>-<slug>" "$WORKTREES_ROOT/<repo>-<n>" origin/"$BASE"
```

Confirm every worktree reports the same base commit before launching anything.

## 4. Write one brief per unit

Follow `references/brief-template.md`. Author the briefs yourself rather than
delegating brief-writing — the orchestrator holds context the executors cannot
recover, and passing it through another agent loses exactly the constraints that
matter.

Write each brief to a **gitignored** path inside its worktree so it never enters
the PR diff, and prove it:

```bash
git -C "$WT" check-ignore -q .claude/brief.md || echo "NOT IGNORED — pick another path"
```

## 5. Launch

The launch command must `cd` into the worktree **inside the command itself**.
Runner flags that claim to set a working directory frequently set only metadata
while the shell starts somewhere else, and the failure is silent.

```bash
# herdr
herdr pane run "$PANE" "cd $WT && claude \"$PROMPT\""
# tmux
tmux new-session -d -s "$NAME" -c "$WT" "claude \"$PROMPT\""
```

Then **verify the resulting cwd, not the accepted argument**:

```bash
herdr pane list --workspace "$WS" | jq -r '.result.panes[] | "\(.pane_id)\t\(.foreground_cwd)"'
```

Relaunch any session that did not land in its worktree. Do not send work to a
misplaced session.

## 6. Monitor without attaching

Poll status; never attach to a running agent's terminal. Prefer server-side waits
over sleep loops.

```bash
herdr agent list | jq -r '.result.agents[] | select(.pane_id|startswith("'"$WS"'")) | "\(.pane_id)\t\(.agent_status)"'
herdr agent wait "$PANE" --status idle --timeout 1800000
```

Read a pane only to confirm it is on-brief or to diagnose a stall.

## 7. Pre-merge verification

For every PR, before merging:

```bash
gh pr view "$N" --json closingIssuesReferences,mergeable,mergeStateStatus
gh pr checks "$N"
```

- **Confirm the closing refs are earned.** GitHub matches a closing keyword
  anywhere in the body and ignores surrounding negation, so a PR that says it does
  *not* close an issue can still close it. If a unit was partially delivered, the
  issue must stay open and a follow-up must exist.
- Treat CI as the authority for suites you could not run locally, and say which is
  which when reporting.

## 8. Merge sequentially, and expect semantic conflicts

Merge one at a time. After each merge, the remaining branches are stale.

Changelog-style conflicts are mechanical — keep both sides, merged-first order.
**Conflicts in shared source are not.** When two units changed the same component,
each side usually carries a distinct intent, and taking either side alone silently
drops the other's fix. Combine the intents.

After resolving, run the affected suite **in the worktree** before pushing:

```bash
cd "$WT/<package>" && <test command> && <typecheck command>
```

A cross-unit merge can violate a guard one unit just added. Do not delegate this
check to CI when you can run it locally in seconds.

## 9. Verify closure — do not trust the keyword

```bash
for i in $ISSUES; do gh issue view "$i" --json number,state --jq '"#\(.number)=\(.state)"'; done
```

Close by hand any issue that is genuinely complete but still open. Leave open any
issue whose unit shipped partially, and confirm its follow-up exists.

## 10. Tear down

```bash
git -C "$REPO" worktree remove "$WT" --force
git -C "$REPO" checkout "$BASE" && git -C "$REPO" pull --ff-only
git -C "$REPO" branch -D "$BRANCH"; git -C "$REPO" push origin --delete "$BRANCH"
herdr workspace close "$WS"
```

Delete only branches this run created, plus merged branches the user names. Close
only runner workspaces this run created. Then confirm the primary checkout is clean
and still holds any dev stack that was running before.

## Report

```markdown
## Fanout: <SHIPPED|PARTIAL|BLOCKED|DRY-RUN>

**Units**: <grouping and why each was grouped>
**Merged**: <PR → issue, one line each>
**Issues closed**: <verified list>
**Follow-ups filed**: <new issues, and why they were not folded in>
**Verified locally vs by CI**: <split>
**Teardown**: <worktrees removed, branches deleted, workspace closed>
```

Report follow-ups explicitly. Several agents each filing their own can grow a queue
faster than the run drains it — that is often correct, but it must be visible.

## Anti-patterns

- **Fanning out before grouping.** The coupling analysis is the skill.
- **Trusting a runner's cwd flag.** Verify the resulting state.
- **Delegating brief authorship.** The orchestrator holds the context.
- **Artifacts in a tracked path.** They land in the PR diff.
- **Taking one side of a semantic conflict.** Combine the intents.
- **Trusting a closing keyword.** Read `closingIssuesReferences`.
- **Merging in parallel.** Each merge stales the others.
- **Attaching to a running agent's terminal.** Read status instead.
- **Reporting agent state you did not observe.** Show the listing you based it on.
