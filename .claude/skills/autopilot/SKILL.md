---
name: autopilot
description: |
  Self-improvement loop: selects the next harness-infra improvement from the
  curated backlog (or a throttled /harness-audit fallback), decomposes it via
  the pm agent, scaffolds a branch + draft PR with /ship-spec, executes it
  in-process with /delegate, and finalizes a ready-for-review PR with green CI.
  Harness-infra only (skills/rules/docs/scripts/crons/wiki) — never sandbox
  application code. Cap of 6 autopilot PRs created per UTC day; never auto-merges.
  TRIGGER when: the hourly crons/autopilot.md fires, or invoked manually on
  demand (e.g. /autopilot --dry-run to preview the next selection).
argument-hint: "[--dry-run]"
---

# Autopilot

Unattended self-improvement loop for the harness. Each run picks one harness-infra item, builds it end-to-end through `pm decompose → /ship-spec → /delegate`, and lands a ready-for-review PR. Scope is strictly **harness-infra only** (skills/rules/docs/scripts/crons/wiki) — never sandbox application code, never auto-merge.

`--dry-run` prints the selected item and today's autopilot-PR creation count, then exits without calling `/ship-spec` or `/delegate`.

## Instructions

### 1. Guardrail pre-check

**Ensure the `autopilot` GitHub label exists** (idempotent — safe to run every pulse):

```bash
gh label create autopilot --color 6E40C9 --description "Opened by the autopilot loop" 2>/dev/null || true
```

**Daily-cap check** — count autopilot PRs **created today** (UTC). Any state counts toward the quota — open, merged, and closed alike — so merging PRs during the day does not raise the ceiling:

```bash
TODAY=$(date -u +%Y-%m-%d)
CREATED_TODAY=$(gh pr list --state all --search "label:autopilot created:>=$TODAY" --json number --jq 'length')
echo "autopilot PRs created today: $CREATED_TODAY (cap 6)"
```

If `$CREATED_TODAY` ≥ 6:
- Append memory log entry (see §7 Memory Log) with `Result: SKIPPED-CAP-DAILY`.
- Append liveness line: `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "SKIPPED-CAP-DAILY" >> crons/.cron.log`
- **EXIT** — do NOT proceed to §2, do NOT run `/harness-audit`.

If `--dry-run`: print `autopilot PRs created today: $CREATED_TODAY (cap 6)` now (the selection is printed after §2), then **continue** to §2 to determine the selection but exit before §4.

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

### 2. Select item

Build a candidate list and **advance past dedupe hits** — a blocked candidate must never end the run while other candidates remain (the 2026-06-10 one-PR stall was exactly this: one in-flight item head-of-line-blocked every subsequent pulse).

**Source A — curated backlog** (`crons/autopilot-backlog.md`): iterate ALL unchecked items in file order:

```bash
grep '^\- \[ \]' crons/autopilot-backlog.md 2>/dev/null
```

For each line, extract its slug token (the first word after `- [ ] `):

```bash
SLUG=$(echo "$LINE" | sed 's/^- \[ \] //' | awk '{print $1}' | tr -d ':' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
```

Run the **dedupe check** (below) on each candidate in order. Select the FIRST candidate that passes; set `SOURCE="backlog"`.

**Source B — `/harness-audit` fallback** (only when no backlog candidate survives dedupe):

Throttle: at most one audit per **4 hours** — paired with the daily cap, hourly fires on an empty backlog yield at most 6 audit-driven builds/day. The throttle is tracked by the explicit `AUDIT-RUN` liveness marker, not by grepping prose in the memory log:

```bash
LAST_AUDIT=$(grep 'autopilot: AUDIT-RUN' crons/.cron.log | tail -1 | sed 's/^\[\([^]]*\)\].*/\1/' || true)
if [ -n "$LAST_AUDIT" ]; then
  AGE_H=$(( ($(date +%s) - $(date -d "$LAST_AUDIT" +%s)) / 3600 ))
  [ "$AGE_H" -lt 4 ] && AUDIT_THROTTLED=1
fi
```

