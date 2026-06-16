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

## Summary
`/ship-spec` is the harness boundary that turns an idea or plan into an observable, critic-gated implementation run. It also creates the first wiki-grade shared-understanding artifact for the task: a provisional account of how the skill, feature, or change fits into the broader system, revised after `/orchestrate` learns from execution.

## Detail
In the broader Open Harness system, `/ship-spec` covers the first half of the executable loop for one scoped item: research/spec, plan, implementation handoff, and audit gating. It composes lower-level primitives rather than replacing them: `/prd` writes the human-readable spec, two critics review it before commitment, `/ralph` converts it to a structured task graph, GitHub issue/branch/PR provide external observability, and the Advisor/Ralph handoff performs the implementation in an isolated worktree.

The key system property is stage ordering. Stages 1-4 are local-only: `prd.md`, `critique.md`, and a provisional wiki synthesis can be revised or deleted without leaving GitHub state behind. Only after the critic gate returns `PROCEED` does `/ship-spec` open an issue, create a branch, write the four-file Ralph contract, and open a draft PR. That ordering implements the harness principle "critic-gate before destructive actions" and prevents dangling remote artifacts when a spec has high-severity flaws.

The draft PR is an observability checkpoint, not success. After scaffolding, `/ship-spec` hands work to an Advisor session that runs the Ralph loop (`scripts/ralph.sh`), watches `progress.txt` for `STATUS: COMPLETE`, runs `/eval`, then delegates a fresh `/pr-audit` classification. The PR is marked ready only when implementation is complete, eval has no new green-to-red regression, and the audit says the PR is promotable. It never auto-merges.

Wiki belongs in the same lifecycle. `/ship-spec` should create or update a provisional wiki entry when the task changes the harness's conceptual model, names a new mechanism, or clarifies how an existing skill fits into the system. After implementation, `/orchestrate` revises that entry to match what execution actually proved: final behavior, blocked assumptions, eval/audit evidence, and any new links. The wiki entry is the communication surface; the PRD is the work contract.

This connects to the teaching layer. A teacher-style post-implementation pass uses the wiki entry to optimize communication: it gives the operator and later agents a concise mental model before drilling into code, tradeoffs, and verification. The durable artifact is not just the merged change, but the updated shared understanding that makes the next handoff cheaper.

This makes `/ship-spec` a compound-engineering mechanism: every run leaves durable artifacts (`tasks/<slug>/prd.md`, `prd.json`, `critique.md`, `prompt.md`, `progress.txt`), review evidence, wiki synthesis, resumable state, and a PR trail. The skill sits between the harness's always-on self-improvement loop and individual implementation workers, providing the commitment protocol that keeps autonomous execution inspectable and reversible.

## See Also
- [[compound-engineering]]
- [[inspectable-agent-harness]]
- [[claude-code-teacher-skill]]
- [[pi-loop]]
