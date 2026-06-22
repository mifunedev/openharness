---
name: autopilot
description: |
  Self-improvement loop: each hourly run implements the oldest open issue
  labeled `autopilot` that has no open PR. When the queue is empty it runs
  first-principles `/harness-audit` research, files its own `autopilot`
  ticket from the top-ranked finding, and builds that. Decomposes via the pm
  agent, then runs `/ship-spec --issue`, which owns the build end-to-end
  (the two compacts bracketing implement, a worktree Advisor, `/delegate`
  workers running `scripts/ralph.sh`, the `/eval` gate, and the `/pr-audit`
  promotable undraft) through to a ready-for-review PR whose description
  states why this item was selected.
  Harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox
  application code. Runs in its own per-run tmux session. Caps: 6 open
  autopilot PRs created per UTC day AND 10 total open; never auto-merges.
  TRIGGER when: the hourly crons/autopilot.md fires, or invoked manually on
  demand (e.g. /autopilot --dry-run to preview the next selection).
argument-hint: "[--dry-run] [--executor=delegate-advisor|ralph] [--repo <owner/name>] [--remote <name>] [--base <branch>]"
---

# Autopilot

Unattended self-improvement loop for the harness. Each run picks one harness-infra item from the GitHub `autopilot` issue queue (or researches and files one when the queue is empty), builds it end-to-end through `pm decompose → /goal Advisor handoff → /ship-spec --issue`, and lands a ready-for-review PR whose description opens with **why this item was selected this session**. `/ship-spec` now owns the whole build pipeline (`/compact → worktree Advisor → /delegate + scripts/ralph.sh → /eval → /compact → /pr-audit undraft`); autopilot **defers** to it rather than re-running implement/eval/finalize. Scope is strictly **harness-infra only** (skills/rules/docs/scripts/crons/wiki) — never sandbox application code, never auto-merge.

Executor toggle: `--executor=delegate-advisor|ralph`, or `AUTOPILOT_EXECUTOR=delegate-advisor|ralph`. Default `delegate-advisor` **defers the whole build to `/ship-spec`** (which owns the worktree Advisor, the two compacts, `/delegate` + ralph workers, `/eval`, and the `/pr-audit` promotable undraft). Ralph remains a legacy inline fallback that drives `scripts/ralph.sh "$SLUG"` directly against the scaffolded task and finalizes inline (idempotent: a no-op if `/ship-spec` already reached `STATUS: COMPLETE`).

When fired by the hourly cron, the run lives in its own detached Pi tmux session (`tmux: true` in `crons/autopilot.md`). In `delegate-advisor` mode this same cron-created Pi session is the expert Advisor runtime; do **not** spawn a second advisor session. After the work branch is known, rename the tmux session to `autopilot-<branch>` with slashes sanitized, e.g. `autopilot-feat-123-slug`, so a human can attach and continue. Leave `autopilot-<branch>` sessions alive for manual attach/continue/reap after a PR exists (see § Session lifecycle).

`--dry-run` prints the selection decision (queue ticket or research finding), executor mode, dedupe state, and open-PR counts, then exits without calling `/ship-spec`, `/delegate`, or the Ralph runner and without touching git or GitHub.

**Default target repo:** future autopilot runs act on canonical upstream by default: `AUTOPILOT_REPO=mifunedev/openharness`, `AUTOPILOT_BASE=development`, and `AUTOPILOT_REMOTE` resolved from the local remote URL that matches that repo (`upstream` in this checkout, normally `origin` in fresh installs). Do not let implicit `gh` repo resolution or `git push origin` send autopilot issues/PRs to a fork. Operators can override with `--repo`, `--remote`, `--base`, or the matching `AUTOPILOT_*` env vars.

## Instructions

### 1. Guardrails

Order matters — cheapest exits first.

**Ensure the GitHub labels exist** (idempotent — safe every pulse):

```bash
AUTOPILOT_REPO="${AUTOPILOT_REPO:-mifunedev/openharness}"
AUTOPILOT_BASE="${AUTOPILOT_BASE:-development}"
case "${ARGUMENTS:-}" in *--repo*) AUTOPILOT_REPO=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--repo[ =]\([^ ]*\).*/\1/p') ;; esac
case "${ARGUMENTS:-}" in *--base*) AUTOPILOT_BASE=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--base[ =]\([^ ]*\).*/\1/p') ;; esac
resolve_autopilot_remote() {
  git remote -v | awk -v repo="$AUTOPILOT_REPO" '
    BEGIN { want=tolower(repo) }
    $3 == "(fetch)" {
      url=$2
      sub(/\.git$/, "", url)
      sub(/^.*github.com[:\/]/, "", url)
      if (tolower(url) == want) { print $1; exit }
    }'
}
case "${ARGUMENTS:-}" in *--remote*) AUTOPILOT_REMOTE=$(printf '%s\n' "$ARGUMENTS" | sed -n 's/.*--remote[ =]\([^ ]*\).*/\1/p') ;; esac
AUTOPILOT_REMOTE="${AUTOPILOT_REMOTE:-$(resolve_autopilot_remote)}"
[ -n "$AUTOPILOT_REMOTE" ] || { echo "ERROR: no local git remote for $AUTOPILOT_REPO"; close_no_pr_session 2>/dev/null || true; exit 1; }
echo "autopilot target: repo=$AUTOPILOT_REPO remote=$AUTOPILOT_REMOTE base=$AUTOPILOT_BASE"
gh label create autopilot --repo "$AUTOPILOT_REPO" --color 6E40C9 --description "Opened by the autopilot loop" 2>/dev/null || true
gh label create autopilot-blocked --repo "$AUTOPILOT_REPO" --color B60205 --description "Autopilot ticket blocked by a critic gate; remove to retry" 2>/dev/null || true
```

**Capture no-PR session context early** (needed before cap/clean-state skips; re-used later by the full session block):

```bash
SESSION="${CRON_TMUX_SESSION:-${SESSION:-}}"
KEEP="${CRON_KEEP_MARKER:-${KEEP:-}}"
OVERLAP_PIDFILE="${CRON_OVERLAP_PIDFILE:-${OVERLAP_PIDFILE:-}}"
[ -z "$OVERLAP_PIDFILE" ] && [ -n "$SESSION" ] && OVERLAP_PIDFILE="/tmp/cron-autopilot.pid"
release_overlap_lock() { [ -n "${OVERLAP_PIDFILE:-}" ] && rm -f "$OVERLAP_PIDFILE"; }
close_no_pr_session() {
  # No-PR terminal paths have no useful manual continuation state. A kept PR
  # session creates $KEEP; if it exists, never close the session here.
  [ -n "${SESSION:-}" ] || return 0
  [ -n "${KEEP:-}" ] && [ -f "$KEEP" ] && return 0
  release_overlap_lock
  ( sleep 1; tmux kill-session -t "$SESSION" 2>/dev/null || true ) >/dev/null 2>&1 &
}
```

