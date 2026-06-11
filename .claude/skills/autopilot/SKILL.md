---
name: autopilot
description: |
  Self-improvement loop: each hourly run implements the oldest open issue
  labeled `autopilot` that has no open PR. When the queue is empty it runs
  first-principles `/harness-audit` research, files its own `autopilot`
  ticket from the top-ranked finding, and builds that. Decomposes via the pm
  agent, scaffolds against the ticket with `/ship-spec --issue`, executes
  in-process with `/delegate`, runs an `/eval` regression gate, and finalizes
  a ready-for-review PR whose description states why this item was selected.
  Harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox
  application code. Runs in its own per-run tmux session. Caps: 6 open
  autopilot PRs created per UTC day AND 10 total open; never auto-merges.
  TRIGGER when: the hourly crons/autopilot.md fires, or invoked manually on
  demand (e.g. /autopilot --dry-run to preview the next selection).
argument-hint: "[--dry-run]"
---

# Autopilot

Unattended self-improvement loop for the harness. Each run picks one harness-infra item from the GitHub `autopilot` issue queue (or researches and files one when the queue is empty), builds it end-to-end through `pm decompose → /ship-spec --issue → /delegate → /eval`, and lands a ready-for-review PR whose description opens with **why this item was selected this session**. Scope is strictly **harness-infra only** (skills/rules/docs/scripts/crons/wiki) — never sandbox application code, never auto-merge.

When fired by the hourly cron, the run lives in its own detached tmux session (`tmux: true` in `crons/autopilot.md`); **iff** the run produced a PR the session persists and resumes the run's own conversation as a live agent you can `tmux attach` and drive — attach and proceed if a run needs a judgment call (see § Session lifecycle).

`--dry-run` prints the selection decision (queue ticket or research finding) plus the open-PR counts, then exits without calling `/ship-spec` or `/delegate` and without touching git or GitHub.

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
git diff --quiet && git diff --cached --quiet || { echo "ERROR: dirty working tree"; exit 1; }
BRANCH=$(git rev-parse --abbrev-ref HEAD)
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
- **Queue non-empty but every open ticket already has an open PR** (nothing actionable) → memory log `Result: IN-FLIGHT`, liveness `IN-FLIGHT`, exit 0 (awaiting review; no PR produced → no keep-marker → session auto-closes).

**Queue empty → research** (first-principles pass):

1. Run `/harness-audit`. Rank its harness-infra findings by impact.
2. Dedupe each finding (in rank order) against open issues, open PRs, **and merged PRs** — advance past any hit (a blocked candidate must never end the run while others remain):
   ```bash
   DUPE_OPEN_ISSUE=$(gh issue list --state open --json title --jq '.[].title' | grep -i "$SLUG" || true)
   DUPE_OPEN_PR=$(gh pr list --state open --json title,headRefName --jq '.[] | "\(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   DUPE_MERGED_PR=$(gh pr list --state merged --limit 50 --json number,title,headRefName --jq '.[] | "\(.number) \(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   ```
3. **No survivor** → memory log `Result: NOTHING-NEW`, liveness `NOTHING-NEW`, exit 0 (no keep-marker). Research fires only when the queue has drained (a merge auto-closes its ticket via `Closes #N`); worst case an hourly audit yields `NOTHING-NEW` repeatedly — accepted cost.
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
[dry-run] exiting without calling /ship-spec or /delegate
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

### 5. /delegate

Run `/delegate` to execute the prd.json stories **in-process**:

```
/delegate --plan tasks/$SLUG/prd.json
```

**Critical**: do NOT use `run_in_background` for autopilot delegate waves. Await all workers before §6. Rationale: `overlap: false` in `crons/autopilot.md` guards on the foreground process exiting; backgrounded workers would let the next hourly fire overlap, creating concurrent commits on the same branch.

**Delegate failure compensation** — if `/delegate` errors or exits non-zero:
- `gh pr comment "$PR_NUM" --body "autopilot aborted mid-run: /delegate failed. PR left as draft for manual inspection. Status: DELEGATE-FAIL."`
- Memory log `Result: DELEGATE-FAIL`, liveness `DELEGATE-FAIL`.
- **Persist the session** (a PR exists): `[ -n "$KEEP" ] && touch "$KEEP"`.
- Restore branch: `git checkout development`.
- Exit 1 (non-destructive — never auto-close the issue or PR).

