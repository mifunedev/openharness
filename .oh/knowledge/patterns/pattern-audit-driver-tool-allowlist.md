---
title: "A non-interactive audit driver without a tool allowlist reports every gate as unobtainable"
slug: pattern-audit-driver-tool-allowlist
kind: pattern
tags: [audit, spec, claude-p, permissions, allowlist, false-failure, verification-environment]
created: 2026-09-02
updated: 2026-09-02
sources:
  - .oh/skills/audit/SKILL.md@0fe00420
  - .oh/skills/audit/scripts/route-driver.sh@0fe00420
  - .oh/tasks/one-door/evidence.md@c20ea4b8
confidence: provisional
---

# A non-interactive audit driver without a tool allowlist reports every gate as unobtainable

## Relevant Source Files
- `.oh/skills/audit/SKILL.md` — the shipped driver example, `["claude","-p","--output-format","text"]`, carries no tool allowlist.
- `.oh/skills/audit/scripts/route-driver.sh` — appends the route prompt as positional arguments after the command array.
- `.oh/tasks/one-door/evidence.md` — the run that hit it: two failed audits, one pass.

## Summary
The audit boundary launches the route in a fresh `claude -p` process with the
lifecycle variables scrubbed. Without an explicit tool allowlist that process
cannot run `bash` or `gh`, so the eval floor, the PR classifier, and the slop
metrics are all "unobtainable" and the route fails closed at gate 2 even though
the implementation is green. The failure looks like a stale eval record.

## Detail
**Symptom.** `/audit implementation` returns `AUDIT-FAIL (gate 2: regression
floor — signal unobtainable)` and notes that the same permission boundary blocks
`gh` and the classifier helper. The verdict names a stale `eval-result.json`
commit as the reason, which sends the operator to refresh the record; the refreshed
record fails the same way because the driver still cannot execute anything.

**Root cause.** The shipped example command has no `--allowedTools`, and a
non-interactive session defaults to denying tool use it cannot prompt for. The
route is written as bash gates (`implementation-gates.sh gate1`, the eval runner,
`classify-pr`, `slop-metrics`), so every gate after the file reads depends on
`Bash`. A second trap: the driver appends the prompt as positional arguments, so a
space-separated `--allowedTools Bash Read Glob Grep` consumes the prompt's first
lines as tool names (`Ignoring --allowedTools rule "**Observation**:"`) and the run
fails at startup.

**Workaround.** Pass the allowlist as one token in the command array:
`AUDIT_AGENT_COMMAND_JSON='["claude","-p","--output-format","text","--allowedTools=Bash,Read,Glob,Grep"]'`.
Read-only routes need nothing wider; do not reach for a permissions bypass flag,
which the auto-mode classifier refuses and which grants more than the route uses.
The example in `.oh/skills/audit/SKILL.md` should carry the allowlist so the next
caller does not rediscover this; that edit is a skill change and belongs to a
`/builder` proposal, not to this page.

## See Also
- [[pattern-spec-self-staling-reuse-record]]
- [[pattern-evals-unexercised-oracle]]