**Caps (deterministic pre-gate + in-session recheck).** The two autopilot PR caps — **10** total open at any time AND **6** created per UTC day still open (a same-day close/merge frees a slot) — are enforced **before this skill runs** by the cron's `preflight: .mifune/skills/autopilot/autopilot-caps.sh` gate (see `crons/autopilot.md`). Both defaults are configurable in `harness.yaml` (`autopilot.total_cap` / `autopilot.daily_cap`, read live each fire; an `AUTOPILOT_TOTAL_CAP` / `AUTOPILOT_DAILY_CAP` env var still overrides). On a capped hour that gate writes the `SKIPPED-CAP-*` memory + liveness logs and the cron runtime spawns **no session at all** (`SKIPPED_PREFLIGHT`) — so reaching §1 means there was cap headroom at fire time.

`.mifune/skills/autopilot/autopilot-caps.sh` is the **canonical** cap implementation — the cap math plus the byte-faithful `SKIPPED-CAP-TOTAL` / `SKIPPED-CAP-DAILY` memory-block + liveness logging. Re-run it here as defense-in-depth for a long run that crosses a cap mid-flight, and defer to its verdict rather than re-deriving the counts:

```bash
# Canonical caps gate (single source of truth for the cap math + skip logging):
#   exit 11 → SKIPPED-CAP-TOTAL (≥10 open)  ·  exit 10 → SKIPPED-CAP-DAILY (≥6 today)
#   exit 0  → PROCEED (stdout: PROCEED total=…/… today=…/…)
# On a non-zero exit the gate has ALREADY written the memory log + liveness line.
# This is a no-PR terminal path: call close_no_pr_session after logging (when the
# session helper is available) so Pi TUI sessions do not linger without a keep-marker.
.mifune/skills/autopilot/autopilot-caps.sh || { close_no_pr_session 2>/dev/null || true; exit 0; }
```

For `--dry-run`, do **not** let the gate write skip logs or exit the run: invoke it read-only with the caps raised so it always PROCEEDs and only emits its count line — `AUTOPILOT_TOTAL_CAP=999999 AUTOPILOT_DAILY_CAP=999999 .mifune/skills/autopilot/autopilot-caps.sh` prints `PROCEED total=<n>/… today=<n>/…` (both open-PR counts) without mutating anything.

If `--dry-run`: print both counts now (the selection is printed after §2), then **continue** to §2 to determine the selection but exit before §4.

**Require clean state**:
```bash
# Runtime observability logs are shared state, not feature-branch source. In
# worktree-mode runs, resolve the root checkout and write memory/liveness logs there
# so heartbeat and humans can still inspect them after the ephemeral cron worktree is
# reaped. Source edits, branch commits, and restores stay inside $CRON_WORKTREE.
resolve_autopilot_log_root() {
  if [ -n "${AUTOPILOT_LOG_ROOT:-}" ]; then printf '%s\n' "$AUTOPILOT_LOG_ROOT"; return; fi
  if [ -n "${CRON_WORKTREE:-}" ]; then
    root=$(git -C "$CRON_WORKTREE" worktree list --porcelain 2>/dev/null | awk 'NR==1 && $1 == "worktree" { sub(/^worktree /, ""); print; exit }' || true)
    [ -z "$root" ] && root="${CRON_WORKTREE%%/.worktrees/cron/*}"
    if [ -n "$root" ] && git -C "$root" rev-parse --show-toplevel >/dev/null 2>&1; then
      git -C "$root" rev-parse --show-toplevel
      return
    fi
  fi
  git rev-parse --show-toplevel
}
AUTOPILOT_LOG_ROOT="$(resolve_autopilot_log_root)"
log_liveness() { mkdir -p "$AUTOPILOT_LOG_ROOT/crons"; printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "$1" | scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/crons/.cron.log" 2>/dev/null || true; }

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

# Isolated worktree mode (worktree:true cron — the DEFAULT for autopilot): the cron
# runtime fired this run inside a fresh detached worktree ($CRON_WORKTREE) cut from the
# base tip, so the shared root checkout is NEVER touched for source/branch work (runtime logs route there later via AUTOPILOT_LOG_ROOT). The root-clean guards below
# (self-heal, owned-dirty BLOCKED-OWNED-WIP, must-be-on-development) exist only to
# protect the SHARED root from cross-run contamination; an isolated worktree is always
# clean, so they are skipped here. The §7 restore is likewise skipped (the worktree is
# ephemeral — the runtime/heartbeat removes it), and the §1 overlap lock is moot (a
# worktree run holds no id-scoped /tmp/cron-autopilot.pid). The Sync step below still
# runs in both modes, fast-forwarding the detached HEAD to the freshest origin tip.
if [ -n "${CRON_WORKTREE:-}" ]; then
  echo "autopilot: isolated worktree run at $CRON_WORKTREE (root source checkout untouched; §1 root guards + §7 restore skipped)"
else
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
    log_liveness "BLOCKED-OWNED-WIP"
    echo "BLOCKED-OWNED-WIP: dirty owned surface — run skipped (foreign WIP left untouched)"
    close_no_pr_session
    exit 1
  fi
  [ "$BRANCH" = "development" ] || { echo "ERROR: not on development (on $BRANCH)"; close_no_pr_session; exit 1; }
fi
```

If the OWNED surface is dirty (root mode only — a worktree run is always clean), log `Result: BLOCKED-OWNED-WIP` + `Observation: dirty owned surface; run skipped until it is clean (foreign WIP untouched)`, call `close_no_pr_session`, and exit 1 without touching GitHub — the distinct token (not bare `FAIL`) keeps a genuine owned-WIP stall visible to the heartbeat rather than looking idle. If instead HEAD is not on `development`, log `Result: FAIL` + `Observation: wrong branch`, call `close_no_pr_session`, and exit 1.

**Sync with target remote** (mandatory — a stale base means dedupe misses fresh merges and the run branches off old code):