If throttled, fall through to the exhausted path. Otherwise run `/harness-audit` and immediately append the marker:

```bash
printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "AUDIT-RUN" >> crons/.cron.log
```

Take the top **3** ranked harness-infra findings, derive a deterministic kebab slug for each (lowercase, spaces → `-`), and dedupe-check them in rank order. Select the first that passes; `SOURCE="audit"`.

**Dedupe check** (per candidate) — a candidate is blocked if an open issue, an open PR, **or a merged PR** already covers its slug (merged matters: minutes after a merge, open-state-only dedupe goes blind and the loop rebuilds shipped work):

```bash
DUPE_OPEN_ISSUE=$(gh issue list --state open --json title --jq '.[].title' | grep -i "$SLUG" || true)
DUPE_OPEN_PR=$(gh pr list --state open --json title,headRefName \
  --jq '.[] | "\(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
DUPE_MERGED_PR=$(gh pr list --state merged --limit 50 --json number,title,headRefName \
  --jq '.[] | "\(.number) \(.title) \(.headRefName)"' | grep -i "$SLUG" || true)
```

- Any hit → record the candidate + reason, **continue to the next candidate** (do NOT exit the run).
- **Self-heal**: if a *backlog* candidate's only hit is a merged PR, the item shipped but was never checked off. Mark it now — flip its line to `- [x] <slug>: …` and append ` — shipped as PR #<N> (deduped <UTC date>)`, then commit to `development` with `task: check off <slug> in autopilot backlog (merged PR #<N>)` and push. Continue to the next candidate.

**All candidates blocked / both sources exhausted**:

- At least one candidate existed but every one hit dedupe → log `Result: SKIPPED-DEDUPE`, `Selected: none`, `Observation: all candidates already covered by open or merged work`; liveness `SKIPPED-DEDUPE`; exit 0.
- No candidate existed at all (backlog empty AND audit throttled or empty) → log `Result: NOTHING-TO-BUILD`, `Observation: backlog empty and no new harness-audit findings`; liveness `NOTHING-TO-BUILD`; exit 0 **without touching git or GitHub**.

**`--dry-run` exit** — at this point print:

```
[dry-run] selected: $SLUG (source: $SOURCE)
[dry-run] autopilot PRs created today: $CREATED_TODAY (cap 6)
[dry-run] exiting without calling /ship-spec or /delegate
```

Then exit 0.

### 3. pm decompose

Invoke the `pm` agent via the `Agent` tool with `subagent_type: pm`. Pass a 5-field advisor-model briefing:

```
## Advisor Briefing

**Goal**: Decompose the harness-infra improvement item "$SLUG" into a concrete implementation plan.

**Constraints / gotchas**:
- Scope: harness-infra only (skills/rules/docs/scripts/crons/wiki) — do NOT touch sandbox application code.
- Must produce output suitable as input for /ship-spec (a short description + implementation plan).
- Keep the plan to 3–7 concrete acceptance-criteria bullets; do not over-specify.

**Acceptance criteria**:
- A one-sentence feature description suitable for /ship-spec (no longer than ~120 chars).
- A bullet-list implementation plan (3–7 items).

**Start here**: crons/autopilot-backlog.md (the item's full text), memory/MEMORY.md (recent context).

**Out of scope**: PRD JSON generation, branch creation, git operations.
```

Capture the pm agent's output as `PM_PLAN` and `PM_DESC` (the first sentence from its output as the description, the rest as the plan).

### 4. /ship-spec

Run `/ship-spec` with the pm decomposition output:

```
/ship-spec "$PM_DESC" --plan <pm-plan-content> --prefix feat
```

`/ship-spec` will:
1. Run `/prd` to generate the spec.
2. Run 2 critics against the spec; a critic HALT exits the pipeline.
3. Run `/ralph` to convert to `tasks/<slug>/prd.json`.
4. Create a GitHub issue.
5. Create a branch.
6. Open a **draft** PR.

**Capture the PR number** from `/ship-spec` output: `PR_NUM=<N>`.

