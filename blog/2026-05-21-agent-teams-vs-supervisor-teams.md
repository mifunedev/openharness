---
title: "Agent teams vs. supervisor teams"
description: "Two useful patterns for organizing AI agents: durable peers that own domains, and supervisor-led swarms that finish bounded tasks."
date: 2026-05-21
authors: [ryan]
tags: [agents, architecture, mental-models]
draft: true
---

# Agent teams vs. supervisor teams

Most "multi-agent" conversations collapse two different patterns into one bucket.

One pattern is an **agent team**: several long-lived agents, each with a name, memory, tools, and an area of ownership. They behave like teammates. One watches support. One writes docs. One reviews design. One manages releases. You do not summon them for a single prompt and throw them away. You give them durable context, let them accumulate taste, and route work to the right owner.

The other pattern is a **supervisor team**: one lead agent breaks a problem into pieces, launches short-lived workers, collects their output, and integrates the answer. The workers are not teammates. They are scoped subprocesses. They are useful because they start with fresh context, run in parallel, and return structured findings without carrying long-term state.

Both are valuable. They fail for opposite reasons.

<!-- truncate -->

## The agent team pattern

Use an agent team when the work benefits from ownership over time.

An agent team has durable roles:

- **Product manager** — turns fuzzy requests into issues, acceptance criteria, and release notes.
- **Implementer** — owns the code path and keeps local tooling healthy.
- **Critic** — reviews plans and diffs with permission to say no.
- **Researcher** — reads external docs, examples, and upstream issues before the team commits to a direction.
- **Operator** — watches CI, releases, incidents, and recurring maintenance.

The point is not that each role maps to a different model. The point is that each role has a stable lane. Stable lanes create memory. Memory creates taste. Taste is what lets an agent say, "we tried this shape before and it caused drift," instead of treating every task as day one.

Agent teams work best when they have the same affordances human teams need:

- a shared repo;
- issues and PRs as the work ledger;
- a changelog or decision log;
- clear boundaries for who owns what;
- a way to hand work off without losing context;
- recurring checks for things humans forget.

This is the pattern behind long-lived harness agents. They are not just prompt templates. They are workers with context, rituals, and memory.

## The supervisor team pattern

Use a supervisor team when the work benefits from parallel decomposition.

A supervisor team is a temporary swarm. The supervisor owns the task. Workers own subquestions.

Good examples:

- audit a repository from product, implementation, security, and docs angles;
- compare three possible architectures;
- ask independent critics to review a draft before publishing;
- split a migration plan by subsystem;
- inspect multiple logs or traces at the same time.

The supervisor pattern is powerful because it prevents one context window from becoming the whole room. Each worker can start clean, focus on a narrow question, and return a result the supervisor can compare against the others.

But it is not a substitute for ownership. Short-lived workers do not remember your project history unless the supervisor gives it to them. They do not carry accountability after the turn ends. They can produce excellent observations and still leave integration risk with the supervisor.

That is the trade: supervisor teams buy breadth and parallelism; agent teams buy continuity and accountability.

## A simple decision rule

Ask one question:

> Does this work need memory after the task is done?

If yes, use an agent team.

If no, use a supervisor team.

More practically:

| Situation | Better pattern | Why |
| --- | --- | --- |
| Ongoing docs quality | Agent team | Needs taste, style memory, and repeated passes. |
| One-time docs audit | Supervisor team | Independent reviewers can scan in parallel. |
| Release management | Agent team | Requires continuity, caution, and knowledge of past incidents. |
| Release readiness review | Supervisor team | Multiple critics can check CI, changelog, docs, and packaging independently. |
| Product roadmap ownership | Agent team | Benefits from durable prioritization memory. |
| Roadmap brainstorming | Supervisor team | Benefits from divergent expert perspectives. |
| Debugging one incident | Supervisor team | Split logs, configs, recent diffs, and hypotheses. |
| Owning incident response over months | Agent team | Needs pattern recognition and follow-up discipline. |

## The hybrid is the real workflow

The strongest setup uses both patterns.

A long-lived agent owns a lane. When the lane has a complex problem, that agent acts as supervisor and launches temporary workers.

For example:

1. The release agent notices a release is blocked.
2. It launches short-lived workers: CI investigator, changelog auditor, package verifier, docs checker.
3. It collects their reports.
4. It decides what to fix.
5. It updates the release issue and carries the lesson forward.

The workers gave breadth. The release agent kept accountability.

That is the pattern I trust most: **durable owners supervising disposable specialists**.

## Failure modes

Agent teams fail when every agent becomes a generalist with a cute name. If nobody owns a lane, the team is ceremony without leverage. Durable agents need authority, memory, and a reason to exist.

Supervisor teams fail when the supervisor delegates integration away. Parallel workers can find pieces of the truth, but somebody has to reconcile contradictions, choose the plan, and own the final diff.

The fix is structural:

- Give long-lived agents narrow domains.
- Give short-lived workers narrow questions.
- Make return formats explicit.
- Keep the supervisor responsible for synthesis.
- Promote recurring work into an agent lane only after it proves it needs memory.

## The takeaway

"Multi-agent" is not one architecture.

There are **agent teams**: durable peers with ownership and memory.

There are **supervisor teams**: temporary swarms coordinated by one accountable lead.

Use agent teams for continuity. Use supervisor teams for parallelism. Combine them when the work is important enough to need both.