### 6. Eval gate

After `/delegate` completes, **while still on the work branch**, run the probe suite:

```
/eval
```

- If `/eval` updates `evals/RESULTS.md`, commit it on the branch:
  ```bash
  git add evals/RESULTS.md && git commit -m "task: refresh evals benchmark" || true
  ```
- **Any `REGRESSION`** → leave the PR draft, name the regressed probe(s) on the PR, persist the session, restore, and stop:
  ```bash
  gh pr comment "$PR_NUM" --body "autopilot: /eval reported a probe regression (<probe ids>). PR left draft; resolve before marking ready."
  ```
  Memory log `Result: PR-DRAFT-EVAL-RED`, liveness `PR-DRAFT-EVAL-RED`, then `[ -n "$KEEP" ] && touch "$KEEP"`, `git checkout development`, exit.
- **Green / SKIPPED-only** → proceed to §7.

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

**Restore branch** (mandatory — the next cron fire's §1 branch guard only passes on `development`):
```bash
git checkout development
```

### 8. Memory Log

Append to `memory/<today>/log.md` on **every** exit path (skips, halts, errors included):

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "memory/$TODAY"
cat >> "memory/$TODAY/log.md" <<EOF

## Autopilot -- $TIME UTC
- **Result**: <SKIPPED-CAP-TOTAL | SKIPPED-CAP-DAILY | IN-FLIGHT | NOTHING-NEW | PR-READY | PR-DRAFT-CI-RED | PR-DRAFT-EVAL-RED | HALT-CRITIC-GATE | DELEGATE-FAIL | FAIL>
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
- **In-process delegate only**: `/delegate` waves run synchronously. `run_in_background` is forbidden; `overlap: false` is the concurrency guard.
- **Non-destructive failure**: never auto-close issues or PRs. On failure, comment + log. Human inspection is the recovery path.
- **autopilot-blocked**: a critic HALT labels the ticket `autopilot-blocked`, excluding it from the queue query until a human removes the label — a bad ticket can't retry-loop hourly.
- **Idempotent labels**: the `gh label create … 2>/dev/null || true` pattern is safe to run every pulse.
- **Liveness on every path**: every exit appends `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "<TOKEN>" >> crons/.cron.log` — skip, halt, error, success. A missing liveness line looks like a crash.
- **Session lifecycle**: persist the per-run tmux session (`[ -n "$KEEP" ] && touch "$KEEP"`) iff the run produced a PR (`PR-READY`, `PR-DRAFT-CI-RED`, `PR-DRAFT-EVAL-RED`, `DELEGATE-FAIL`). No-PR paths never touch the keep-marker, so their sessions auto-close. The `[ -n "$KEEP" ]` guard means manual runs (no tmux) are unaffected.
- **Branch restore**: `git checkout development` must run on every path that changed the working branch (all paths reaching §4+).

## Reference

### Status tokens

| Token | Meaning |
|-------|---------|
| `SKIPPED-CAP-TOTAL` | ≥10 open autopilot PRs (any age); run skipped until one closes/merges |
| `SKIPPED-CAP-DAILY` | ≥6 autopilot PRs created this UTC day are still open; skipped until one closes/merges or the day rolls over |
| `IN-FLIGHT` | Queue non-empty but every open ticket already has an open PR; nothing actionable this pulse (awaiting review) |
| `NOTHING-NEW` | Queue empty and `/harness-audit` produced no finding that survives dedupe |
| `PR-READY` | End-to-end success; PR marked ready with green CI |
| `PR-DRAFT-CI-RED` | PR left draft because CI was red or `/ci-status` timed out |
| `PR-DRAFT-EVAL-RED` | PR left draft because `/eval` reported a probe regression |
| `HALT-CRITIC-GATE` | `/ship-spec` critic gate rejected the spec; ticket labeled `autopilot-blocked`, no PR opened |
| `DELEGATE-FAIL` | `/delegate` failed after `/ship-spec` opened a PR; PR left draft |
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
