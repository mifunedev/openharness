# Objective context — First Mate role charter

## Operator-supplied concept definition (verbatim)

In **AI harness engineering**, a **First Mate** can describe the agent that serves as the user's trusted operational second-in-command.

It does not perform every specialized task itself. Instead, it:

* interprets the user's objective,
* decomposes complex work,
* delegates to specialized agents,
* assigns reasoning effort based on task complexity,
* tracks shared state and dependencies,
* validates the delegates' results,
* resolves conflicts or requests rework,
* returns one coherent, evidence-backed answer.

The metaphor works because the **user is the captain**, the **First Mate coordinates execution**, and the **specialist agents are the crew**.

A concise definition:

> **First Mate:** A supervisory agent that preserves the user's intent while coordinating, evaluating, and integrating work performed by specialized agents.

A more technical version:

> **First Mate is the harness-level orchestration agent responsible for adaptive task decomposition, specialist routing, execution supervision, verification, and final synthesis.**

This sits within harness engineering because the harness—not merely the underlying model—controls context, tools, delegation, state, verification, permissions, and observability. ([arXiv][1])

One useful boundary: the First Mate may determine **how** the objective is executed, but should not silently redefine **what** the user asked for.

[1]: https://arxiv.org/abs/2605.13357 "AI Harness Engineering: A Runtime Substrate for Foundation-Model Software Agents"

## Repo facts (gathered by orchestrator)

- `.oh/context/rules/first-mate.md` does NOT exist yet. It is referenced as the "role charter" by all three files in the untracked prompt pack `.oh/prompts/advisor/{plan,implement,pr}.yml`.
- ⟲ OPERATOR EDIT MID-SESSION (16:22, after planning began): `pr.yml` was revised — it now carries the SAME three-warning block as `implement.yml` (byte-identical) and a query list harmonized with `implement.yml` plus a PR tail (`delegate /audit pr`, `/retro auto-approve`, `Ready PR.`). The former steps "2 critics audit" → now "/delegate 2 adversarial critics to audit plan, prd.md, and prd.json alignment and correctness."; the former "implement opus delegate fan out … per first-mate.md § Effort Scaling" step was REMOVED. As of 16:36 no `Effort Scaling` or `opus` string appears anywhere in the pack; the charter's `## Effort Scaling` section remains mandated by this file's Deliverable and motivated by the `role` text ("scaling their reasoning effort to match each task's complexity"). File hashes at spec-freeze: implement.yml bb02c129…, plan.yml 932fa0d0…, pr.yml 019e9f5c… — re-hash before committing; the operator may edit again.
- Warning-block ground truth: `implement.yml` and `pr.yml` share byte-identical 3-item `warning:` blocks (delegate not DONE until progress entry + user story updated; serial briefings informed by progress.txt; task artifacts in `.oh/tasks/[task-name]/*`); `plan.yml` has none.
- `.oh/context/rules/` currently contains only `git.md` (a pointer). Per root CLAUDE.md, the always-loaded rules tier was collapsed (B-state M4): task-triggered norms became on-demand skills; the advisor-delegation norm became the `advisor` agent (`.oh/agents/advisor.md`).
- A Pi-side prompt `.pi/prompts/advisor/pr.md` mirroring the pr.yml step list exists ONLY on the old `feat/sandbox-ssh-config-persistence` branch (commit 2758cedf) — it is NOT present on this task's branch or on `upstream/development`. Do not cite it as an existing file; describe the yml↔Pi-md rendering convention conditionally.
- Work branch: `feat/660-first-mate-charter` off `upstream/development` (mifunedev); issue #660. `CLAUDE.md` is a symlink to `AGENTS.md` — edit `AGENTS.md`.
- Post-sync policy note: `.oh/skills/builder/references/rule.md` declares `.oh/context/rules/` a compatibility-pointer-only surface. The charter's path is the operator's fixed WHAT and is a deliberate, surfaced exception (see plan.md DP-0).

## Deliverable (WHAT — do not redefine)

1. Author the First Mate role charter at `.oh/context/rules/first-mate.md`, faithful to the operator's definition above, including an `## Effort Scaling` section that maps subtask complexity → delegate reasoning effort/model tier.
2. Land the `.oh/prompts/advisor/` prompt pack in git alongside the charter, with its references resolving.
