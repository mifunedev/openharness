---
title: "Claude Code Teacher Skill"
slug: claude-code-teacher-skill
tags: [claude-code, education, skills, ai-assisted-coding]
created: 2026-06-15
updated: 2026-06-16
sources:
  - raw/2026-06-15-claude-code-teacher-skill.md
related: [inspectable-agent-harness, learn-harness-engineering]
confidence: provisional
---

# Claude Code Teacher Skill

## Summary
A "teacher" prompt/skill turns a Claude Code coding session into an active learning checkpoint after implementation. Instead of accepting opaque generated code, the assistant maintains a checklist of what the human should understand, quizzes them, and keeps the session open until they can explain the change back.

## Detail
The source pattern came from a LinkedIn post by Abhishek Ray pointing to a prompt gist by ThariqS. The motivation is a common AI-coding failure mode: the agent can ship code faster than the human can build a mental model of the problem, design, edge cases, and broader impact. The corrective technique is to explicitly switch the assistant from implementer to teacher after a task.

Core mechanics:
- Start with the human restating their current understanding, so the assistant diagnoses gaps instead of lecturing generically.
- Keep a running markdown checklist of things the human should understand: the original problem and why it existed; the solution and design decisions; edge cases; and what the change affects.
- Teach both high-level motivation and low-level details such as business logic, branches, tests, and debugger traces.
- Drill into "why", "what", and "how"; support ELI5/ELI14/intern-level explanations when needed.
- Use open-ended and multiple-choice questions, varying answer order and withholding answers until responses are submitted.
- Do not end the session until the human demonstrates mastery of the checklist.

As a reusable skill, this is useful after Claude Code, Codex, or any coding agent completes non-trivial work. It complements inspection-oriented agent harness practices: the artifact is not just working code, but a verified transfer of understanding from agent output back to the operator.

In Open Harness, this pattern is now represented by `/teach`: a post-implementation communication pass that reads task artifacts (`tasks/<slug>/prd.md`, `progress.txt`, eval/audit evidence) and the relevant wiki entry before explaining a shipped change. `/teach` is paired with `/ship-spec`'s provisional task/wiki model and `/orchestrate`'s final loop understanding: if execution changed the provisional model, it revises or proposes wiki updates first, then teaches the concise mental model, what changed, why it matters, verification evidence, caveats, and 2-4 understanding checks. It is explicitly not an implementation, audit, merge, or retro gate.

## See Also
- [[inspectable-agent-harness]]
- [[learn-harness-engineering]]
