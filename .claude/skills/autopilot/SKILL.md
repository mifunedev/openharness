---
name: autopilot
description: |
  Self-improvement loop: each hourly run implements the oldest open issue
  labeled `autopilot` that has no open PR. When the queue is empty it runs
  first-principles `/harness-audit` research, files its own `autopilot`
  ticket from the top-ranked finding, and builds that. Decomposes via the pm
  agent, scaffolds against the ticket with `/ship-spec --issue`, then defaults
  to an expert Advisor in the same Pi cron tmux session: compact, execute
  `tasks/<slug>/prd.json` through `/delegate`, run an `/eval` regression gate, and finalize
  a ready-for-review PR whose description states why this item was selected.
  Harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox
  application code. Runs in its own per-run tmux session. Caps: 6 open
  autopilot PRs created per UTC day AND 10 total open; never auto-merges.
  TRIGGER when: the hourly crons/autopilot.md fires, or invoked manually on
  demand (e.g. /autopilot --dry-run to preview the next selection).
argument-hint: "[--dry-run] [--executor=delegate-advisor|ralph]"
---

# Autopilot

Unattended self-improvement loop for the harness. Each run picks one harness-infra item from the GitHub `autopilot` issue queue (or researches and files one when the queue is empty), builds it end-to-end through `pm decompose → /goal Advisor handoff → /ship-spec --issue → /compact → /delegate prd.json → /eval`, and lands a ready-for-review PR whose description opens with **why this item was selected this session**. Scope is strictly **harness-infra only** (skills/rules/docs/scripts/crons/wiki) — never sandbox application code, never auto-merge.

Executor toggle: `--executor=delegate-advisor|ralph`, or `AUTOPILOT_EXECUTOR=delegate-advisor|ralph`. Default is `delegate-advisor`. Ralph remains a compatibility fallback and uses the existing `scripts/ralph.sh "$SLUG"` loop.

When fired by the hourly cron, the run lives in its own detached Pi tmux session (`tmux: true` in `crons/autopilot.md`). In `delegate-advisor` mode this same cron-created Pi session is the expert Advisor runtime; do **not** spawn a second advisor session. After the work branch is known, rename the tmux session to `autopilot-<branch>` with slashes sanitized, e.g. `autopilot-feat-123-slug`, so a human can attach and continue. Leave `autopilot-<branch>` sessions alive for manual attach/continue/reap after a PR exists (see § Session lifecycle).

`--dry-run` prints the selection decision (queue ticket or research finding), executor mode, dedupe state, and open-PR counts, then exits without calling `/ship-spec`, `/delegate`, or the Ralph runner and without touching git or GitHub.

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
# OWNED_PATHS — the canonical harness-infra surface autopilot mutates. The §1 MAIN
# clean-state check and every restore site (§5/§6/§7) scope to this list, so a stray
# foreign edit OUTSIDE it neither blocks a run nor gets clobbered by the restore.
# NOTE: OWNED_PATHS is a native shell ARRAY, expanded everywhere as "${OWNED_PATHS[@]}"
# so it word-splits into 10 separate pathspec arguments under BOTH bash and zsh. Two
# hazards this avoids: a QUOTED string ("$OWNED_PATHS") collapses to ONE pathspec under
# bash AND zsh, and a BARE string ($OWNED_PATHS) ALSO collapses under zsh (no
# SH_WORD_SPLIT by default) — either way the clean check matches nothing and is
# vacuously satisfied. The array form "${OWNED_PATHS[@]}" expands correctly in both.
# Write-surface cross-check (known-complete): every tracked path autopilot writes in
# §2–§7 is within OWNED_PATHS — tasks/, evals/, memory/, CHANGELOG.md, and .claude/ are
# the autopilot-written tracked dirs, all in the set — else it is committed by the
# selected executor on the feature branch or lives under /tmp. No autopilot write lands outside this surface.
OWNED_PATHS=(.claude/ context/ docs/ scripts/ crons/ wiki/ evals/ memory/ tasks/ CHANGELOG.md)

# Self-heal a clean-but-stranded branch from a prior interrupted run (nothing to lose):
# a crash before §5/§6/§7 can leave HEAD on a clean feature branch; recover it rather
# than FAIL every hour. A *dirty* tree is NOT auto-cleaned here (it may be human WIP).
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "development" ] && git diff --quiet && git diff --cached --quiet; then
  git checkout -f development && BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi
