---
title: "How Open Harness embodies compound engineering"
description: "A name finally landed on the thing the harness was already doing — every fix it makes leaves the next one easier. Here's where that lives in the code, and where it can go wrong."
date: 2026-06-04
authors: [ryan]
tags: [agents, compound-engineering, ai-engineering]
slug: compound-engineering
---

A few weeks ago I read [Every's compound-engineering guide](https://every.to/guides/compound-engineering) and had the slightly deflating experience of seeing someone name the thing I'd been building without a name for it. The core idea, as they put it, is that **"each unit of engineering work should make subsequent units easier—not harder."** Most codebases drift the other way: every feature injects complexity, and the system you work in gets worse the more you ship into it.

I read that and thought: that's the entire point of the harness. Not as a feature I should add — as the constraint that already shapes every file in it.

So this is a post about a concrete, working instance of compound engineering. Not the philosophy in the abstract — the actual files that make it true, and, because I'd rather be useful than breathless, the documented ways it goes wrong.

<!-- truncate -->

## A note on the name

Credit where it's due. The term comes from Kieran Klaassen at Every. The originating essay (August 2025, "My AI Had Already Fixed the Code Before I Saw It") actually spelled it **"compounding engineering"** — "building self-improving development systems where each iteration makes the next one faster, safer, and better" — and the canonical spelling later standardized to "compound engineering" in Every's guide. The line that stuck with me: *"AI engineering makes you faster today. Compounding engineering makes you faster tomorrow, and each day after."*

The guide also puts a number on the discipline: roughly **half** of engineering time goes to building features, and the other **half** goes to improving the system itself — review agents, documented patterns, test generators. That fifty-fifty split is the part people skip. It's also the part the harness is structurally built around.

## Where it lives in the harness

Open Harness is an orchestrator that manages a sandboxed coding agent. Here are the mechanisms that make "every unit of work improves the system" literally true, with file pointers so you can check my work.

**Append-only memory.** Every skill or agent run ends with the [Memory Improvement Protocol](https://github.com/mifunedev/openharness/blob/main/context/rules/memory.md): log the outcome, run a *qualify* pass ("did this reveal a constraint not captured in any rule?"), then promote the durable lessons to [`memory/MEMORY.md`](https://github.com/mifunedev/openharness/blob/main/memory/MEMORY.md). That's Klaassen's "teach the system rather than doing the work yourself," made into a checklist the agent can't skip. The session that produced *this* post left a lesson in memory about it — the loop closing on itself.

**Safety nets, not review processes.** The harness has a hard rule in [`context/IDENTITY.md`](https://github.com/mifunedev/openharness/blob/main/context/IDENTITY.md): anything destructive — file deletion, branch deletion, PR closure — routes through a critic sub-agent *first*, and the risk assessment lands in the commit body. It's not a manual review you might forget; it's a gate the pipeline runs into.

**Every regression becomes a permanent guardrail.** IDENTITY.md states the maintenance principle plainly: "Every regression caught becomes a permanent test." For this orchestrator that test takes the form of an accreting file, [`.claude/protected-paths.txt`](https://github.com/mifunedev/openharness/blob/main/.claude/protected-paths.txt). Here's the concrete story behind it: a "cleanup" pass once reasoned six skills were undefensible and deleted them — `ralph`, `prd`, `harness-audit`, `skill-lint`, `delegate`, `strategic-proposal` — all of which the orchestrator actively used. The fix wasn't "be more careful." It was a list of load-bearing paths that critics may not propose deleting without an explicit override. That list only grows. The harness gets *more* stable over time, not less.

**Parallel and long-running orchestration.** The guide's "use long-running orchestration" maps onto the [`/delegate`](https://github.com/mifunedev/openharness/blob/main/.claude/skills/delegate) skill and [`context/rules/recursive-delegation.md`](https://github.com/mifunedev/openharness/blob/main/context/rules/recursive-delegation.md), which decompose a plan into waves of specialized sub-agents — with explicit depth and step budgets, because unbounded recursion burns money silently.

Four mechanisms, one shape: each one makes the system better at its next task. None of them are features for the end user. They're the other half of the fifty-fifty.

## The part the hype skips

Compound engineering has failure modes, and they're well documented enough that pretending otherwise would be dishonest.

The first is **codifying the wrong lesson**. A self-improving system that learns the wrong thing improves in the wrong direction, fast. A bad rule promoted to memory doesn't just sit there — every future run inherits it. The harness's defense is that the qualify pass and the critic gate sit *between* observation and codification. A lesson has to survive review before it becomes a default, and destructive moves have to survive a critic before they ship.

The second is **context bloat** — instruction sets that grow until they're noise, every run dragging more unpruned guidance. The lean-context principle from the origin essay is exactly the worry. The harness's answer is its stated core principle, from IDENTITY.md: **"Simplicity is beauty, complexity is pain. Every folder, every skill, every abstraction earns its place by having a distinct lifecycle and a real failure mode it prevents."**

The honest test came up while writing this. The natural move was to add a new `compound-engineering` rule file to the harness — codify the philosophy, make it a default. I didn't. The concept only *names* mechanisms the harness already enforces; a rule would duplicate them and add load-bearing text that earns nothing. So it lives as an in-repo wiki note and this post, not as another always-loaded instruction. Choosing *not* to add the file is itself the principle working. A system that compounds has to be able to say no to its own growth.

## Try it

If you want to see compound engineering as running code instead of a manifesto, the harness is open. Start at the [installation guide](/docs/installation) or jump straight to the [quickstart](/docs/quickstart). Clone it, read `context/IDENTITY.md` and `context/rules/memory.md`, and watch what the agent leaves behind after a session — that residue is the whole idea.

The code was never really the point. The system that writes the next code is.
