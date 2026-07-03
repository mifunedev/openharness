# Descriptive `.oh/harness.yml` example

This page shows the smallest useful shape a human-readable `.oh/harness.yml`
file could take if a project wants a local manifest. It is **descriptive, not
normative**: Open Harness does not require this file, does not validate this
shape, and does not treat it as a registry-backed schema or conformance target.

The real runtime configuration file today is the repo-root `harness.yaml`,
generated from [`harness.yaml.example`](../../harness.yaml.example) and read by
[`harness-config.sh`](../scripts/harness-config.sh). That file controls sandbox
settings. The example below is only a pointer map over the existing `.oh/`
control-plane surfaces described in the [`.oh/` directory layout](oh-directory-layout.md).

## Minimal example

```yaml
# .oh/harness.yml — example only; not required or read by Open Harness.
name: openharness
version: 1

agents:
  definitions: .oh/agents/
  skills: .oh/skills/
  hooks: .oh/hooks/

loops:
  schedules: .oh/crons/
  ralph: .oh/scripts/ralph.sh
  task_artifacts: .oh/tasks/

policies:
  operator_instructions: AGENTS.md
  git_workflow: .oh/skills/git/SKILL.md
  security_hooks: .oh/hooks/
```

## How to read the example

- `name` and `version` are plain labels for humans. They do not imply a manifest
  version registry.
- `agents` points at the real provider-portable primitive pack: agent
  definitions, skills, and hooks already live under `.oh/`.
- `loops` points at today's loop machinery: scheduled cron prompts, the Ralph
  executor script, and the task artifact directory.
- `policies` points at existing policy surfaces instead of inventing a
  `.oh/policies/` directory: the root instructions file, the git workflow skill,
  and hook-enforced guardrails.

Every path in the example exists today except the illustrative
`.oh/harness.yml` file itself. Adding formal schemas, registries, lifecycle
states, or `OH-Core` / `OH-Dev` conformance profiles remains deferred by
[ADR-0001](rfcs/adr-0001-standards-scope.md).