# NOTE: the self-heal (above) and this MAIN check are now DIFFERENT predicates. The
# self-heal force-checks-out only when the WHOLE tree is clean (tree-wide git diff
# --quiet), so it can never fire while foreign WIP is present — therefore it never
# destroys foreign WIP. This MAIN check is scoped to ${OWNED_PATHS[@]} (array form), so
# a stray edit OUTSIDE the owned surface leaves it clean and the run proceeds; only a
# dirty OWNED path blocks. (Repro: stage an unrelated `.codex/config.toml` edit — the
# MAIN check below evaluates clean and does NOT take the exit-1 branch.)
# Dirty OWNED surface → skip non-destructively with a DISTINCT liveness token
# (BLOCKED-OWNED-WIP, not bare FAIL) so a heartbeat watcher reads a real owned-WIP
# stall as a stall, not idleness. The .cron.log append is guarded (2>/dev/null || true)
# so a missing/unwritable log never crashes the skill — same convention as § Guidelines
# "Liveness on every path". A stray edit OUTSIDE ${OWNED_PATHS[@]} never reaches here (US-002).
if ! { git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}"; }; then
  printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "BLOCKED-OWNED-WIP" >> crons/.cron.log 2>/dev/null || true
  echo "BLOCKED-OWNED-WIP: dirty owned surface — run skipped (foreign WIP left untouched)"
  exit 1
fi
[ "$BRANCH" = "development" ] || { echo "ERROR: not on development (on $BRANCH)"; exit 1; }
```

If the OWNED surface is dirty, log `Result: BLOCKED-OWNED-WIP` + `Observation: dirty owned surface; run skipped until it is clean (foreign WIP untouched)` and exit 1 without touching GitHub — the distinct token (not bare `FAIL`) keeps a genuine owned-WIP stall visible to the heartbeat rather than looking idle. If instead HEAD is not on `development`, log `Result: FAIL` + `Observation: wrong branch` and exit 1.

**Sync with origin** (mandatory — a stale `development` base means dedupe misses fresh merges and the run branches off old code):

```bash
git fetch origin development
git merge --ff-only origin/development || { echo "ERROR: development diverged from origin"; exit 1; }
```

If the fast-forward fails, log `Result: FAIL` + `Observation: development diverged from origin/development; manual reconcile needed` and exit 1 without touching GitHub.

**Capture the tmux session context** (set by the cron runtime when `tmux: true`; EMPTY when invoked manually — every tmux step below must no-op when empty):

```bash
SESSION="${CRON_TMUX_SESSION:-}"    # e.g. cron-autopilot-0610-1805, or empty
KEEP="${CRON_KEEP_MARKER:-}"        # e.g. /tmp/cron-autopilot-0610-1805.keep, or empty
EXECUTOR="${AUTOPILOT_EXECUTOR:-delegate-advisor}"
# CLI flag wins over env: /autopilot --executor=ralph
case "${ARGUMENTS:-}" in
  *--executor=ralph*) EXECUTOR=ralph ;;
  *--executor=delegate-advisor*) EXECUTOR=delegate-advisor ;;
esac
case "$EXECUTOR" in delegate-advisor|ralph) ;; *) echo "ERROR: invalid AUTOPILOT_EXECUTOR=$EXECUTOR"; exit 1 ;; esac
echo "autopilot executor: $EXECUTOR"

