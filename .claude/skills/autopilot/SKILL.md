---
name: autopilot
description: |
  Self-improvement loop: each hourly run implements the oldest open issue
  labeled `autopilot` that has no open PR. When the queue is empty it runs
  first-principles `/harness-audit` research, files its own `autopilot`
  ticket from the top-ranked finding, and builds that. Decomposes via the pm
  agent, scaffolds against the ticket with `/ship-spec --issue`, implements
  it with the resumable Ralph runner (`scripts/ralph.sh`), runs an `/eval`
  regression gate, and finalizes
  a ready-for-review PR whose description states why this item was selected.
  Harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox
  application code. Runs in its own per-run tmux session. Caps: 6 open
  autopilot PRs created per UTC day AND 10 total open; never auto-merges.
  TRIGGER when: the hourly crons/autopilot.md fires, or invoked manually on
  demand (e.g. /autopilot --dry-run to preview the next selection).
argument-hint: "[--dry-run]"
---

# Autopilot

Unattended self-improvement loop for the harness. Each run picks one harness-infra item from the GitHub `autopilot` issue queue (or researches and files one when the queue is empty), builds it end-to-end through `pm decompose → /ship-spec --issue → Ralph runner → /eval`, and lands a ready-for-review PR whose description opens with **why this item was selected this session**. Scope is strictly **harness-infra only** (skills/rules/docs/scripts/crons/wiki) — never sandbox application code, never auto-merge.

When fired by the hourly cron, the run lives in its own detached tmux session (`tmux: true` in `crons/autopilot.md`); **iff** the run produced a PR the session persists and resumes the run's own conversation as a live agent you can `tmux attach` and drive — attach and proceed if a run needs a judgment call (see § Session lifecycle).

`--dry-run` prints the selection decision (queue ticket or research finding) plus the open-PR counts, then exits without calling `/ship-spec` or the Ralph runner and without touching git or GitHub.

## Requirements

- GitHub CLI authenticated for the target repo with permission to read/write issues, labels, pull requests, branches/contents, and Actions checks.
- A local `development` branch tracking the repo's integration branch, with a clean working tree at run start.
- `tmux`, `pnpm`, and the configured agent CLIs available in the harness environment.
- The `autopilot` label is the public work queue. There is no in-repo backlog file or private queue state.

## Instructions

### 1. Guardrails

Order matters — cheapest exits first.

**Ensure the GitHub labels exist** (idempotent — safe every pulse):

```bash
gh label create autopilot --color 6E40C9 --description "Opened by the autopilot loop" 2>/dev/null || true
gh label create autopilot-blocked --color B60205 --description "Autopilot ticket blocked by a critic gate; remove to retry" 2>/dev/null || true
```

**Total-open ceiling** — at most 10 open autopilot PRs at any time (any age):

```bash
TOTAL_OPEN=$(gh pr list --state open --label autopilot --json number --jq 'length')
echo "total open autopilot PRs: $TOTAL_OPEN (ceiling 10)"
```

If `$TOTAL_OPEN` ≥ 10 → memory log `Result: SKIPPED-CAP-TOTAL`, liveness `SKIPPED-CAP-TOTAL`, **EXIT** (no PR produced → do not touch the keep-marker; the session auto-closes).

**Daily cap** — at most 6 autopilot PRs created today (UTC) still open; a same-day close/merge frees a slot:

```bash
TODAY=$(date -u +%Y-%m-%d)
OPEN_TODAY=$(gh pr list --state open --search "label:autopilot created:>=$TODAY" --json number --jq 'length')
echo "open autopilot PRs created today: $OPEN_TODAY (cap 6)"
```

If `$OPEN_TODAY` ≥ 6 → memory log `Result: SKIPPED-CAP-DAILY`, liveness `SKIPPED-CAP-DAILY`, **EXIT** (no keep-marker).

If `--dry-run`: print both counts now (the selection is printed after §2), then **continue** to §2 to determine the selection but exit before §4.

**Require clean state**:
```bash
# Self-heal a clean-but-stranded branch from a prior interrupted run (nothing to lose):
# a crash before §5/§6/§7 can leave HEAD on a clean feature branch; recover it rather
# than FAIL every hour. A *dirty* tree is NOT auto-cleaned here (it may be human WIP).
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "development" ] && git diff --quiet && git diff --cached --quiet; then
  git checkout -f development && BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi
git diff --quiet && git diff --cached --quiet || { echo "ERROR: dirty working tree"; exit 1; }
[ "$BRANCH" = "development" ] || { echo "ERROR: not on development (on $BRANCH)"; exit 1; }
```

