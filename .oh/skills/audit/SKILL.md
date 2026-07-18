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
| `implementation` | `/audit implementation <slug> [--pr N --repo O/N] [--base B] [--branch B]` | `AUDIT-PASS` / `AUDIT-FAIL` |
| `pr` | `/audit pr <N> [--repo O/N] [--base B] [--deep] [--proof] [--dry-run]` | `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` / `PR-AUDIT-UNKNOWN` |
| `prs` | `/audit prs [--repo O/N] [filters/actions]` | buckets + `PRS-AUDIT-COMPLETE` / `PRS-AUDIT-PARTIAL` |
| `harness` | `/audit harness [--focus area] [--external URL|path] [actions]` | Tier 1/2/3 + Recommended Next 3 Actions |
| `context` | `/audit context [all|--baseline|--ablate file]` | `KEEP` / `TRIM` / `DEMOTE` / `CUT` |
| `skills` | `/audit skills [all|root|workspace|name]` | `CURRENT` / `STALE` / `BROKEN` / `DELETE` |
| `eval-quality` | `/audit eval-quality [all|probes|capability|id]` | `KEEP` / `GROOM` / `CUT` |
| `drift` | `/audit drift` | per-class `OK` / aggregate `DRIFT:` |
| `full` | `/audit full [--repo O/N] [--focus area] [--health-target target]` | `AUDIT-CAMPAIGN-COMPLETE` / `AUDIT-CAMPAIGN-PARTIAL` |

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

Use the executable lifecycle boundary
`$AUDIT_ROOT/.oh/skills/audit/scripts/audit-run.sh <target> [target options] -- <route-driver>`
for every valid invocation. The route driver is mandatory and is the actual selected-target
execution (not a preflight command); it reads the exported `AUDIT_ROUTE`. The boundary
validates all target arguments and the driver before lifecycle creation, resolves and exports
immutable `AUDIT_ROOT`, `AUDIT_LOG_ROOT`, and `AUDIT_RUN_ID`, maps the target to exactly one
route, supplies invocation-scoped `AUDIT_TMP_ROOT` and `AUDIT_EVIDENCE_PATH`, changes to
`AUDIT_ROOT`, and invokes the driver with `<target> <validated-target-args...>` verbatim
(also exporting `AUDIT_TARGET` and `AUDIT_TARGET_ARGS_JSON`). It keeps the lifecycle open
while the driver runs, forwards TERM/INT/HUP to the complete child process group, waits for
termination, and performs exactly one locked terminal append (`complete`, `failed`, or
`interrupted`, with the nonzero exit) after that driver exits.

Exit zero is transport success, never completion evidence. Before logging `complete`, the
boundary requires an atomic schema-v1 evidence file bound to the exact `AUDIT_RUN_ID`, target,
validated target-argument array, terminal `state: complete`, and native machine verdict. A
no-op such as `-- true`, stale evidence, a symlink, or mismatched target fails closed. Scripted
routes publish it with `scripts/audit-evidence.sh complete <NATIVE-VERDICT>` only after their
checks finish.

For the normal inline-agent protocol, use the shipped production driver; do not substitute a
preflight callback:

```bash
ROOT=$(git rev-parse --show-toplevel)
AUDIT_AGENT_COMMAND_JSON='["claude","-p","--output-format","text"]' \
  "$ROOT/.oh/skills/audit/scripts/audit-run.sh" \
  implementation <slug> --pr <N> --repo <owner/name> -- \
  "$ROOT/.oh/skills/audit/scripts/route-driver.sh"
```

The driver supplies the selected route and correlated bindings to that agent, requires its
final `AUDIT-EVIDENCE: <NATIVE-VERDICT>` line, and atomically publishes the evidence contract.
Set `AUDIT_AGENT_COMMAND_JSON` to the equivalent non-interactive argv for another provider.
Non-scriptable protocols that cannot run this driver or publish valid evidence fail closed.
Do not run the boundary merely to obtain environment JSON and then execute route work outside
it. An inherited ID identifies child mode and is never replaced or independently logged. The
generated ID matches `audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+`.

Read exactly the route returned by that boundary; supporting scripts/references are private,
never targets. Children inherit all roots and the ID, return structured observations, and
suppress their own memory/retro append. Native verdicts are preserved; the dispatcher does
not normalize them.

Default behavior is report-only except disclosed local state: `/eval` scoreboard,
remote-ref fetches, invocation-scoped temp/recovery files, and the single audit log.
No route may ready or merge a PR. GitHub comments, labels, closes, and external issue
writes require the target's explicit action, exact preview, confirmation, and support dry-run.