safe_branch_session() { printf '%s' "autopilot-$1" | tr '/:' '--' | tr '[:space:]' '-' | tr -cd 'A-Za-z0-9_.=-'; }
cleanup_active_marker() { [ -n "${ACTIVE_MARKER:-}" ] && rm -f "$ACTIVE_MARKER"; }
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
  Compute the expected work branch and dedupe before launching work:
  ```bash
  BRANCH="feat/$ISSUE_NUM-$SLUG"
  SAFE_SESSION=$(safe_branch_session "$BRANCH")   # autopilot-feat-123-slug
  ACTIVE_MARKER="/tmp/$SAFE_SESSION.active"
  LINKED_PR=$(gh pr list --state open --head "$BRANCH" --json number --jq '.[0].number // empty')
  LINKED_ISSUE_PR=$(gh issue list --state open --label autopilot --search "$ISSUE_NUM linked:pr" --json number --jq '.[0].number // empty')
  if tmux has-session -t "$SAFE_SESSION" 2>/dev/null || [ -n "$LINKED_PR" ] || [ -n "$LINKED_ISSUE_PR" ] || [ -e "$ACTIVE_MARKER" ]; then
    echo "DEDUPE: issue #$ISSUE_NUM / $SLUG already active (session=$SAFE_SESSION pr=$LINKED_PR linked_issue_pr=$LINKED_ISSUE_PR marker=$ACTIVE_MARKER); skipping"
    # memory log Result: NOTHING-NEW, liveness NOTHING-NEW, exit 0; do not touch keep-marker.
    exit 0
  fi
  [ -n "$SESSION" ] && tmux rename-session -t "$SESSION" "$SAFE_SESSION" && SESSION="$SAFE_SESSION"
  touch "$ACTIVE_MARKER"
  ```
  Leave `$KEEP` unchanged — the keep-marker path is fixed at spawn time and the session wrapper checks that original path.
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
4. **Top survivor** → write a body to `/tmp/autopilot-research-$$.md` containing (a) the finding, (b) the first-principles rationale, (c) a 3–7-bullet plan sketch. If `--dry-run` is set, print the would-file finding in the dry-run block below and exit before any `gh issue create` mutation. Otherwise file the ticket from the plan:
   ```bash
   gh issue create --label autopilot --title "feat: <finding>" --body-file /tmp/autopilot-research-$$.md
   ```
   Capture `ISSUE_NUM`; derive `SLUG` from the title. Set:
   ```
   SELECTION_MODE=research
   SELECTION_RATIONALE="Research selection: queue was empty; /harness-audit ranked this finding #1 by impact among harness-infra candidates. First-principles rationale: <reasoning>. Filed as #$ISSUE_NUM."
   ```
   Run the same `BRANCH` / `SAFE_SESSION` / `ACTIVE_MARKER` duplicate guard and session rename block described above. Then **implement it this same run** (§3 onward).

**`--dry-run` exit** — print:

```
[dry-run] mode: $SELECTION_MODE
[dry-run] selected: #$ISSUE_NUM ($SLUG)        # research path: "would file + build: <finding>"
[dry-run] executor: $EXECUTOR
[dry-run] open autopilot PRs created today: $OPEN_TODAY (cap 6); total open: $TOTAL_OPEN (ceiling 10)
[dry-run] exiting without calling /ship-spec, /delegate, or scripts/ralph.sh
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

**Start here**: the ticket body (`gh issue view $ISSUE_NUM`), memory/MEMORY.md (recent context).

**Out of scope**: PRD JSON generation, branch creation, git operations.
```

Capture the pm output as `PM_DESC` (the first sentence) and `PM_PLAN` (the rest). This PM/advisor plan is constructed **before** the implementation goal is started and becomes the input to the goal prompt.

In `delegate-advisor` mode, set the active goal with this exact phrase (preserve it verbatim for observability and eval coverage):

```text
/goal Audit plan /w @"pm (agent)" using ultrathink, then /ship-spec and execute prd.json as an expert Advisor to orchestrate /delegate
```

Include `ISSUE_NUM`, `SLUG`, `BRANCH`, `SELECTION_RATIONALE`, `PM_DESC`, and `PM_PLAN` immediately under the goal prompt so the Advisor can audit the plan, call `/ship-spec`, then execute the generated JSON via `/delegate`.

### 4. /ship-spec --issue

In `delegate-advisor` mode the active `/goal` drives this step from the PM plan. Run `/ship-spec` against the existing ticket (the `--issue` flag links it instead of opening a duplicate):

```
/ship-spec "$PM_DESC" --plan <PM_PLAN content> --prefix feat --issue $ISSUE_NUM
```