```bash
git fetch "$AUTOPILOT_REMOTE" "$AUTOPILOT_BASE"
git merge --ff-only "$AUTOPILOT_REMOTE/$AUTOPILOT_BASE" || { echo "ERROR: $AUTOPILOT_BASE diverged from $AUTOPILOT_REMOTE"; close_no_pr_session; exit 1; }
```

If the fast-forward fails, log `Result: FAIL` + `Observation: $AUTOPILOT_BASE diverged from $AUTOPILOT_REMOTE/$AUTOPILOT_BASE; manual reconcile needed`, call `close_no_pr_session`, and exit 1 without touching GitHub.

**Capture the tmux session context** (set by the cron runtime when `tmux: true`; EMPTY when invoked manually — every tmux step below must no-op when empty):

```bash
SESSION="${CRON_TMUX_SESSION:-}"    # e.g. cron-autopilot-0610-1805, or empty
KEEP="${CRON_KEEP_MARKER:-}"        # e.g. /tmp/cron-autopilot-0610-1805.keep, or empty
OVERLAP_PIDFILE="${CRON_OVERLAP_PIDFILE:-}"  # e.g. /tmp/cron-autopilot.pid, or empty before runtime restart
# Backward-compatible fallback for an already-running pre-#126 cron runtime: it
# exports SESSION/KEEP but not CRON_OVERLAP_PIDFILE until the runtime restarts.
[ -z "$OVERLAP_PIDFILE" ] && [ -n "$SESSION" ] && OVERLAP_PIDFILE="/tmp/cron-autopilot.pid"
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
release_overlap_lock() { [ -n "${OVERLAP_PIDFILE:-}" ] && rm -f "$OVERLAP_PIDFILE"; }
```

### 2. Select — issue queue first, research only when empty

GitHub issues labeled `autopilot` ARE the work queue. There are no time throttles and no in-repo backlog — the user steers by filing `autopilot`-labeled issues.

**Queue check** — actionable = open, labeled `autopilot`, NOT labeled `autopilot-blocked`, and with **no open or merged PR reference**. Do **not** rely only on GitHub's `linked:pr` qualifier: PRs targeting `development` may carry `Closes #N` in their body while `closingIssuesReferences` / `linked:pr` stays empty until default-branch semantics apply, and merged `development` PRs may not auto-close issues when GitHub's default branch differs. Enumerate open and recent merged PRs once, then dedupe each candidate issue locally by linked metadata, head branch, title, and body text.

```bash
OPEN_PRS_JSON="/tmp/autopilot-open-prs-$$.json"
MERGED_PRS_JSON="/tmp/autopilot-merged-prs-$$.json"
QUEUE_JSON="/tmp/autopilot-queue-$$.json"
gh pr list --repo "$AUTOPILOT_REPO" --state open --limit 200 \
  --json number,title,headRefName,body,closingIssuesReferences > "$OPEN_PRS_JSON"
gh pr list --repo "$AUTOPILOT_REPO" --state merged --limit 200 \
  --json number,title,headRefName,body,closingIssuesReferences > "$MERGED_PRS_JSON"
gh issue list --repo "$AUTOPILOT_REPO" --state open --label autopilot \
  --search "-label:autopilot-blocked" \
  --json number,title,createdAt > "$QUEUE_JSON"

issue_pr_refs_in() {
  local issue="$1" pr_json="$2"
  jq -r --arg issue "$issue" --argjson issue_num "$issue" '
    def issue_re: "(^|[^0-9])" + $issue + "($|[^0-9])";
    .[]
    | select(
        ([.closingIssuesReferences[]?.number] | index($issue_num))
        or ((.headRefName // "") | test(issue_re))
        or ((.title // "") | test("#" + $issue + "|issue[[:space:]]*" + $issue; "i"))
        or ((.body // "") | test("#" + $issue + "|close[sd]?[[:space:]]+#" + $issue + "|fix(e[sd])?[[:space:]]+#" + $issue + "|resolve[sd]?[[:space:]]+#" + $issue; "i"))
      )
    | "#\(.number) \(.headRefName) \(.title)"
  ' "$pr_json"
}

issue_open_pr_refs() { issue_pr_refs_in "$1" "$OPEN_PRS_JSON"; }
issue_merged_pr_refs() { issue_pr_refs_in "$1" "$MERGED_PRS_JSON"; }

ISSUE_NUM=""; TITLE=""; CREATED=""; DEDUPE_STATE="none"
while IFS= read -r row; do
  n=$(jq -r .number <<<"$row")
  refs=$(issue_open_pr_refs "$n" || true)
  if [ -n "$refs" ]; then
    DEDUPE_STATE="${DEDUPE_STATE}; issue #$n has open PR(s): $(printf '%s' "$refs" | paste -sd ', ' -)"
    echo "DEDUPE: issue #$n already has open PR reference(s): $refs"
    continue
  fi
  merged_refs=$(issue_merged_pr_refs "$n" || true)
  if [ -n "$merged_refs" ]; then
    DEDUPE_STATE="${DEDUPE_STATE}; issue #$n has merged PR(s): $(printf '%s' "$merged_refs" | paste -sd ', ' -)"
    echo "DEDUPE: issue #$n already has merged PR reference(s): $merged_refs"
    continue
  fi
  ISSUE_NUM="$n"
  TITLE=$(jq -r .title <<<"$row")
  CREATED=$(jq -r .createdAt <<<"$row")
  break
 done < <(jq -c 'sort_by(.createdAt)[]' "$QUEUE_JSON")
```

- **Oldest actionable issue wins** → when `ISSUE_NUM` is non-empty, derive `SLUG` from the title (kebab-case, ≤5 words). Set:
  ```
  SELECTION_MODE=queue
  SELECTION_RATIONALE="Queue selection: implementing open autopilot issue #$ISSUE_NUM (\"$TITLE\") — the oldest actionable ticket (filed $CREATED) with no open or merged PR reference after local PR dedupe."
  ```
  Compute the expected work branch and run a final launch dedupe before starting work:
  ```bash
  BRANCH="feat/$ISSUE_NUM-$SLUG"
  SAFE_SESSION=$(safe_branch_session "$BRANCH")   # autopilot-feat-123-slug
  ACTIVE_MARKER="/tmp/$SAFE_SESSION.active"
  LINKED_PR=$(gh pr list --repo "$AUTOPILOT_REPO" --state open --head "$BRANCH" --json number --jq '.[0].number // empty')
  LINKED_ISSUE_PR=$(issue_open_pr_refs "$ISSUE_NUM" || true)
  if tmux has-session -t "$SAFE_SESSION" 2>/dev/null || [ -n "$LINKED_PR" ] || [ -n "$LINKED_ISSUE_PR" ] || [ -e "$ACTIVE_MARKER" ]; then
    echo "DEDUPE: issue #$ISSUE_NUM / $SLUG already active (session=$SAFE_SESSION branch_pr=$LINKED_PR issue_pr_refs=$LINKED_ISSUE_PR marker=$ACTIVE_MARKER); skipping"
    # memory log Result: NOTHING-NEW, liveness NOTHING-NEW, close_no_pr_session, exit 0; do not touch keep-marker.
    close_no_pr_session
    exit 0
  fi
  [ -n "$SESSION" ] && tmux rename-session -t "$SESSION" "$SAFE_SESSION" && SESSION="$SAFE_SESSION"
  touch "$ACTIVE_MARKER"
  ```
  Leave `$KEEP` unchanged — the keep-marker path is fixed at spawn time and the session wrapper checks that original path.