**Critic HALT handling** — if `/ship-spec` emits `HALT` (critic gate rejected the spec):
- Log `Result: HALT-CRITIC-GATE`, `Selected: $SLUG`, `Action: /ship-spec critic gate rejected spec`, `Observation: spec rejected by critic; no PR opened`.
- Append liveness: `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "HALT-CRITIC-GATE" >> crons/.cron.log`
- Exit 0 (no git state to restore; no PR was opened).

**Add the `autopilot` label** to the PR immediately after it is created:

```bash
gh pr edit "$PR_NUM" --add-label autopilot
```

### 5. /delegate

Run `/delegate` to execute the prd.json stories **in-process**:

```
/delegate --plan tasks/<slug>/prd.json
```

**Critical**: do NOT use `run_in_background` for autopilot delegate waves. Await all workers before proceeding to §6. Rationale: `overlap: false` in `crons/autopilot.md` guards on the foreground process exiting; backgrounded workers would allow the next hourly fire to overlap, creating concurrent commits on the same branch.

Wait for `/delegate` to report completion (all waves finalized).

**Delegate failure compensation** — if `/delegate` exits with a non-zero status or reports an error:
- Post a comment on the PR explaining the abort:
  ```bash
  gh pr comment "$PR_NUM" --body "autopilot aborted mid-run: /delegate failed. PR left as draft for manual inspection. Status: DELEGATE-FAIL."
  ```
- Log `Result: DELEGATE-FAIL`, `Selected: $SLUG`, `Action: /delegate failed; PR $PR_NUM left draft`, `Observation: mid-run failure; human inspection required`.
- Append liveness: `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "DELEGATE-FAIL" >> crons/.cron.log`
- Restore branch: `git checkout development`
- Exit 1 (non-destructive — do NOT close the issue or PR automatically).

### 6. Finalize

**Push the branch**:

```bash
git push origin HEAD
```

**CI gate** — run `/ci-status` and capture its result:

- If `/ci-status` reports **green** (all checks passing):
  ```bash
  gh pr ready "$PR_NUM"
  ```
  Log `Result: PR-READY`.
  Append liveness: `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "PR-READY" >> crons/.cron.log`

- If `/ci-status` reports **red** OR `/ci-status` times out (no result within its configured timeout):
  - Leave the PR as **draft** (do NOT call `gh pr ready`).
  - Post a comment:
    ```bash
    gh pr comment "$PR_NUM" --body "autopilot: CI is red or timed out. PR left as draft. Resolve failures and mark ready manually."
    ```
  - Log `Result: PR-DRAFT-CI-RED`.
  - Append liveness: `printf '[%s] autopilot: %s\n' "$(date -Iseconds)" "PR-DRAFT-CI-RED" >> crons/.cron.log`

**Never call `gh pr merge`** — autopilot does not auto-merge under any condition.