`/ship-spec` runs `/prd` → 2 critics → (skips issue creation, reuses #$ISSUE_NUM) → `/ralph` (JSON generation only) → branch `feat/$ISSUE_NUM-$SLUG` → **draft** PR with `tasks/$SLUG/prd.json`. **Capture `PR_NUM` and the actual `BRANCH`.** After the branch exists, ensure the cron tmux session is named `$(safe_branch_session "$BRANCH")` (for example `autopilot-feat-123-slug`) and keep `ACTIVE_MARKER=/tmp/$(safe_branch_session "$BRANCH").active` until the run is finalized or left for manual continuation.

**Critic HALT handling** — if `/ship-spec` emits `HALT` (critic gate rejected the spec):
- Comment the verdict on the ticket and block it so it can't retry-loop hourly:
  ```bash
  gh issue comment "$ISSUE_NUM" --body "autopilot: /ship-spec critic gate rejected the spec. Verdict: <summary>. Labeled autopilot-blocked; remove the label to retry."
  gh issue edit "$ISSUE_NUM" --add-label autopilot-blocked
  cleanup_active_marker
  ```
- Memory log `Result: HALT-CRITIC-GATE`, liveness `HALT-CRITIC-GATE`, exit 0 (no PR → no keep-marker and no active-marker).

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

### 5. Implement — executor

`/ship-spec` (§4) scaffolds `tasks/$SLUG/prd.json` plus the task prompt/progress files. Dispatch by executor:

#### `delegate-advisor` (default)

Use the cron-created Pi tmux session as the expert Advisor runtime. Do **not** spawn a second advisor tmux session and do **not** call `scripts/ralph.sh` in this mode. The Advisor must execute the JSON through `/delegate` only after a manual compaction boundary:

1. Verify `tasks/$SLUG/prd.json` exists and commit any `/ship-spec` scaffold changes already staged by that skill.
2. Run Pi `/compact` before Advisor executes the JSON. This is mandatory; do not call `/delegate` until `/compact` completes. Use this compaction prompt:

   ```text
   Preserve autopilot Advisor handoff context: issue #$ISSUE_NUM, slug $SLUG, branch $BRANCH, PR #$PR_NUM, selection rationale, PM plan, /ship-spec critique summary, tasks/$SLUG/prd.json path and contents, executor=$EXECUTOR, and finalization requirements (/eval, CI, PR-ready or draft-with-comment, no auto-merge, restore development, leave autopilot-<branch> tmux session alive).
   ```

3. As the expert Advisor, audit `tasks/$SLUG/prd.json`, decompose it into safe waves, and orchestrate execution with `/delegate`. The invocation contract is:

   ```text
   /delegate --plan tasks/$SLUG/prd.json
   ```

   Use `general-purpose` (or an equivalent write-capable worker) for implementation tasks; keep `pm`/`critic` read-only review workers where appropriate. The Advisor remains in the foreground Pi session and coordinates until all acceptance criteria in `prd.json` pass or a blocker is identified.

4. On success, ensure the implementation is committed on `BRANCH` with a `Submitted-by:` trailer tied to the active submitter, then proceed to §6.

**Delegate-advisor failure compensation** — if `/delegate --plan tasks/$SLUG/prd.json` fails, stalls unrecoverably, or leaves acceptance criteria incomplete:
```bash
gh pr comment "$PR_NUM" --body "autopilot: delegate-advisor executor did not complete tasks/$SLUG/prd.json. PR left draft; attach to tmux session $SESSION and continue with \`/delegate --plan tasks/$SLUG/prd.json\`. Status: DELEGATE-FAIL."
```
- Memory log `Result: DELEGATE-FAIL`, liveness `DELEGATE-FAIL`, **persist the session** (`[ -n "$KEEP" ] && touch "$KEEP"`), leave `ACTIVE_MARKER` in place for duplicate suppression, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit 1 (non-destructive — never auto-close the issue or PR).

#### `ralph` fallback

When `EXECUTOR=ralph` (from `--executor=ralph` or `AUTOPILOT_EXECUTOR=ralph`), keep the prior resumable runner path. The main checkout is already on `feat/$ISSUE_NUM-$SLUG` (§4) and has `node_modules`, so launch the loop here — it runs in its own tmux session named `$SLUG`, committing one story per iteration to the branch:

```bash
scripts/ralph.sh "$SLUG"
```

Then **bash-poll** `tasks/$SLUG/progress.txt` for the terminal sentinel. Each round is bounded under the Bash tool ceiling; **re-run the round** until it reports `RALPH: DONE` or `RALPH: SESSION-GONE`, up to ~8 rounds (~64 min wall-clock):

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
- Memory log `Result: RALPH-INCOMPLETE`, liveness `RALPH-INCOMPLETE`, **persist the session** (`[ -n "$KEEP" ] && touch "$KEEP"`), leave `ACTIVE_MARKER` in place for duplicate suppression, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit 1 (non-destructive — never auto-close the issue or PR).

### 6. Eval gate

After the selected executor completes (§5), **while still on the work branch**, run the probe suite:

```
/eval
```

- If `/eval` updates `evals/RESULTS.md`, commit it on the branch:
  ```bash
  git add evals/RESULTS.md && git commit -m "$(printf 'task: refresh evals benchmark\n\nSubmitted-by: %s\n' "${RALPH_HARNESS:-Claude}")" || true
  ```

**Decision rule** — key on the runner's exit code and the green→red **delta**, NOT on the bare presence of a `REGRESSION` row in `evals/RESULTS.md`. A probe that was already red on the base (`origin/development`) is **pre-existing** — this PR did not cause it, so it must not block. **PROCEED** to §7 when BOTH of these hold:

1. the `/eval` runner exited `0`, AND
2. every regressed probe's delta is `unchanged` vs the base (already-red — NOT a NEW green→red transition).

**Keep the PR draft** (status `PR-DRAFT-EVAL-RED`) only on a **NEW (green→red) regression OR a non-zero runner exit**:
  ```bash
  gh pr comment "$PR_NUM" --body "autopilot: /eval reported a NEW (green→red) probe regression (<probe ids>) or a non-zero runner exit. PR left draft; resolve before marking ready."
  ```
  Memory log `Result: PR-DRAFT-EVAL-RED`, liveness `PR-DRAFT-EVAL-RED`, then `[ -n "$KEEP" ] && touch "$KEEP"`, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit.

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

**Clean the active marker on finalized PR paths**: after §7 creates or updates the PR state (`PR-READY`, `PR-DRAFT-CI-RED`, or `PR-DRAFT-EVAL-RED`), run `cleanup_active_marker`. The open PR and persisted `autopilot-<branch>` session are now the duplicate guards; leaving `/tmp/$SAFE_SESSION.active` behind would permanently suppress a future run after the PR/session is closed. Keep `ACTIVE_MARKER` only on incomplete executor paths (`DELEGATE-FAIL`, `RALPH-INCOMPLETE`) where manual continuation is expected.

**Restore branch** (mandatory — the next cron fire's §1 branch guard only passes on `development`). Canonical **scoped restore** — a non-destructive two-step that discards only this run's own OWNED-path residue, then switches HEAD. Committed work is safe on the branch / draft PR. The scope step MUST precede the branch switch (it clears owned residue that would otherwise make a non-forced `git checkout development` refuse). It touches only **tracked** files, so an untracked owned-path orphan from a mid-run crash is NOT auto-removed (`git clean` is deliberately NOT used — too destructive across `tasks/`, `memory/`, `.claude/`); clean such orphans manually. Any **foreign** change OUTSIDE the owned surface — modified or staged (e.g. `.codex/config.toml`) — survives byte-for-byte (left in place / left staged) and is ignored by the scoped assertion and the next §1 check:
```bash
git checkout development -- "${OWNED_PATHS[@]}"   # 1. discard own owned-path residue (tracked only; array form word-splits under bash+zsh)
git checkout development                    # 2. switch HEAD (residue cleared above → non-forced switch succeeds; foreign WIP unaffected)
git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || { echo "ERROR: autopilot restore did not land on development"; exit 1; }
```

### 8. Memory Log

Append to `memory/<today>/log.md` on **every** exit path (skips, halts, errors included):

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "memory/$TODAY"
cat >> "memory/$TODAY/log.md" <<EOF

## Autopilot -- $TIME UTC
- **Result**: <SKIPPED-CAP-TOTAL | SKIPPED-CAP-DAILY | NOTHING-NEW | PR-READY | PR-DRAFT-CI-RED | PR-DRAFT-EVAL-RED | HALT-CRITIC-GATE | RALPH-INCOMPLETE | DELEGATE-FAIL | BLOCKED-OWNED-WIP | FAIL>
- **Executor**: <delegate-advisor | ralph>
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
- **Implementation executor**: default `delegate-advisor` (`AUTOPILOT_EXECUTOR` unset) keeps the cron-created Pi tmux session as the Advisor runtime, runs the exact `/goal Audit plan /w @"pm (agent)" using ultrathink, then /ship-spec and execute prd.json as an expert Advisor to orchestrate /delegate` prompt, requires `/compact` before `/delegate --plan tasks/$SLUG/prd.json`, and leaves `autopilot-<branch>` alive. `ralph` mode is an explicit fallback via `--executor=ralph` or `AUTOPILOT_EXECUTOR=ralph` and launches `scripts/ralph.sh "$SLUG"`.
- **Non-destructive failure**: never auto-close issues or PRs. On failure, comment + log. Human inspection is the recovery path.
- **autopilot-blocked**: a critic HALT labels the ticket `autopilot-blocked`, excluding it from the queue query until a human removes the label — a bad ticket can't retry-loop hourly.
- **Idempotent labels**: the `gh label create … 2>/dev/null || true` pattern is safe to run every pulse.
- **Liveness on every path**: every exit appends `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "<TOKEN>" >> crons/.cron.log` — skip, halt, error, success. A missing liveness line looks like a crash.
- **Session lifecycle**: persist the per-run tmux session (`[ -n "$KEEP" ] && touch "$KEEP"`) iff the run produced a PR (`PR-READY`, `PR-DRAFT-CI-RED`, `PR-DRAFT-EVAL-RED`, `RALPH-INCOMPLETE`, `DELEGATE-FAIL`). In delegate-advisor mode, the persisted session name is `autopilot-<branch>` (sanitized, e.g. `autopilot-feat-123-slug`) and is intentionally left alive for manual attach/continue/reap; no separate advisor session is created. No-PR paths never touch the keep-marker, so their sessions auto-close. The `[ -n "$KEEP" ]` guard means manual runs (no tmux) are unaffected.
- **Branch restore (canonical scoped restore)**: every path that changed the working branch (all paths reaching §4+) must run the two-step `git checkout development -- "${OWNED_PATHS[@]}"` (discard own owned-path residue — tracked staged AND unstaged) THEN `git checkout development` (switch HEAD), then assert BOTH `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` AND `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`. The scope step MUST precede the switch (it clears owned residue that a non-forced `git checkout development` would otherwise refuse to overwrite). It discards only the run's own owned-path residue (committed work is preserved on the feature branch / draft PR); it touches only tracked files, so an untracked owned-path orphan from a mid-run crash is cleaned manually (`git clean` is deliberately NOT used); and any foreign change OUTSIDE the owned surface survives byte-for-byte (left in place / left staged), ignored by the scoped assertion and the next §1 check. The owned-scoped assertion mirrors the §1 owned check, so "assertion passes" ≡ "the next fire's §1 guard will pass". §1 additionally self-heals a *clean*-but-stranded branch (its forced tree-wide checkout is the only remaining `-f` form); a *dirty* owned tree at §1 still blocks (BLOCKED-OWNED-WIP) to protect any owned WIP.

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
| `RALPH-INCOMPLETE` | §5 Ralph fallback loop did not reach `STATUS: COMPLETE` (timeout, loop died, or all harnesses exhausted) after `/ship-spec` opened a PR; PR left draft — `tasks/$SLUG/` state is resumable via `scripts/ralph.sh $SLUG` |
| `DELEGATE-FAIL` | the default delegate-advisor executor failed or stalled while executing `tasks/$SLUG/prd.json` via `/delegate`; PR left draft and `autopilot-<branch>` session is left alive for manual continuation |
| `SKIPPED_OVERLAP` | Emitted by the cron runtime (not this skill): a previous fire of this id was still running with `overlap: false` |
| `BLOCKED-OWNED-WIP` | §1 found the OWNED surface (`${OWNED_PATHS[@]}`) dirty; run skipped until the owned surface is clean — non-destructive to foreign WIP (a stray edit outside the owned set proceeds normally) |
| `FAIL` | Pre-flight failure (wrong branch, diverged `development`) before any PR |

### Key paths

| Path | Purpose |
|------|---------|
| `crons/autopilot.md` | Cron definition (`tmux: true`) that fires this skill hourly |
| `crons/.cron.log` | Append-only liveness log read by the cron runtime |
| `memory/<today>/log.md` | Daily session log; autopilot appends an entry each run |
| `.claude/agents/pm.md` | pm agent definition (invoked via `Agent subagent_type: pm`) |
| `$CRON_TMUX_SESSION` / `$CRON_KEEP_MARKER` | Per-run tmux session name + keep-marker path, set by the cron runtime (empty on manual runs); delegate-advisor renames the session to `autopilot-<branch>` after branch discovery |
| `AUTOPILOT_EXECUTOR` | Optional executor toggle: `delegate-advisor` (default) or `ralph` fallback |
