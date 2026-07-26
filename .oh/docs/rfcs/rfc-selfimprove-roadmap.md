# RFC: Self-improving harness roadmap curation

Status: Draft curation for [#525](https://github.com/mifunedev/openharness/issues/525).

This document turns #525's broad roadmap epic into proposed child issues a
maintainer can file. It is intentionally a planning artifact: this loop does not
create GitHub issues, implement trace capture, or wire any runtime self-editing
behavior.

## Curation principles

- Land observation first. Weakness mining, proposals, repair operators, and
  benchmark gates need a normalized trace substrate before they can be reliable.
- Keep each child issue buildable. A child should describe one deliverable with a
  clear validation surface, not another open-ended research epic.
- Preserve human control. Anything that expands authority, touches secrets, or
  publishes externally remains explicitly human-gated.
- Keep comparison rigs optional. Core Open Harness stays one project / one
  sandbox; multi-agent comparisons can become a separate pack if they prove
  useful.

## Proposed child issues

These are proposed issues for a human maintainer to file and prioritize. No
GitHub issues were created by this Ralph loop.

| Priority | Proposed child-issue title | One-line deliverable | Dependency | Size |
|---|---|---|---|---|
| 1 | RFC: Normalized trace / event ledger | Document the append-only event model, storage location, secret/privacy rules, replay-required events, and a minimal JSONL example. | None | M |
| 2 | Implement durable run IDs and trace storage layout | Add the stable run/session identifiers and on-disk trace directories needed before providers can emit normalized events. | Trace/event ledger RFC | M |
| 3 | Emit normalized trace events from core runners | Map Ralph, autopilot/spec, shell commands, git actions, validations, and handoff statuses into the ledger without storing secrets. | Durable run IDs + trace storage layout | L |
| 4 | Diagnostic report artifact for failed or inefficient runs | Produce a durable report that names the failing step, harness layer, artifact change, hidden tool error, and malformed terminal status behind a run outcome. | Normalized trace events | M |
| 5 | Artifact contract declaration and audit enforcement | Let task specs declare required artifacts, allowed locations, destructive-edit constraints, verification commands, rollback conditions, and final handoff requirements; fail audit when they are missing or unverifiable. | Trace/event ledger RFC; diagnostic report format | M |
| 6 | Weakness mining from trace + diagnostic corpora | Cluster repeated failures or inefficiencies into weakness records with frequency, affected agents, likely harness layer, supporting traces, and recommended repair surface. | Normalized trace events; diagnostic reports; artifact contracts | L |
| 7 | Scoped repair-operator registry | Define safe-by-default, stronger-gate, and human-approval-required repair classes that proposal generation and audit can enforce. | Trace/event ledger RFC | M |
| 8 | Formal harness proposal generator | Convert a mined weakness into a bounded patch proposal with allowed files, expected capability impact, regression risks, validation plan, rollback plan, and promotion gate. | Weakness mining; repair-operator registry | M |
| 9 | Automated capability benchmark runner | Execute capability tasks, compare against baseline/counterfactual results, score success/cost-time/unattended completion, and emit a durable result artifact. | Existing capability benchmark specs; trace/event ledger recommended | L |
| 10 | Promotion gate tying proposals to eval + benchmark evidence | Require proposed harness repairs to pass the regression floor and either improve or justifiably hold the capability ceiling before calling them beneficial. | Proposal generator; benchmark runner | M |
| 11 | Eval-lint / anti-Goodhart instrument grooming | Detect stale, duplicate, always-skipped, overfit, or too-easy probes and benchmark tasks before self-improvement optimizes against them. | Benchmark runner; eval probe inventory | M |
| 12 | Per-agent harness profiles | Summarize each supported agent's strengths, repeated failure modes, retry policy, artifact-contract policy, context-budget strategy, and validation gates from observed traces. | Weakness mining; normalized per-agent traces | M |
| 13 | Optional multi-agent comparison/eval pack | Prototype an external pack that runs the same task across supported agents, normalizes traces, compares success/cost/time/unattended completion, and proposes profile updates. | Trace/event ledger; per-agent profiles | L |

## Dependency spine

```text
trace/event ledger RFC
  → durable run IDs + storage layout
  → normalized trace event emission
  → diagnostic reports + artifact contracts
  → weakness mining
  → repair registry + proposal generator
  → benchmark/promotion gates + `/audit eval-quality`
  → per-agent profiles
  → optional comparison/eval pack
```

The first child issue is intentionally descriptive. It establishes vocabulary and
storage expectations so later implementation issues do not invent incompatible
trace shapes.