- **No actionable item** — the queue is empty, OR every open `autopilot` ticket already has an open or merged PR — → **fall through to research** (below). A single in-flight PR MUST NOT starve the loop, and a completed-but-still-open ticket (common when a `development` PR carries `Closes #N` but the repo default branch differs) MUST NOT be rebuilt. The §1 caps (6 open created/day, 10 total) are the pile-up guard for fresh work. Those caps were already enforced above, so research here is cap-bounded by construction. Do **not** un-draft, finalize, or otherwise mutate a PR opened by a different run while idling on it — surface it (the heartbeat watches for stuck-green drafts) and proceed to research instead.

**No actionable queue item → research** (first-principles pass — fires whenever the queue is empty *or* every open ticket already has an open/merged PR):

1. Run `/harness-audit`. Rank its harness-infra findings by impact.
2. Dedupe each finding (in rank order) against open issues, open PRs, **and merged PRs** — advance past any hit (a blocked candidate must never end the run while others remain):
   ```bash
   DUPE_OPEN_ISSUE=$(gh issue list --repo "$AUTOPILOT_REPO" --state open --json title --jq '.[].title' | grep -i "$SLUG" || true)
   DUPE_OPEN_PR=$(gh pr list --repo "$AUTOPILOT_REPO" --state open --json title,headRefName --jq '.[] | "\(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   DUPE_MERGED_PR=$(gh pr list --repo "$AUTOPILOT_REPO" --state merged --limit 50 --json number,title,headRefName --jq '.[] | "\(.number) \(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
   ```
3. **No survivor** → memory log `Result: NOTHING-NEW`, liveness `NOTHING-NEW`, then `close_no_pr_session` and exit 0 (no keep-marker). Research fires whenever no actionable ticket exists — both when the queue is fully drained AND when open tickets are all awaiting review. Dedupe (against open issues, open PRs, and merged PRs) plus the §1 caps bound the output: an already-filed finding dedupes to `NOTHING-NEW`; worst case an hourly audit yields `NOTHING-NEW` repeatedly — accepted cost.
4. **Top survivor** → write a body to `/tmp/autopilot-research-$$.md` containing (a) the finding, (b) the first-principles rationale, (c) a 3–7-bullet plan sketch. If `--dry-run` is set, print the would-file finding in the dry-run block below and exit before any `gh issue create` mutation. Otherwise file the ticket from the plan:
   ```bash
   gh issue create --repo "$AUTOPILOT_REPO" --label autopilot --title "feat: <finding>" --body-file /tmp/autopilot-research-$$.md
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
[dry-run] dedupe: $DEDUPE_STATE
[dry-run] exiting without calling /ship-spec, /delegate, or scripts/ralph.sh
```

In `--dry-run`, the research path ranks findings but MUST NOT `gh issue create` — print the would-be finding instead. Then exit 0.

### 3. pm decompose

Invoke the `pm` agent via the `Agent` tool with `subagent_type: pm`. The input is the **ticket body** — identical for queue tickets (user- or prior-run-filed) and just-created research tickets:

```bash
gh issue view "$ISSUE_NUM" --repo "$AUTOPILOT_REPO" --json title,body --jq '"\(.title)\n\n\(.body)"'
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

**Start here**: the ticket body (`gh issue view $ISSUE_NUM --repo $AUTOPILOT_REPO`), memory/MEMORY.md (recent context).

**Out of scope**: PRD JSON generation, branch creation, git operations.
```

Capture the pm output as `PM_DESC` (the first sentence) and `PM_PLAN` (the rest). This PM/advisor plan is constructed **before** the implementation goal is started and becomes the input to the goal prompt.

In `delegate-advisor` mode, set the active goal with this exact phrase (preserve it verbatim for observability and eval coverage):

```text
/goal Audit plan /w @"pm (agent)" using ultrathink, then run /ship-spec --issue to build it end-to-end (worktree Advisor, /delegate + ralph, /eval, /pr-audit undraft) into a ready-for-review PR
```

Include `ISSUE_NUM`, `SLUG`, `BRANCH`, `AUTOPILOT_REPO`, `AUTOPILOT_REMOTE`, `AUTOPILOT_BASE`, `SELECTION_RATIONALE`, `PM_DESC`, and `PM_PLAN` immediately under the goal prompt so the Advisor can audit the plan and run `/ship-spec`, which now owns the rest of the build (compacts, the worktree Advisor + `/delegate` + ralph, `/eval`, and the `/pr-audit` undraft) — autopilot does not re-run those steps itself.

### 4. /ship-spec --issue (owns the full build)

In `delegate-advisor` mode the active `/goal` drives this step from the PM plan. Run `/ship-spec` against the existing ticket (the `--issue` flag links it instead of opening a duplicate):

```
/ship-spec "$PM_DESC" --plan <PM_PLAN content> --prefix feat --issue $ISSUE_NUM --repo "$AUTOPILOT_REPO" --remote "$AUTOPILOT_REMOTE" --base "$AUTOPILOT_BASE"
```