**Restore branch** (mandatory — ensures the next cron fire passes §1's branch guard):

```bash
git checkout development
```

This step runs on EVERY exit path that reaches §6 (including `PR-DRAFT-CI-RED`).

**Check off the built item** (mandatory when `SOURCE="backlog"`; skip for `SOURCE="audit"`). Runs after the branch restore, on `development`:

```bash
git pull --ff-only origin development
sed -i "s/^- \[ \] $SLUG:/- [x] $SLUG:/" crons/autopilot-backlog.md
sed -i "/^- \[x\] $SLUG:/ s/$/ — shipped as PR #$PR_NUM ($(date -u +%Y-%m-%d))/" crons/autopilot-backlog.md
git add crons/autopilot-backlog.md
git commit -m "task: check off $SLUG in autopilot backlog (PR #$PR_NUM)"
git push origin development
```

Without this step the next fire re-selects the same item forever — this was the 2026-06-10 one-PR stall.

### 7. Memory Log

Append to `memory/<today>/log.md` on **every** exit path (including skips, halts, and errors):

```bash
TODAY=$(date -u +%Y-%m-%d); TIME=$(date -u +%H:%M); mkdir -p "memory/$TODAY"
cat >> "memory/$TODAY/log.md" <<EOF

## Autopilot -- $TIME UTC
- **Result**: <OK | SKIPPED-CAP-DAILY | SKIPPED-DEDUPE | NOTHING-TO-BUILD | PR-READY | PR-DRAFT-CI-RED | HALT-CRITIC-GATE | DELEGATE-FAIL | FAIL>
- **Selected**: <slug or "none">
- **Action**: <one-line summary of what was done>
- **Observation**: <one sentence — key finding or outcome>
EOF
```

Map `Result` to the appropriate status token from the liveness set. A successful end-to-end run that produces a ready PR uses `Result: PR-READY`. A run that produces a draft PR (CI red or timed out) uses `Result: PR-DRAFT-CI-RED`.

See `context/rules/memory.md` for the canonical Memory Improvement Protocol.

## Guidelines

- **Scope guard**: autopilot operates on harness-infra only — skills, rules, docs, scripts, crons, wiki. It MUST never write or modify sandbox application code (Python modules, APIs, tests, business logic). This boundary is identical to the `CLAUDE.md` § What You Do NOT Do constraint.
- **No auto-merge**: autopilot finalizes a *ready-for-review* PR. A human reviews and merges. The word "merge" must never appear in an autopilot-generated commit message, PR description, or `gh` command.
- **In-process delegate only**: `/delegate` waves run synchronously. `run_in_background` is forbidden for autopilot delegate calls. The `overlap: false` cron setting is the concurrency guard; background workers would defeat it.
- **Non-destructive failure**: autopilot never auto-closes issues or PRs. On failure, it comments and logs. Human inspection is always the recovery path.
- **Idempotent label creation**: the `autopilot` label `gh label create ... 2>/dev/null || true` pattern is safe to run every pulse.
- **Liveness on every path**: the `crons/.cron.log` `printf` line is mandatory on every exit — skip, halt, error, and success. A missing liveness line looks like a crash; never skip it.
- **Branch restore**: `git checkout development` must execute on every path that changes the working branch (i.e., all paths that reach §4 or later). The guardrail in §1 only passes when HEAD is `development`.
- **Throttle discipline**: the daily cap (6 autopilot PRs created per UTC day) gates the entire run; the `/harness-audit` fallback fires at most once per 4h, tracked via the `AUDIT-RUN` liveness marker. Together they bound the loop's worst-case output to 6 PRs/day with no runaway audit invocations.
- **Backlog lifecycle**: every shipped backlog item MUST end up checked off (`- [x]` + PR annotation) — by §6 on the normal path, by the §2 self-heal when a merged-but-unchecked item is found. An unchecked shipped item is the loop's primary stall mode.

## Reference

### Status tokens

| Token | Meaning |
|-------|---------|
| `OK` | Reserved for future use (successful sub-step logging; prefer specific tokens below) |
| `SKIPPED-CAP-DAILY` | ≥6 autopilot PRs already created this UTC day; run skipped to stay under the daily cap |
| `SKIPPED-DEDUPE` | Every candidate (backlog + audit) already covered by an open issue/PR or merged PR; nothing selectable this pulse |
| `NOTHING-TO-BUILD` | Both backlog and `/harness-audit` fallback exhausted/fully deduped |
| `AUDIT-RUN` | Marker only (not an exit status): `/harness-audit` fallback was invoked; used for the 4h throttle |
| `PR-READY` | End-to-end success; PR marked ready with green CI |
| `PR-DRAFT-CI-RED` | PR left draft because CI was red or `/ci-status` timed out |
| `HALT-CRITIC-GATE` | `/ship-spec` critic gate rejected the spec; no PR opened |
| `DELEGATE-FAIL` | `/delegate` failed after `/ship-spec` opened a PR; PR left draft |

### Key paths

| Path | Purpose |
|------|---------|
| `crons/autopilot-backlog.md` | Curated improvement backlog (reference file, NOT a scheduled cron) |
| `crons/autopilot.md` | Cron definition that fires this skill hourly |
| `crons/.cron.log` | Append-only liveness log read by the cron runtime |
| `memory/<today>/log.md` | Daily session log; autopilot appends an entry each run |
| `.claude/agents/pm.md` | pm agent definition (invoked via `Agent subagent_type: pm`) |
