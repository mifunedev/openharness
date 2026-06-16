---
title: "ship-spec Orchestration Boundary"
slug: ship-spec-orchestration
tags: [ship-spec, orchestration, executable-loop, ralph, pr-audit, agent-harness]
created: 2026-06-16
updated: 2026-06-16
sources:
  - raw/2026-06-16-ship-spec-orchestration.md
related: [compound-engineering, inspectable-agent-harness, claude-code-teacher-skill, pi-loop]
confidence: provisional
---

# ship-spec Orchestration Boundary

## Relevant Source Files
- `AGENTS.md:109-149` — defines the eight-phase loop and places `/ship-spec` in phases 1-4.
- `.claude/skills/ship-spec/SKILL.md:16-40` — defines the end-to-end pipeline and the critic-before-commitment ordering.
- `.claude/skills/ship-spec/SKILL.md:287-289` — defines the Advisor/Ralph implementation handoff and the fresh `/pr-audit` undraft gate.
- `scripts/ralph.sh:16` and `scripts/ralph.sh:324-347` — define `STATUS: COMPLETE` as the implementation done sentinel.

## Summary
`/ship-spec` is the harness boundary that turns an idea or plan into an observable, critic-gated implementation run. It covers phases 1-4 of the Open Harness loop for one scoped item, then hands implementation to an Advisor/Ralph path and waits for audit-grade evidence before the PR becomes ready.

## Detail
The top-level loop says `/ship-spec` covers phases 1-4 for a single item: research/spec, plan, implement handoff, and audit gating (`AGENTS.md:111`). It composes lower-level primitives rather than replacing them: `/prd` writes the human-readable spec, two critics review it, `/ralph` converts it to structured task state, GitHub provides issue/branch/PR observability, and the Advisor/Ralph path performs implementation.

The key property is stage ordering. The skill states that critics run before the issue is opened, the branch is created, or anything is pushed (`.claude/skills/ship-spec/SKILL.md:18`). Its pipeline places `/prd`, critics, and critique resolution before the first GitHub-side state change (`.claude/skills/ship-spec/SKILL.md:20-40`). That makes a halted spec reversible and prevents dangling remote artifacts when high-severity findings appear.

The draft PR is an observability checkpoint, not success. The skill opens it while implementation, `/eval`, and `/pr-audit` remain pending (`.claude/skills/ship-spec/SKILL.md:262-289`). Ralph owns the done sentinel: it exits when `progress.txt` or the iteration output contains a whole-line `STATUS: COMPLETE` (`scripts/ralph.sh:324-347`). The PR is marked ready only after implementation completes, eval has no new green-to-red regression, and a fresh `/pr-audit` classifies it promotable (`.claude/skills/ship-spec/SKILL.md:332-338`). It never auto-merges.

Wiki belongs in the same lifecycle when the task changes the harness's conceptual model, names a new mechanism, or clarifies how a skill fits into the system. The provisional entry is the communication surface; the PRD is the work contract. After implementation, the entry should be revised to match what execution proved: final behavior, blocked assumptions, eval/audit evidence, and new cross-links.

## System Relationships

```mermaid
flowchart LR
  Idea["Idea or plan"] --> PRD["/prd<br/>tasks/<slug>/prd.md"]
  PRD --> Critics["Two critics<br/>local-only gate"]
  Critics -->|PROCEED| Remote["GitHub issue<br/>branch<br/>draft PR"]
  Critics -->|HALT| Revise["Revise local spec"]
  Remote --> Ralph["/ralph contract<br/>prd.json prompt progress"]
  Ralph --> Advisor["Advisor in worktree<br/>runs Ralph loop"]
  Advisor --> Done["STATUS: COMPLETE"]
  Done --> Eval["/eval"]
  Eval --> Audit["fresh /pr-audit"]
  Audit -->|promotable| Ready["gh pr ready"]
  Audit -->|blocked| Draft["stay draft<br/>comment resume path"]
```

The boundary is a commitment protocol. Before `PROCEED`, artifacts are local and cheap to revise. After `PROCEED`, `/ship-spec` creates inspectable remote state, but keeps success gated on implementation evidence and audit state.

## See Also
- [[compound-engineering]]
- [[inspectable-agent-harness]]
- [[claude-code-teacher-skill]]
- [[pi-loop]]