`/ship-spec` now runs the **entire pipeline**: `/prd` → 2 critics → (skips issue creation, reuses #$ISSUE_NUM) → `/ralph` (JSON) → branch `feat/$ISSUE_NUM-$SLUG` → draft PR → `/compact` (before implement) → the implement phase (in autopilot's default worktree mode, ship-spec detects `$CRON_WORKTREE` and builds **inline in that same worktree** — already on the feature branch — driving `/delegate` workers each running `scripts/ralph.sh`; standalone, it instead launches an expert `/worktrees` Advisor in its own `agent-ship-<slug>` tmux session) → `/eval` → `/compact` (after implement) → `/pr-audit` promotable → `gh pr ready` (or left draft with a comment). **Capture `PR_NUM`, the actual `BRANCH`, and ship-spec's terminal status (`READY` or `DRAFT-BLOCKED`).** After the branch exists, ensure the cron tmux session is named `$(safe_branch_session "$BRANCH")` (for example `autopilot-feat-123-slug`) and keep `ACTIVE_MARKER=/tmp/$(safe_branch_session "$BRANCH").active` until the run is finalized or left for manual continuation.

Because `/ship-spec` owns implement → eval → audit → undraft, **§5–§7 are reconciliation, not re-execution** in `delegate-advisor` mode: autopilot reads ship-spec's outcome and applies its own caps / selection-rationale / session-lifecycle / branch-restore. The `ralph` fallback (§5) is the only path where autopilot drives the loop itself.

**Critic HALT handling** — if `/ship-spec` emits `HALT` (critic gate rejected the spec):
- Comment the verdict on the ticket and block it so it can't retry-loop hourly:
  ```bash
  gh issue comment "$ISSUE_NUM" --repo "$AUTOPILOT_REPO" --body "autopilot: /ship-spec critic gate rejected the spec. Verdict: <summary>. Labeled autopilot-blocked; remove the label to retry."
  gh issue edit "$ISSUE_NUM" --repo "$AUTOPILOT_REPO" --add-label autopilot-blocked
  cleanup_active_marker
  ```
- Memory log `Result: HALT-CRITIC-GATE`, liveness `HALT-CRITIC-GATE`, then `close_no_pr_session` and exit 0 (no PR → no keep-marker and no active-marker).

**Add the `autopilot` label** to the PR:
```bash
gh pr edit "$PR_NUM" --repo "$AUTOPILOT_REPO" --add-label autopilot
```

**State the selection rationale in the PR description** (mandatory — every autopilot PR explains why this item was chosen this session). Idempotent; prepends a `## Selection rationale` section so it is the first thing a reviewer reads:

```bash
if ! gh pr view "$PR_NUM" --repo "$AUTOPILOT_REPO" --json body --jq .body | grep -q "## Selection rationale"; then
  BODY=$(gh pr view "$PR_NUM" --repo "$AUTOPILOT_REPO" --json body --jq .body)
  printf '## Selection rationale\n\n%s\n\n---\n\n%s\n' "$SELECTION_RATIONALE" "$BODY" > "/tmp/autopilot-pr-$PR_NUM.md"
  gh pr edit "$PR_NUM" --repo "$AUTOPILOT_REPO" --body-file "/tmp/autopilot-pr-$PR_NUM.md"
  rm -f "/tmp/autopilot-pr-$PR_NUM.md"
fi
```

### 5. Implement — executor

Dispatch by executor. In `delegate-advisor` mode `/ship-spec` (§4) has already built **and finalized**; in `ralph` mode autopilot drives the loop inline.

#### `delegate-advisor` (default) — defer to `/ship-spec`

`/ship-spec` (§4) owns the entire build inside its own `agent-ship-<slug>` worktree-Advisor session: the two compacts bracketing implement, `/delegate` workers each running `scripts/ralph.sh`, the `/eval` gate, and the `/pr-audit` promotable undraft. Autopilot does **not** run its own `/compact`, `/delegate`, `scripts/ralph.sh`, or `/eval` in this mode, and does **not** spawn a second Advisor session. There is nothing to drive here — proceed to §6/§7 to reconcile ship-spec's terminal outcome.

**Delegate-advisor failure compensation** — if `/ship-spec` returns `DRAFT-BLOCKED` because its implement/`/delegate` phase failed, stalled, or left acceptance criteria incomplete (eval/CI reds are reconciled in §6/§7):
```bash
gh pr comment "$PR_NUM" --repo "$AUTOPILOT_REPO" --body "autopilot: /ship-spec did not complete tasks/$SLUG/prd.json (implement/delegate phase). PR left draft; attach to tmux session $SESSION (or agent-ship-$SLUG) and resume. Status: DELEGATE-FAIL."
```
- Memory log `Result: DELEGATE-FAIL`, liveness `DELEGATE-FAIL`, **persist the session** (`[ -n "$KEEP" ] && touch "$KEEP"`), leave `ACTIVE_MARKER` in place for duplicate suppression, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit 1 (non-destructive — never auto-close the issue or PR).

#### `ralph` fallback (legacy inline)

When `EXECUTOR=ralph` (from `--executor=ralph` or `AUTOPILOT_EXECUTOR=ralph`), bypass ship-spec's Advisor handoff and drive the resumable loop inline. The task is already scaffolded on `feat/$ISSUE_NUM-$SLUG` (§4); launch the loop here — it runs in its own tmux session named `$SLUG`, committing one story per iteration to the branch (idempotent: it reattaches/exits immediately if `progress.txt` already shows `STATUS: COMPLETE`):

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
gh pr comment "$PR_NUM" --repo "$AUTOPILOT_REPO" --body "autopilot: Ralph loop did not reach STATUS: COMPLETE (timeout / exhausted / error). PR left draft; tasks/$SLUG/ state is resumable — re-run \`scripts/ralph.sh $SLUG\` to continue. Status: RALPH-INCOMPLETE."
```
- Memory log `Result: RALPH-INCOMPLETE`, liveness `RALPH-INCOMPLETE`, **persist the session** (`[ -n "$KEEP" ] && touch "$KEEP"`), leave `ACTIVE_MARKER` in place for duplicate suppression, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit 1 (non-destructive — never auto-close the issue or PR).

### 6. Eval gate

**`delegate-advisor`**: `/ship-spec` already ran the `/eval` gate inside its pipeline (a new green→red regression there leaves the PR draft). Do **not** re-run `/eval` — its outcome is part of ship-spec's terminal state, reconciled in §7.

**`ralph` fallback**: after the inline loop completes (§5), **while still on the work branch**, run the probe suite:

```
/eval
```

- If `/eval` updates `evals/RESULTS.md`, commit it on the branch:
  ```bash
  git add evals/RESULTS.md && git commit -m "$(printf 'task: refresh evals benchmark\n\nSubmitted-by: %s\n' "${RALPH_HARNESS:-Claude}")" || true
  ```

**Decision rule** (ralph fallback) — key on the runner's exit code and the green→red **delta**, NOT on the bare presence of a `REGRESSION` row in `evals/RESULTS.md`. A probe that was already red on the base (`$AUTOPILOT_REMOTE/$AUTOPILOT_BASE`) is **pre-existing** — this PR did not cause it, so it must not block. **PROCEED** to §7 when BOTH of these hold:

1. the `/eval` runner exited `0`, AND
2. every regressed probe's delta is `unchanged` vs the base (already-red — NOT a NEW green→red transition).

**Keep the PR draft** (status `PR-DRAFT-EVAL-RED`) only on a **NEW (green→red) regression OR a non-zero runner exit**:
  ```bash
  gh pr comment "$PR_NUM" --repo "$AUTOPILOT_REPO" --body "autopilot: /eval reported a NEW (green→red) probe regression (<probe ids>) or a non-zero runner exit. PR left draft; resolve before marking ready."
  ```
  Memory log `Result: PR-DRAFT-EVAL-RED`, liveness `PR-DRAFT-EVAL-RED`, then `[ -n "$KEEP" ] && touch "$KEEP"`, `cleanup_active_marker`, the canonical scoped restore (`git checkout development -- "${OWNED_PATHS[@]}"` then `git checkout development`, then assert `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` and `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`), exit.

> **Diagnostic note (non-gating):** file-scope overlap does not gate. If a regressed probe reads a file this PR changed, the runner-exit + delta signal still governs — a self-referential probe (e.g. `eval-gate` on an autopilot edit) whose delta is `unchanged` does NOT block. The delta is the authoritative causation signal.

- **All clear, or only pre-existing reds (`unchanged` delta) with runner exit 0** → when a pre-existing red is present, **post it on the PR** for honesty (do not claim an all-green board), then proceed to §7.

### 7. Finalize

**`delegate-advisor`** — `/ship-spec` already finalized (it pushed, ran `/pr-audit`, and either `gh pr ready`'d a promotable PR or left it draft with a comment). Autopilot **reconciles** ship-spec's terminal status; it does **not** re-run `/pr-audit` or `gh pr ready`:

- ship-spec reported `READY` → memory log `Result: PR-READY`, liveness `PR-READY`.
- ship-spec reported `DRAFT-BLOCKED` → leave the PR draft; memory log `Result: PR-DRAFT-CI-RED` (or `PR-DRAFT-EVAL-RED` when the block was a new eval regression), matching liveness.

**`ralph` fallback** — autopilot finalizes the inline build itself.

**Push the branch**:
```bash
git push "$AUTOPILOT_REMOTE" HEAD
```

**Undraft gate** — run `/pr-audit` focused on this PR and key on its draft sub-status:

- **Promotable** (`/pr-audit` reports CI green + mergeable + clean):
  ```bash
  gh pr ready "$PR_NUM" --repo "$AUTOPILOT_REPO"
  ```
  Memory log `Result: PR-READY`, liveness `PR-READY`.
- **Not promotable** (red/pending CI, conflicts, or `/pr-audit` could not classify):
  - Leave the PR **draft** (do NOT call `gh pr ready`).
  - `gh pr comment "$PR_NUM" --repo "$AUTOPILOT_REPO" --body "autopilot: /pr-audit did not classify this PR promotable (CI red/pending or conflicts). PR left draft. Resolve and mark ready manually."`
  - Memory log `Result: PR-DRAFT-CI-RED`, liveness `PR-DRAFT-CI-RED`.

**Never call `gh pr merge`** — autopilot does not auto-merge under any condition.

**Persist the session** (a PR exists on every §7 path): `[ -n "$KEEP" ] && touch "$KEEP"`.

**Clean the active marker on finalized PR paths**: after the run creates or updates a terminal PR state (`PR-READY`, `PR-DRAFT-CI-RED`, or `PR-DRAFT-EVAL-RED`), run `cleanup_active_marker` before restore/exit. The open PR and persisted `autopilot-<branch>` session are now the duplicate guards; leaving `/tmp/$SAFE_SESSION.active` behind would permanently suppress a future run after the PR/session is closed. Keep `ACTIVE_MARKER` only on incomplete executor paths (`DELEGATE-FAIL`, `RALPH-INCOMPLETE`) where manual continuation is expected.

**Release the overlap lock before restoring** (mandatory for kept Pi sessions): after any terminal PR state (`PR-READY`, `PR-DRAFT-CI-RED`, or `PR-DRAFT-EVAL-RED`), run `release_overlap_lock` before the restore. Kept Pi sessions intentionally stay alive for manual review, so the cron wrapper may not regain control to remove `/tmp/cron-autopilot.pid`; the skill must clear `$CRON_OVERLAP_PIDFILE` itself once the run is terminal. Incomplete executor paths (`DELEGATE-FAIL`, `RALPH-INCOMPLETE`) keep the lock because manual continuation is expected.

**Restore branch** (root mode only — when `$CRON_WORKTREE` is set the whole restore is skipped: a worktree run never touched root and its worktree is discarded by the runtime/heartbeat, so there is nothing to restore. In root mode it is mandatory — the next cron fire's §1 branch guard only passes on `development`). Canonical **scoped restore** — a non-destructive two-step that discards only this run's own OWNED-path residue, then switches HEAD. Committed work is safe on the branch / draft PR. The scope step MUST precede the branch switch (it clears owned residue that would otherwise make a non-forced `git checkout development` refuse). It touches only **tracked** files, so an untracked owned-path orphan from a mid-run crash is NOT auto-removed (`git clean` is deliberately NOT used — too destructive across `tasks/`, `memory/`, `.claude/`); clean such orphans manually. Any **foreign** change OUTSIDE the owned surface — modified or staged (e.g. `.codex/config.toml`) — survives byte-for-byte (left in place / left staged) and is ignored by the scoped assertion and the next §1 check:
```bash
release_overlap_lock                         # terminal PR state reached; clear cron overlap lock before keeping the Pi session alive
if [ -z "${CRON_WORKTREE:-}" ]; then         # root mode ONLY — a worktree run is ephemeral (runtime/heartbeat removes the worktree); there is nothing in root to restore
  git checkout development -- "${OWNED_PATHS[@]}"   # 1. discard own owned-path residue (tracked only; array form word-splits under bash+zsh)
  git checkout development                    # 2. switch HEAD (residue cleared above → non-forced switch succeeds; foreign WIP unaffected)
  git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }
  [ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || { echo "ERROR: autopilot restore did not land on development"; exit 1; }
fi
```

### 8. Memory Log

Append to `$AUTOPILOT_LOG_ROOT/memory/<today>/log.md` on **every** exit path (skips, halts, errors included). In worktree-mode runs, `$AUTOPILOT_LOG_ROOT` is the shared root checkout, not the ephemeral cron worktree:

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "$AUTOPILOT_LOG_ROOT/memory/$TODAY"
scripts/locked-append.sh "$AUTOPILOT_LOG_ROOT/memory/$TODAY/log.md" <<EOF

## Autopilot -- $TIME UTC
- **Result**: <SKIPPED-CAP-TOTAL | SKIPPED-CAP-DAILY | NOTHING-NEW | PR-READY | PR-DRAFT-CI-RED | PR-DRAFT-EVAL-RED | HALT-CRITIC-GATE | RALPH-INCOMPLETE | DELEGATE-FAIL | BLOCKED-OWNED-WIP | FAIL>
- **Executor**: <delegate-advisor | ralph>
- **Selected**: <#issue + slug, or "none">
- **Session**: <tmux session name, or "none">
- **Action**: <one-line summary of what was done>
- **Observation**: <one sentence — key finding or outcome>
EOF
```

See `.mifune/skills/retro/references/memory-protocol.md` for the canonical Memory Improvement Protocol.

## Guidelines

- **Scope guard**: harness-infra only — skills, rules, docs, scripts, crons, wiki. Never write or modify sandbox application code. Same boundary as `CLAUDE.md` § What You Do NOT Do.
- **Worktree isolation by default**: `crons/autopilot.md` sets `worktree: true`, so the cron runtime fires every run inside a fresh detached `.worktrees/cron/<session>` worktree (`$CRON_WORKTREE`) and the shared root checkout is NEVER touched for source/branch work. This is what keeps the root clean (no `BLOCKED-OWNED-WIP`-class dirty-env stalls) and means a fire is never silently skipped — it runs isolated, or the runtime surfaces a FAILURE (`ERR_WORKTREE`/`ERR_WORKTREE_CAP`). In worktree mode §1 skips the root-clean guards and §7 skips the branch restore; the overlap lock is moot (no id-scoped pidfile is held). `release_overlap_lock` is retained for root/manual runs (no `$CRON_WORKTREE`) and is a harmless no-op under worktree mode. Stuck/idle worktree sessions and their checkouts are reaped by the heartbeat (and the runtime prunes dead-session worktrees before the concurrency cap). **Runtime observability is the exception**: autopilot resolves `$AUTOPILOT_LOG_ROOT` to the shared root checkout and writes `memory/<today>/log.md` plus `crons/.cron.log` there via `scripts/locked-append.sh` so those logs survive worktree reaping and remain visible to heartbeat.
- **Selection rationale**: every PR autopilot opens MUST carry a `## Selection rationale` section as the FIRST section of its description, stating why this item was chosen this session (queue position, or the research finding + impact ranking).
- **No auto-merge**: autopilot finalizes a *ready-for-review* PR; a human merges. The word "merge" must never appear in an autopilot-generated commit message, PR body, or `gh` command.
- **Caps**: at most 6 open autopilot PRs created per UTC day AND 10 total open at any time. A close/merge frees a slot.
- **Implementation executor**: default `delegate-advisor` (`AUTOPILOT_EXECUTOR` unset) runs the exact `/goal Audit plan /w @"pm (agent)" using ultrathink, then run /ship-spec --issue to build it end-to-end (worktree Advisor, /delegate + ralph, /eval, /pr-audit undraft) into a ready-for-review PR` prompt and **defers the whole build to `/ship-spec`** — ship-spec owns the compacts, the worktree Advisor + `/delegate` + ralph workers, `/eval`, and the `/pr-audit` undraft. Autopilot does not run its own `/compact`/`/delegate`/`/eval` in this mode; it reconciles ship-spec's terminal outcome and leaves `autopilot-<branch>` alive. `ralph` mode is an explicit legacy fallback via `--executor=ralph` or `AUTOPILOT_EXECUTOR=ralph` and drives `scripts/ralph.sh "$SLUG"` inline.
- **Non-destructive failure**: never auto-close issues or PRs. On failure, comment + log. Human inspection is the recovery path.
- **autopilot-blocked**: a critic HALT labels the ticket `autopilot-blocked`, excluding it from the queue query until a human removes the label — a bad ticket can't retry-loop hourly.
- **Idempotent labels**: the `gh label create … 2>/dev/null || true` pattern is safe to run every pulse.
- **Liveness on every path**: every exit calls `log_liveness "<TOKEN>"`, which appends to `$AUTOPILOT_LOG_ROOT/crons/.cron.log` via `scripts/locked-append.sh` — skip, halt, error, success. In worktree mode that path is the shared root checkout, not `$CRON_WORKTREE`; a missing liveness line looks like a crash.
- **Session lifecycle**: persist the per-run tmux session (`[ -n "$KEEP" ] && touch "$KEEP"`) iff the run produced a PR (`PR-READY`, `PR-DRAFT-CI-RED`, `PR-DRAFT-EVAL-RED`, `RALPH-INCOMPLETE`, `DELEGATE-FAIL`). In delegate-advisor mode, the persisted session name is `autopilot-<branch>` (sanitized, e.g. `autopilot-feat-123-slug`) and is intentionally left alive for manual attach/continue/reap; no separate advisor session is created. No-PR paths never touch the keep-marker and must call `close_no_pr_session` after memory/liveness logging (cap skips, duplicate/NOTHING-NEW, no-survivor research, critic HALT before PR, FAIL, and BLOCKED-OWNED-WIP) so attachable Pi TUI sessions do not linger. The `[ -n "$KEEP" ]` guard means manual runs (no tmux) are unaffected.
- **Branch restore (canonical scoped restore)**: every path that changed the working branch (all paths reaching §4+) must run the two-step `git checkout development -- "${OWNED_PATHS[@]}"` (discard own owned-path residue — tracked staged AND unstaged) THEN `git checkout development` (switch HEAD), then assert BOTH `git diff --quiet -- "${OWNED_PATHS[@]}" && git diff --cached --quiet -- "${OWNED_PATHS[@]}" || { echo "ERROR: autopilot restore left a dirty owned tree"; exit 1; }` AND `[ "$(git rev-parse --abbrev-ref HEAD)" = "development" ] || exit 1`. The scope step MUST precede the switch (it clears owned residue that a non-forced `git checkout development` would otherwise refuse to overwrite). It discards only the run's own owned-path residue (committed work is preserved on the feature branch / draft PR); it touches only tracked files, so an untracked owned-path orphan from a mid-run crash is cleaned manually (`git clean` is deliberately NOT used); and any foreign change OUTSIDE the owned surface survives byte-for-byte (left in place / left staged), ignored by the scoped assertion and the next §1 check. The owned-scoped assertion mirrors the §1 owned check, so "assertion passes" ≡ "the next fire's §1 guard will pass". §1 additionally self-heals a *clean*-but-stranded branch (its forced tree-wide checkout is the only remaining `-f` form); a *dirty* owned tree at §1 still blocks (BLOCKED-OWNED-WIP) to protect any owned WIP.

## Reference

### Status tokens

| Token | Meaning |
|-------|---------|
| `SKIPPED-CAP-TOTAL` | ≥10 open autopilot PRs (any age); run skipped until one closes/merges |
| `SKIPPED-CAP-DAILY` | ≥6 autopilot PRs created this UTC day are still open; skipped until one closes/merges or the day rolls over |
| `NOTHING-NEW` | No actionable ticket (queue empty, or all open tickets already have PRs) AND `/harness-audit` produced no finding that survives dedupe — research ran but had nothing fresh to file. _(Replaces the retired `IN-FLIGHT` token: a single in-flight PR no longer ends the run; it falls through to research.)_ |
| `PR-READY` | End-to-end success; PR marked ready with green CI |
| `PR-DRAFT-CI-RED` | PR left draft because the PR was not promotable per `/pr-audit` (CI red/pending or conflicts) — set by `/ship-spec` in delegate-advisor mode, or by the ralph fallback's own `/pr-audit` gate |
| `PR-DRAFT-EVAL-RED` | PR left draft because `/eval` reported a NEW (green→red) probe regression or a non-zero runner exit (inside `/ship-spec` in delegate-advisor mode, or autopilot's inline `/eval` in ralph mode) |
| `HALT-CRITIC-GATE` | `/ship-spec` critic gate rejected the spec; ticket labeled `autopilot-blocked`, no PR opened |
| `RALPH-INCOMPLETE` | §5 Ralph fallback loop did not reach `STATUS: COMPLETE` (timeout, loop died, or all harnesses exhausted) after `/ship-spec` opened a PR; PR left draft — `tasks/$SLUG/` state is resumable via `scripts/ralph.sh $SLUG` |
| `DELEGATE-FAIL` | `/ship-spec`'s implement/`/delegate` phase failed or stalled on `tasks/$SLUG/prd.json` in delegate-advisor mode; PR left draft and the `autopilot-<branch>` / `agent-ship-<slug>` session is left alive for manual continuation |
| `SPAWNED_WORKTREE` | Emitted by the cron runtime (not this skill): a `worktree: true` fire spawned in an isolated `.worktrees/cron/<session>` worktree (the default for autopilot) so the root checkout stays clean |
| `SKIPPED_OVERLAP` | Emitted by the cron runtime (not this skill): a previous fire of this id was still running with `overlap: false`. **No longer reachable for autopilot** (`worktree: true` always isolates instead of skipping); retained for non-worktree crons (heartbeat/cleanup/eval) |
| `ERR_WORKTREE` | Emitted by the cron runtime (not this skill): a `worktree: true` fire could not create its isolated worktree (no base ref, or `git worktree add` failed). A surfaced FAILURE, never a silent skip |
| `ERR_WORKTREE_CAP` | Emitted by the cron runtime (not this skill): live worktree runs for this id hit the concurrency cap; the fire is a surfaced FAILURE (retried next fire once the heartbeat reaps a stuck session + its worktree) — never a silent skip |
| `BLOCKED-OWNED-WIP` | Root mode only — §1 found the OWNED surface (`${OWNED_PATHS[@]}`) dirty; run skipped until the owned surface is clean — non-destructive to foreign WIP (a stray edit outside the owned set proceeds normally). A worktree run (the default) is always clean, so this cannot occur there |
| `FAIL` | Pre-flight failure (wrong branch, diverged `development`) before any PR |

### Key paths

| Path | Purpose |
|------|---------|
| `crons/autopilot.md` | Cron definition (`tmux: true`, `worktree: true`) that fires this skill hourly in an isolated worktree |
| `$AUTOPILOT_LOG_ROOT/crons/.cron.log` | Append-only liveness log read by the cron runtime; resolves to the shared root checkout when `$CRON_WORKTREE` is set |
| `$AUTOPILOT_LOG_ROOT/memory/<today>/log.md` | Daily session log; autopilot appends an entry each run; resolves to the shared root checkout when `$CRON_WORKTREE` is set |
| `.claude/agents/pm.md` | pm agent definition (invoked via `Agent subagent_type: pm`) |
| `$CRON_TMUX_SESSION` / `$CRON_KEEP_MARKER` | Per-run tmux session name + keep-marker path, set by the cron runtime (empty on manual runs); delegate-advisor renames the session to `autopilot-<branch>` after branch discovery |
| `$CRON_OVERLAP_PIDFILE` | Per-id overlap lock path (for autopilot, `/tmp/cron-autopilot.pid`) exported by the cron runtime; terminal PR paths remove it so a kept Pi review session does not trigger hourly `SKIPPED_OVERLAP`. In worktree mode the runtime exports a session-scoped path instead (the id lock is never held), so this is a harmless no-op there |
| `$CRON_WORKTREE` | Absolute path of the isolated worktree this run executes in, set by the cron runtime for `worktree: true` crons (empty on root/manual runs). When set, §1 skips the root-clean guards and §7 skips the branch restore — the worktree is ephemeral and source work never touches the root checkout |
| `$AUTOPILOT_LOG_ROOT` | Shared checkout root used only for runtime observability appends (`crons/.cron.log`, `memory/<today>/log.md`); defaults to the current checkout in root/manual mode and resolves above `.worktrees/cron/<session>` in worktree mode |
| `AUTOPILOT_REPO` | Canonical GitHub repo target for issues, PRs, labels, and cap counts. Defaults to `mifunedev/openharness`; cron runtime exports it from `repo:` frontmatter. |
| `AUTOPILOT_REMOTE` | Local git remote whose URL matches `$AUTOPILOT_REPO` (`upstream` in this checkout, normally `origin` in fresh installs). Used for fetch/push. |
| `AUTOPILOT_EXECUTOR` | Optional executor toggle: `delegate-advisor` (default) or `ralph` fallback |
