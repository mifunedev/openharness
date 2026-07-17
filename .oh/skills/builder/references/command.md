# Task-Style Command Skill Builder

Author a deliberate, user-invoked workflow as a skill. The public type remains
`command` because users experience it as `/<name>`, but the artifact is always
`.oh/skills/<name>/SKILL.md` in Open Harness. Never create
`.claude/commands/<name>.md` or another legacy command file.

## Contents

1. [Choose a task-style skill](#choose-a-task-style-skill)
2. [Model side effects](#model-side-effects)
3. [Frontmatter](#frontmatter)
4. [Authoring protocol](#authoring-protocol)
5. [Arguments and scripts](#arguments-and-scripts)
6. [Validate](#validate)
7. [Report](#report)

## Choose a task-style skill

Use this type for an on-demand procedure that performs a recognizable job from
input to reported result: deploy, release, publish, sync, migrate, scaffold, sweep,
or triage. Use `/builder skill` for knowledge Claude should apply inline while
working. Use an agent for a reusable specialist identity with isolated context.

A task-style skill should have:

- an explicit invocation and accurate argument hint;
- ordered or conditionally ordered actions;
- named side effects and safety gates;
- terminal success, failure, blocked, and no-op outcomes;
- validation that checks real state rather than trusting command exit text alone.

## Model side effects

Classify every operation before writing:

| Class | Examples | Required treatment |
|-------|----------|--------------------|
| Read-only | inspect status, query an API, render a report | May be model-invocable when triggers are unambiguous. |
| Reversible mutation | create branch, edit generated draft, start disposable process | State the rollback and validate the resulting state. |
| External or consequential mutation | push, publish, post, deploy, close, destroy | Prefer `disable-model-invocation: true`; require explicit user intent and the smallest permission scope. |
| Irreversible or destructive | delete data, revoke access, force rewrite | Add a final confirmation immediately before the action and fail closed on ambiguity. |

`allowed-tools` pre-approves matching tools; it is not an allowlist. Scope Bash
patterns narrowly where the runtime supports them, and do not claim they block
other commands. Behavioral safety instructions and repository permissions remain
necessary.

## Frontmatter

Use the task-skill subset:

```yaml
---
name: deploy-preview
description: |
  Deploy the current branch to the preview environment and verify its health.
  TRIGGER when: the user explicitly asks to deploy or refresh a preview.
argument-hint: "[environment]"
arguments: [environment]
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(gh *)
---
```

Guidance:

- Include `name` and a trigger-rich `description`.
- Make `argument-hint` match accepted syntax exactly.
- Use `arguments` for stable positional fields and reference each variable in the
  body. Otherwise use `$ARGUMENTS` deliberately.
- Set `disable-model-invocation: true` for consequential side effects or when only
  explicit slash invocation is safe.
- Omit `model` to inherit unless the workflow has a stable model requirement.
- Use `context: fork` only when intermediate work would pollute the parent and the
  body is a self-contained task prompt. Select an existing agent explicitly only
  when its role fits.
- Add `paths:` rarely; file-triggered loading is usually a reference-skill concern.

## Authoring protocol

1. Define accepted input, preconditions, side effects, terminal states, and rollback
   behavior.
2. Inspect neighboring task-style skills and any shared scripts they intentionally
   compose.
3. Decide what must be deterministic. Put parsing, repeated command sequences, and
   exact validation in `scripts/`; keep judgment and branching instructions in
   SKILL.md.
4. Write the procedure in execution order:
   - parse and validate arguments;
   - inspect prerequisites and current state;
   - stop safely on missing authority, ambiguity, or dirty state;
   - perform the smallest mutation;
   - verify external and local postconditions;
   - report a single clear terminal result.
5. Make no-op and idempotent behavior explicit so retries do not duplicate effects.
6. Use arrays and quoted variables in shell examples. Avoid `eval`, raw string-built
   commands, unbounded polling, and secret-bearing argv.
7. Use `LoopCreate` or `MonitorCreate` conventions when the host runtime owns
   scheduling or long-running processes; do not embed unbounded `while`/`sleep`
   polling in the skill.
8. Add realistic invocation examples for normal, invalid, and recovery paths.

## Arguments and scripts

- `$ARGUMENTS`: full input string. Use when syntax is naturally free-form.
- `$0`, `$1`, or named arguments: use for stable positional syntax.
- `${CLAUDE_SKILL_DIR}`: canonical base for bundled scripts and assets.
- Shell injection: reserve for fast state needed at load time; do not use it for
  mutations, secrets, or slow network calls.

Bundled shell scripts must:

- start with `#!/usr/bin/env bash` and `set -euo pipefail`;
- resolve repository paths from their own location or a documented root resolver;
- distinguish invalid usage, blocked state, no-op, and failure with useful stderr;
- use bounded timeouts for external calls;
- be executable and tested against real non-destructive state;
- never depend on a provider mirror path when the `.oh/` source is canonical.

## Validate

- [ ] Artifact is `.oh/skills/<name>/SKILL.md`, never `.claude/commands/`.
- [ ] `/<name>` syntax and `argument-hint` agree with the parser.
- [ ] Every argument variable is wired and every example uses valid syntax.
- [ ] Side effects, confirmation gates, rollback, idempotency, and terminal states
      are explicit.
- [ ] Consequential workflows are manual-only unless autonomous invocation is
      specifically justified.
- [ ] `allowed-tools` is narrow and not described as an enforcement boundary.
- [ ] Commands quote variables, avoid secrets in argv, and use bounded waits.
- [ ] Scripts are executable, self-contained, and pass direct checks.
- [ ] SKILL.md is below 500 lines; long material is one reference level deep.
- [ ] A dry or read-only validation path has been run before reporting success.

## Report

```markdown
## Command Skill Created: <name>

**File**: `.oh/skills/<name>/SKILL.md`
**Invocation**: `/<name> <argument-hint>`
**Side effects**: <what changes and confirmation policy>
**Auto-invocable**: <yes/no and why>
**Resources**: <scripts/references/assets or none>
**Validation**: <checks and results>
```