If either check fails, log `Result: FAIL` + `Observation: dirty working tree or wrong branch` and exit 1 without touching GitHub.

**Sync with origin** (mandatory — a stale `development` base means dedupe misses fresh merges and the run branches off old code):

```bash
git fetch origin development
git merge --ff-only origin/development || { echo "ERROR: development diverged from origin"; exit 1; }
```

If the fast-forward fails, log `Result: FAIL` + `Observation: development diverged from origin/development; manual reconcile needed` and exit 1 without touching GitHub.

**Capture the tmux session context** (set by the cron runtime when `tmux: true`; EMPTY when invoked manually — every tmux step below must no-op when empty):

```bash
SESSION="$CRON_TMUX_SESSION"        # e.g. autopilot-0610-1805, or empty
KEEP="$CRON_KEEP_MARKER"            # e.g. /tmp/autopilot-0610-1805.keep, or empty
```

### 2. Select — issue queue first, research only when empty

GitHub issues labeled `autopilot` ARE the work queue. There are no time throttles and no in-repo backlog — the user steers by filing `autopilot`-labeled issues.

**Queue check** — actionable = open, labeled `autopilot`, NOT labeled `autopilot-blocked`, and with no linked PR (GitHub's `linked:pr` qualifier matches PRs with closing keywords — our `Closes #N` convention):

```bash
gh issue list --state open --label autopilot \
  --search "-linked:pr -label:autopilot-blocked" \
  --json number,title,createdAt --jq 'sort_by(.createdAt)'
```

- **Oldest actionable issue wins** → `ISSUE_NUM`, `TITLE`, `CREATED`. Derive `SLUG` from the title (kebab-case, ≤5 words). Set:
  ```
  SELECTION_MODE=queue
  SELECTION_RATIONALE="Queue selection: implementing open autopilot issue #$ISSUE_NUM (\"$TITLE\") — the oldest actionable ticket (filed $CREATED) with no open PR."
  ```
  If `[ -n "$SESSION" ]`, rename the session for readability: `tmux rename-session "autopilot-$SLUG"`. Leave `$KEEP` unchanged — the keep-marker path is fixed at spawn time and the session wrapper checks that original path.
- **No actionable item** — the queue is empty, OR every open `autopilot` ticket already has an open PR — → **fall through to research** (below). A single in-flight PR MUST NOT starve the loop: the §1 caps (6 open created/day, 10 total) are the pile-up guard, not an in-flight check. Those caps were already enforced above, so research here is cap-bounded by construction. Do **not** un-draft, finalize, or otherwise mutate a PR opened by a different run while idling on it — surface it (the heartbeat watches for stuck-green drafts) and proceed to research instead.

**No actionable queue item → research** (first-principles pass — fires whenever the queue is empty *or* every open ticket already has a PR):

1. Run `/harness-audit`. Rank its harness-infra findings by impact.
2. Dedupe each finding (in rank order) against open issues, open PRs, **and merged PRs** — advance past any hit (a blocked candidate must never end the run while others remain):
   ```bash
   DUPE_OPEN_ISSUE=$(gh issue list --state open --json title --jq '.[].title' | grep -i "$SLUG" || true)
   DUPE_OPEN_PR=$(gh pr list --state open --json title,headRefName --jq '.[] | "\(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   DUPE_MERGED_PR=$(gh pr list --state merged --limit 50 --json number,title,headRefName --jq '.[] | "\(.number) \(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   ```
3. **No survivor** → memory log `Result: NOTHING-NEW`, liveness `NOTHING-NEW`, exit 0 (no keep-marker). Research fires whenever no actionable ticket exists — both when the queue is fully drained AND when open tickets are all awaiting review. Dedupe (against open issues, open PRs, and merged PRs) plus the §1 caps bound the output: an already-filed finding dedupes to `NOTHING-NEW`; worst case an hourly audit yields `NOTHING-NEW` repeatedly — accepted cost.
4. **Top survivor** → file the ticket from the plan. Write a body to `/tmp/autopilot-research-$$.md` containing (a) the finding, (b) the first-principles rationale, (c) a 3–7-bullet plan sketch:
   ```bash
   gh issue create --label autopilot --title "feat: <finding>" --body-file /tmp/autopilot-research-$$.md
   ```
   Capture `ISSUE_NUM`; derive `SLUG` from the title. Set:
   ```
   SELECTION_MODE=research
   SELECTION_RATIONALE="Research selection: queue was empty; /harness-audit ranked this finding #1 by impact among harness-infra candidates. First-principles rationale: <reasoning>. Filed as #$ISSUE_NUM."
   ```
   Rename the session as above. Then **implement it this same run** (§3 onward).

**`--dry-run` exit** — print:

```
[dry-run] mode: $SELECTION_MODE
[dry-run] selected: #$ISSUE_NUM ($SLUG)        # research path: "would file + build: <finding>"
[dry-run] open autopilot PRs created today: $OPEN_TODAY (cap 6); total open: $TOTAL_OPEN (ceiling 10)
[dry-run] exiting without calling /ship-spec or scripts/ralph.sh
```

In `--dry-run`, the research path ranks findings but MUST NOT `gh issue create` — print the would-be finding instead. Then exit 0.

### 3. pm decompose

Invoke the `pm` agent via the `Agent` tool with `subagent_type: pm`. The input is the **ticket body** — identical for queue tickets (user- or prior-run-filed) and just-created research tickets:

```bash
gh issue view "$ISSUE_NUM" --json title,body --jq '"\(.title)\n\n\(.body)"'
```

Pass a 5-field advisor-model briefing:

```
## Advisor Briefing

**Goal**: Decompose the harness-infra ticket #$ISSUE_NUM into a concrete implementation plan.

**Constraints / gotchas**:
- Scope: harness-infra only (skills/rules/docs/scripts/crons/wiki) — do NOT touch sandbox application code.
- Must produce output suitable as input for /ship-spec (a short description + implementation plan).
- Keep the plan to 3–7 concrete acceptance-criteria bullets; do not over-specify.

**Acceptance criteria**:
- A one-sentence feature description suitable for /ship-spec (≤ ~120 chars).
- A bullet-list implementation plan (3–7 items).

**Start here**: the ticket body (`gh issue view $ISSUE_NUM`), plus current repository context.

**Out of scope**: PRD JSON generation, branch creation, git operations.
```

Capture the pm output as `PM_DESC` (the first sentence) and `PM_PLAN` (the rest).

### 4. /ship-spec --issue

Run `/ship-spec` against the existing ticket (the `--issue` flag links it instead of opening a duplicate):

```
/ship-spec "$PM_DESC" --plan <PM_PLAN content> --prefix feat --issue $ISSUE_NUM
```

`/ship-spec` runs `/prd` → 2 critics → (skips issue creation, reuses #$ISSUE_NUM) → `/ralph` → branch `feat/$ISSUE_NUM-$SLUG` → **draft** PR. **Capture `PR_NUM`.**

**Critic HALT handling** — if `/ship-spec` emits `HALT` (critic gate rejected the spec):
- Comment the verdict on the ticket and block it so it can't retry-loop hourly:
  ```bash
  gh issue comment "$ISSUE_NUM" --body "autopilot: /ship-spec critic gate rejected the spec. Verdict: <summary>. Labeled autopilot-blocked; remove the label to retry."
  gh issue edit "$ISSUE_NUM" --add-label autopilot-blocked
  ```
- Memory log `Result: HALT-CRITIC-GATE`, liveness `HALT-CRITIC-GATE`, exit 0 (no PR → no keep-marker).

**Add the `autopilot` label** to the PR:
```bash
gh pr edit "$PR_NUM" --add-label autopilot
```

**State the selection rationale in the PR description** (mandatory — every autopilot PR explains why this item was chosen this session). Idempotent; prepends a `## Selection rationale` section so it is the first thing a reviewer reads:

```bash
if ! gh pr view "$PR_NUM" --json body --jq .body | grep -q "## Selection rationale"; then
  BODY=$(gh pr view "$PR_NUM" --json body --jq .body)
  printf '## Selection rationale\n\n%s\n\n---\n\n%s\n' "$SELECTION_RATIONALE" "$BODY" > "/tmp/autopilot-pr-$PR_NUM.md"
  gh pr edit "$PR_NUM" --body-file "/tmp/autopilot-pr-$PR_NUM.md"
  rm -f "/tmp/autopilot-pr-$PR_NUM.md"
fi
```

### 5. Implement — Ralph runner

`/ship-spec` (§4) scaffolds the four-file Ralph contract at `tasks/$SLUG/` (`prd.md`, `prd.json`, `prompt.md`, `progress.txt`). Execute the stories with the **Ralph loop runner** rather than an in-process `/delegate` wave: the loop persists per-story state (`prd.json` `passes` + `progress.txt`), so a mid-run agent usage-limit or crash **resumes from the last passing story** instead of losing the whole run and leaving a spec-only draft PR. Ralph also falls back `claude→pi→codex` when Claude is throttled.

The main checkout is already on `feat/$ISSUE_NUM-$SLUG` (§4) and has `node_modules`, so launch the loop here — it runs in its own tmux session named `$SLUG`, committing one story per iteration to the branch:

```bash
scripts/ralph.sh "$SLUG"
```

Then **bash-poll** `tasks/$SLUG/progress.txt` for the terminal sentinel. Polling is pure shell — it keeps the autopilot's own session **off Claude** (no token spend) while Ralph does the throttle-prone implementation. Each round is bounded under the Bash tool ceiling; **re-run the round** until it reports `RALPH: DONE` or `RALPH: SESSION-GONE`, up to ~8 rounds (~64 min wall-clock):

```bash
# one poll round — re-run until it prints RALPH: DONE or RALPH: SESSION-GONE
end=$(( $(date +%s) + 480 ))
while [ "$(date +%s)" -lt "$end" ]; do
  grep -q '^STATUS: COMPLETE' "tasks/$SLUG/progress.txt" && { echo "RALPH: DONE"; break; }
  tmux has-session -t "$SLUG" 2>/dev/null || { echo "RALPH: SESSION-GONE"; break; }
  sleep 30
done
```

- `RALPH: DONE` (or `SESSION-GONE` **with** `STATUS: COMPLETE` in `progress.txt`) → implementation finished; the loop's commits are on the work branch — proceed to §6.
- After ~8 rounds with no sentinel, or `SESSION-GONE` **without** `STATUS: COMPLETE` → **Ralph incomplete** (timeout / loop died / all harnesses exhausted). Handle below.

**Ralph-incomplete compensation** — the partial implementation is committed on the branch and the four-file task state is resumable:
```bash
tmux kill-session -t "$SLUG" 2>/dev/null || true
gh pr comment "$PR_NUM" --body "autopilot: Ralph loop did not reach STATUS: COMPLETE (timeout / exhausted / error). PR left draft; tasks/$SLUG/ state is resumable — re-run \`scripts/ralph.sh $SLUG\` to continue. Status: RALPH-INCOMPLETE."
```
- Memory log `Result: RALPH-INCOMPLETE`, liveness `RALPH-INCOMPLETE`, **persist the session** (`[ -n "$KEEP" ] && touch "$KEEP"`), the canonical clean restore (`git checkout -f development` then `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`), exit 1 (non-destructive — never auto-close the issue or PR).

> **Why Ralph, not `/delegate`**: an in-process wave can die wholesale on a mid-run usage-limit, leaving an un-implemented draft. Ralph's resumable per-story state + harness fallback survive it, and it **relocates** the implementation work (does not duplicate it) into a loop whose fallback can run off Claude. `/delegate` remains the better tool for a task whose stories are genuinely **independent and parallelizable** (Ralph is strictly sequential, one story/iteration) — an operator may swap §5 back for such a task. `overlap: false` still holds: the autopilot's foreground session blocks on the poll until Ralph finishes, so the next hourly fire cannot overlap (it logs `SKIPPED_OVERLAP`).

### 6. Eval gate

After Ralph completes (§5), **while still on the work branch**, run the probe suite:

```
/eval
```

- If `/eval` updates `evals/RESULTS.md`, commit it on the branch:
  ```bash
  git add evals/RESULTS.md && git commit -m "task: refresh evals benchmark" || true
  ```

**Decision rule** — key on the runner's exit code and the green→red **delta**, NOT on the bare presence of a `REGRESSION` row in `evals/RESULTS.md`. A probe that was already red on the base (`origin/development`) is **pre-existing** — this PR did not cause it, so it must not block. **PROCEED** to §7 when BOTH of these hold:

1. the `/eval` runner exited `0`, AND
2. every regressed probe's delta is `unchanged` vs the base (already-red — NOT a NEW green→red transition).

**Keep the PR draft** (status `PR-DRAFT-EVAL-RED`) only on a **NEW (green→red) regression OR a non-zero runner exit**:
  ```bash
  gh pr comment "$PR_NUM" --body "autopilot: /eval reported a NEW (green→red) probe regression (<probe ids>) or a non-zero runner exit. PR left draft; resolve before marking ready."
  ```
  Memory log `Result: PR-DRAFT-EVAL-RED`, liveness `PR-DRAFT-EVAL-RED`, then `[ -n "$KEEP" ] && touch "$KEEP"`, the canonical clean restore (`git checkout -f development` then `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`), exit.

> **Diagnostic note (non-gating):** file-scope overlap does not gate. If a regressed probe reads a file this PR changed, the runner-exit + delta signal still governs — a self-referential probe (e.g. `eval-gate` on an autopilot edit) whose delta is `unchanged` does NOT block. The delta is the authoritative causation signal.

- **All clear, or only pre-existing reds (`unchanged` delta) with runner exit 0** → when a pre-existing red is present, **post it on the PR** for honesty (do not claim an all-green board), then proceed to §7.

### 7. Finalize

**Push the branch**:
```bash
git push origin HEAD
```

**CI gate** — run `/ci-status`:

- **Green** (all checks passing):
  ```bash
  gh pr ready "$PR_NUM"
  ```
  Memory log `Result: PR-READY`, liveness `PR-READY`.
- **Red OR `/ci-status` times out**:
  - Leave the PR **draft** (do NOT call `gh pr ready`).
  - `gh pr comment "$PR_NUM" --body "autopilot: CI is red or timed out. PR left as draft. Resolve failures and mark ready manually."`
  - Memory log `Result: PR-DRAFT-CI-RED`, liveness `PR-DRAFT-CI-RED`.

**Never call `gh pr merge`** — autopilot does not auto-merge under any condition.

**Persist the session** (a PR exists on every §7 path): `[ -n "$KEEP" ] && touch "$KEEP"`.

**Restore branch** (mandatory — the next cron fire's §1 branch guard only passes on `development`). Canonical clean restore — the force checkout discards only this run's own uncommitted residue (committed work is safe on the branch / draft PR); the assertion mirrors the §1 guard:
```bash
git checkout -f development
git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }
```

### 8. Memory Log

Append to `memory/<today>/log.md` on **every** exit path (skips, halts, errors included):

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "memory/$TODAY"
cat >> "memory/$TODAY/log.md" <<EOF

## Autopilot -- $TIME UTC
- **Result**: <SKIPPED-CAP-TOTAL | SKIPPED-CAP-DAILY | NOTHING-NEW | PR-READY | PR-DRAFT-CI-RED | PR-DRAFT-EVAL-RED | HALT-CRITIC-GATE | RALPH-INCOMPLETE | DELEGATE-FAIL | FAIL>
- **Selected**: <#issue + slug, or "none">
- **Session**: <tmux session name, or "none">
- **Action**: <one-line summary of what was done>
- **Observation**: <one sentence — key finding or outcome>
EOF
```

See `context/rules/memory.md` for the canonical Memory Improvement Protocol.

## Guidelines

- **Scope guard**: harness-infra only — skills, rules, docs, scripts, crons, wiki. Never write or modify sandbox application code. Same boundary as `CLAUDE.md` § What You Do NOT Do.
- **Selection rationale**: every PR autopilot opens MUST carry a `## Selection rationale` section as the FIRST section of its description, stating why this item was chosen this session (queue position, or the research finding + impact ranking).
- **No auto-merge**: autopilot finalizes a *ready-for-review* PR; a human merges. The word "merge" must never appear in an autopilot-generated commit message, PR body, or `gh` command.
- **Caps**: at most 6 open autopilot PRs created per UTC day AND 10 total open at any time. A close/merge frees a slot.
- **Implementation executor**: §5 launches the Ralph loop (`scripts/ralph.sh "$SLUG"`) and bash-polls `tasks/$SLUG/progress.txt` — the autopilot's own session blocks on the poll (no `run_in_background`), so `overlap: false` still guards the next fire. Ralph's resumable per-story state + `claude→pi→codex` fallback survive a mid-run usage-limit; `/delegate` is the documented fallback for genuinely parallelizable multi-story tasks (Ralph is strictly sequential).
- **Non-destructive failure**: never auto-close issues or PRs. On failure, comment + log. Human inspection is the recovery path.
- **autopilot-blocked**: a critic HALT labels the ticket `autopilot-blocked`, excluding it from the queue query until a human removes the label — a bad ticket can't retry-loop hourly.
- **Idempotent labels**: the `gh label create … 2>/dev/null || true` pattern is safe to run every pulse.
- **Liveness on every path**: every exit appends `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "<TOKEN>" >> crons/.cron.log` — skip, halt, error, success. A missing liveness line looks like a crash.
- **Session lifecycle**: persist the per-run tmux session (`[ -n "$KEEP" ] && touch "$KEEP"`) iff the run produced a PR (`PR-READY`, `PR-DRAFT-CI-RED`, `PR-DRAFT-EVAL-RED`, `RALPH-INCOMPLETE`, `DELEGATE-FAIL`). No-PR paths never touch the keep-marker, so their sessions auto-close. The `[ -n "$KEEP" ]` guard means manual runs (no tmux) are unaffected.
- **Branch restore (canonical clean restore)**: every path that changed the working branch (all paths reaching §4+) must run `git checkout -f development` then `git diff --quiet && git diff --cached --quiet || { echo "ERROR: autopilot restore left a dirty tree"; exit 1; }`. The force checkout discards only the run's own uncommitted residue — staged AND unstaged tracked changes (it does not remove untracked files, which do not trip the §1 guard); committed work is preserved on the feature branch / draft PR. The assertion mirrors the §1 guard, so "assertion passes" ≡ "the next fire's §1 guard will pass". §1 additionally self-heals a *clean*-but-stranded branch; a *dirty* tree at §1 still hard-FAILs to protect any human WIP.

## Reference

### Status tokens

| Token | Meaning |
|-------|---------|
| `SKIPPED-CAP-TOTAL` | ≥10 open autopilot PRs (any age); run skipped until one closes/merges |
| `SKIPPED-CAP-DAILY` | ≥6 autopilot PRs created this UTC day are still open; skipped until one closes/merges or the day rolls over |
| `NOTHING-NEW` | No actionable ticket (queue empty, or all open tickets already have PRs) AND `/harness-audit` produced no finding that survives dedupe — research ran but had nothing fresh to file. _(Replaces the retired `IN-FLIGHT` token: a single in-flight PR no longer ends the run; it falls through to research.)_ |
| `PR-READY` | End-to-end success; PR marked ready with green CI |
| `PR-DRAFT-CI-RED` | PR left draft because CI was red or `/ci-status` timed out |
| `PR-DRAFT-EVAL-RED` | PR left draft because `/eval` reported a NEW (green→red) probe regression or a non-zero runner exit |
| `HALT-CRITIC-GATE` | `/ship-spec` critic gate rejected the spec; ticket labeled `autopilot-blocked`, no PR opened |
| `RALPH-INCOMPLETE` | §5 Ralph loop did not reach `STATUS: COMPLETE` (timeout, loop died, or all harnesses exhausted) after `/ship-spec` opened a PR; PR left draft — `tasks/$SLUG/` state is resumable via `scripts/ralph.sh $SLUG` |
| `DELEGATE-FAIL` | the optional `/delegate` fallback executor failed after `/ship-spec` opened a PR; PR left draft |
| `SKIPPED_OVERLAP` | Emitted by the cron runtime (not this skill): a previous fire of this id was still running with `overlap: false` |
| `FAIL` | Pre-flight failure (dirty tree, wrong branch, diverged `development`) before any PR |

### Key paths

| Path | Purpose |
|------|---------|
| `crons/autopilot.md` | Cron definition (`tmux: true`) that fires this skill hourly |
| `crons/.cron.log` | Append-only liveness log read by the cron runtime |
| `memory/<today>/log.md` | Daily session log; autopilot appends an entry each run |
| `.claude/agents/pm.md` | pm agent definition (invoked via `Agent subagent_type: pm`) |
| `$CRON_TMUX_SESSION` / `$CRON_KEEP_MARKER` | Per-run tmux session name + keep-marker path, set by the cron runtime (empty on manual runs) |
