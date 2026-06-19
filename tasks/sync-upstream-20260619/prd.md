# PRD — Sync the 2026-06-19 upstream→origin batch (wave 1)

## Introduction

`origin` (ryaneggz/openharness, our fork) and `upstream` (mifunedev/openharness,
canonical) have diverged again. After the 2026-06-18 sync (in-flight as origin
PR #255, still open), upstream merged **nine** net-new harness PRs on 2026-06-19
that `origin/development` lacks. This task pulls the **clean subset** of that
batch down into `origin/development` via one PR, following the canonical
direction for upstream→origin sync (memory: `openharness-fork-upstream-topology`):
**cherry-pick + FF-push, never force-sync**.

This is **wave 1**: the four 06-19 PRs whose payloads are byte-identical between
`origin/development` and the merge-base, so each cherry-picks cleanly with a
uniform `-Xours` (the only conflict surface is the shared append/index files).
The five remaining 06-19 PRs (#462, #454, #456, #458, #463) are **deferred to
wave 2** because they need per-file 3-way merges or content-conflict review
(see § Out of scope).

## Goals

- Import the four clean 06-19 upstream PRs into `origin/development` via
  `git cherry-pick`, in trunk order, each as its own commit.
- Reconcile the two shared append/index files (`CHANGELOG.md`,
  `evals/RESULTS.md`) by **union**, preserving every origin entry and adding only
  the imported PRs' entries. **No `wiki/README.md` change** — none of the four add
  a wiki entry.
- Keep the full eval probe suite green (no green→red regression) and CI green.
- Open one reviewable PR `task/sync-upstream-20260619 → ryaneggz/openharness:development`.

## Scope — which PRs (wave 1)

| PR | Merge SHA (on `upstream`) | Branch | Pick command | Net-new payload |
|----|------|--------|--------------|-----------------|
| #452 | `a5cf486` (single-parent) | feat/451-dynamic-workflows-support | `git cherry-pick -Xours a5cf486` | `.pi/settings.json`, `.pi/extensions/__tests__/settings.test.ts`, `docs/harnesses/pi.md`, `docs/installation.md`, `docs/integrations/pi-dynamic-workflows.md` (new) |
| #446 | `5b8db4dd` (merge) | feat/445-preserve-active-cron-worktrees | `git cherry-pick -m 1 -Xours 5b8db4dd` | `scripts/cron-runtime.ts`, `scripts/__tests__/cron-runtime.test.ts` |
| #448 | `35ced5f5` (merge) | feat/447-harden-heartbeat-log-appends | `git cherry-pick -m 1 -Xours 35ced5f5` | `crons/heartbeat.md`, `evals/probes/heartbeat-logging-contract.sh` (new) |
| #450 | `619d660d` (merge) | feat/449-add-sandbox-image-build-ci | `git cherry-pick -m 1 -Xours 619d660d` | `.github/workflows/sandbox-boot-guard.yml` (new), `evals/probes/sandbox-boot-guard-ci.sh` (new) |

**Pick order = trunk order: #452 → #446 → #448 → #450.** All four payloads are
disjoint and origin==base, so order is not strictly coupling-load-bearing, but
trunk order minimizes `-Xours` surprises. #452 is single-parent (no `-m`); the
other three are merge commits and **require `-m 1`** (a plain cherry-pick of a
merge errors with "is a merge but no -m option was given").

## Out of scope (wave 2 — deferred)

- **#462** (`feat/repo-context-map`, `efc1c41`) — origin's own commits (#252,
  #254) already modified `AGENTS.md` and `scripts/README.md`, the same files
  #462 rewrites (+17 / +1). A blanket `-Xours` would **drop #462's payload**, so
  it needs a real 3-way merge — unsafe for the unattended loop. Defer.
- **#454** (`ignore-stale-legacy-system-cron`) — origin already carries some
  legacy-cron handling; needs a content diff before syncing.
- **#456** (`docs-build-decoupling`), **#458** (`preserve-dirty-workspace`),
  **#463** (`keep-slack-tokens-out-of`) — touch docs build / devcontainer /
  Slack surfaces that overlap origin's parallel work; sync after a per-PR
  content-conflict check.
- Do **not** sync the 06-18 batch here — it is already in flight as origin PR #255.
- No application/business logic; this is harness-infra sync only.

## Mechanism

The session model (Opus) is the **Advisor**; it owns the worktree and launches
the executor. The executor is `scripts/ralph.sh --harness=pi` running the loop in
a tmux session named **`agent-pi`**, advised/monitored by an Advisor sub-agent via
the `Monitor` tool until `progress.txt` contains `STATUS: COMPLETE`. The apply is
inherently serial (all four picks share `CHANGELOG.md`/`evals/RESULTS.md`), so the
ralph loop does one story per iteration.

All work happens in the isolated worktree `.worktrees/task/sync-upstream-20260619`
off `origin/development` — never the shared `/home/sandbox/harness` checkout, which
is live for crons/autopilot (memory: `autopilot-shared-checkout-contamination`).

## Conflict resolution — one reconciliation commit, two files

- **`CHANGELOG.md` — union under `[Unreleased]`.** `-Xours` keeps origin's copy
  during each pick; the reconcile commit **appends** the lines each of the four
  SHAs added (captured verbatim in `progress.txt` § Codebase Patterns), each under
  the same subsection (`Added`/`Changed`/`Fixed`) it occupies in its source commit.
  Append, never replace.
- **`evals/RESULTS.md` — keep origin's full row set, hand-insert 2 new rows**
  (`heartbeat-logging-contract`, `sandbox-boot-guard-ci`) in alphabetical
  position, status from an **actual probe run** (memory: `eval-results-new-probe-row`;
  do NOT wholesale-regen — #452's pick carries a 100-line RESULTS timestamp churn
  that `-Xours` correctly discards).
- **`wiki/README.md` — untouched.** No wave-1 PR adds a `wiki/<slug>.md` entry.

## Verification

```bash
W=.worktrees/task/sync-upstream-20260619
# 1. Full suite — no green->red regression vs origin baseline.
fails=0
for p in "$W"/evals/probes/*.sh; do
  bash "$p" >/dev/null 2>&1; rc=$?
  case $rc in 0) : ;; 2) echo "SKIPPED $(basename "$p")" ;; *) echo "REGRESSION $(basename "$p")"; fails=1 ;; esac
done
echo "regressions=$fails"   # MUST be 0
# 2. The 2 net-new probes PASS (fills RESULTS status):
for p in heartbeat-logging-contract sandbox-boot-guard-ci; do
  bash "$W/evals/probes/$p.sh"; echo "$p -> $?"   # expect 0
done
```

Then: reconcile commit → `git push -u origin task/sync-upstream-20260619` →
`gh pr create --base development --repo ryaneggz/openharness` → `/ci-status`.

## Base / stacking note

Wave-1 branches off `origin/development` (bafe2fb), **independent of PR #255**
(the 06-18 sync, still open). Both PRs touch `CHANGELOG.md` and `evals/RESULTS.md`,
so whichever merges second will hit a shared-append conflict (memory:
`shared-append-file-rebase-conflicts`); `/pr-audit` catches CONFLICTING before
merge and it is resolved by rebase + union. This is expected and non-blocking.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE — this is a mechanical upstream→origin cherry-pick
  sync; the imported PRs carry their own docs/probes, and no wave-1 PR introduces
  a new harness mechanism that origin's wiki must describe. (`#462`, which *does*
  add a capability-benchmark subsystem + `context/REPO_MAP.md`, is deferred to
  wave 2; its wiki alignment is handled there.)
