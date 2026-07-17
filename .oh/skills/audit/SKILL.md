---
name: audit
description: >-
  Explicit nine-target audit dispatcher for implementation promotability, one PR,
  the open PR queue, harness health, context budget, skill integrity, eval quality,
  drift, and correlated full campaigns. TRIGGER when: audit this task; verify this
  implementation; audit PR N; classify this pull request; audit open PRs; triage
  the PR queue; audit the harness; find harness improvements; audit context budget;
  ablate this context file; audit skills; find stale or broken skills; lint evals;
  find Goodharted probes; check framework drift; cron staleness; run a full audit
  campaign; audit everything; cross-target next actions.
argument-hint: "<implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]"
---

# Audit — explicit target dispatcher

Usage validation happens before any reference is read, run identity is created, or state changes.
The dispatcher never guesses a missing target from prose. Trigger families include:
audit this task; audit PR N; triage the PR queue; audit the harness; audit context budget;
audit skills; lint evals; check framework drift; and full audit campaign.

## Canonical usage

```text
usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]
```

| Target | Invocation | Native result |
|---|---|---|
| `implementation` | `/audit implementation <slug> [--pr N] [--branch B]` | `AUDIT-PASS` / `AUDIT-FAIL` |
| `pr` | `/audit pr <N> [--repo O/N] [--deep] [--proof] [--dry-run]` | `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` / `PR-AUDIT-UNKNOWN` |
| `prs` | `/audit prs [--repo O/N] [filters/actions]` | buckets + `PRS-AUDIT-COMPLETE` / `PRS-AUDIT-PARTIAL` |
| `harness` | `/audit harness [--focus area] [--external URL|path] [actions]` | Tier 1/2/3 + Recommended Next 3 Actions |
| `context` | `/audit context [all|--baseline|--ablate file]` | `KEEP` / `TRIM` / `DEMOTE` / `CUT` |
| `skills` | `/audit skills [all|root|workspace|name]` | `CURRENT` / `STALE` / `BROKEN` / `DELETE` |
| `eval-quality` | `/audit eval-quality [all|probes|capability|id]` | `KEEP` / `GROOM` / `CUT` |
| `drift` | `/audit drift` | per-class `OK` / aggregate `DRIFT:` |
| `full` | `/audit full [--focus area] [--health-target target]` | `AUDIT-CAMPAIGN-COMPLETE` / `AUDIT-CAMPAIGN-PARTIAL` |

For missing/unknown targets or missing required arguments, print the exact usage line and this table, then stop. Exactly these nine cases are public:

| Target | Authoritative route |
|---|---|
| implementation | `references/implementation.md` |
| pr | `references/pr.md` |
| prs | `references/prs.md` |
| harness | `references/harness.md` |
| context | `references/context.md` |
| skills | `references/skills.md` |
| eval-quality | `references/eval-quality.md` |
| drift | `references/drift.md` |
| full | `references/full.md` |

After validation, the outermost invocation resolves and exports immutable `AUDIT_ROOT` from `git rev-parse --show-toplevel`, `AUDIT_LOG_ROOT` from a validated `AUTOPILOT_LOG_ROOT` or the main worktree root, and a fresh opaque `AUDIT_RUN_ID` matching `audit-YYYYMMDDTHHMMSSZ-suffix`. Inherited IDs identify child mode and are never replaced. Read exactly the selected route; supporting scripts/references are private, never targets.

The outer invocation owns temp cleanup and exactly one locked append under
`$AUDIT_LOG_ROOT/.oh/memory/<UTC-date>/log.md`, including failed/partial outcomes.
Children inherit all three variables, return structured observations, and suppress their
own memory/retro append. Native verdicts are preserved; the dispatcher does not normalize them.

Default behavior is report-only except disclosed local state: `/eval` scoreboard,
remote-ref fetches, invocation-scoped temp/recovery files, and the single audit log.
No route may ready or merge a PR. GitHub comments, labels, closes, and external issue
writes require the target's explicit action, exact preview, confirmation, and support dry-run.
