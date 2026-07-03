# Hermes runtime home

OpenHarness sets `HERMES_HOME=<repo>/.hermes` when `INSTALL_HERMES=true`.

This directory holds Hermes project-local runtime state (config, memory, skills,
sessions, scheduled-task metadata). **Only `config.yaml`, `SOUL.md`, and this
README are tracked.** All runtime state — including `auth.json` and any `.env` —
is gitignored and must never be committed.

On boot with Hermes enabled, the sandbox links the shared skill pack so Hermes
sees the same skills as Claude/Codex/Pi:

```text
<repo>/.hermes/skills/openharness -> ../../.oh/skills
```

Hermes docs: <https://hermes-agent.nousresearch.com/docs/>
