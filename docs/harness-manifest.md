# Descriptive `.oh/harness.yml` example

This page shows the smallest useful shape a human-readable `.oh/harness.yml`
file could take if a project wants a local manifest. It is **descriptive, not
normative**: Open Harness does not require this file, does not validate this
shape, and does not treat it as a registry-backed schema or conformance target.

The real runtime configuration surfaces today are the tracked
[`oh.json`](../oh.json) at the repository root, which holds every non-secret
setting, and the gitignored root `.env`, which holds only secrets and is
documented by the tracked [`.env.example`](../.env.example). Both are read by
[`docker-compose.sh`](../.oh/scripts/docker-compose.sh); the field reference is
[Configuration](configuration.md). The example below is only a pointer map over the existing `.oh/`
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
  schedules: crons/
  task_artifacts: .oh/tasks/

policies:
  operator_instructions: AGENTS.md
  git_workflow: .oh/skills/git/SKILL.md
  security_hooks: .oh/hooks/                       # secret-exposure guards
  destructive_command_guard: cc-safety-net@1.0.6   # global binary (Dockerfile) + provider config entries
```

## How to read the example

- `name` and `version` are plain labels for humans. They do not imply a manifest
  version registry.
- `agents` points at the real provider-portable primitive pack: agent
  definitions, skills, and hooks already live under `.oh/`.
- `loops` points at today's scheduled cron prompts and task artifact directory.
  `/spec execute` owns implementation directly; it does not delegate to a separate
  implementation process.
- `policies` points at existing policy surfaces instead of inventing a
  `.oh/policies/` directory: the root instructions file, the git workflow skill,
  and hook-enforced guardrails. The guardrails are two complementary layers: the
  secret-exposure hooks under `.oh/hooks/`, and the destructive-command guard
  (cc-safety-net@1.0.6 — a global binary from the image plus guard-wrapped
  entries in the provider configs, not an `.oh/` file). Both are described in
  [security-considerations.md](security-considerations.md).

Every path in the example exists today except the illustrative
`.oh/harness.yml` file itself. Adding formal schemas, registries, lifecycle
states, or `OH-Core` / `OH-Dev` conformance profiles remains deferred by
[ADR-0001](rfcs/adr-0001-standards-scope.md).
