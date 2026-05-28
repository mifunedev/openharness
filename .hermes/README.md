# Hermes runtime home

Open Harness sets `HERMES_HOME=/home/sandbox/harness/.hermes` when `INSTALL_HERMES=true`.

This directory holds Hermes project-local runtime state such as config, memory, skills, sessions, and scheduled-task metadata. Runtime contents are gitignored.

On first boot with Hermes enabled, the sandbox seeds `config.yaml` with:

```yaml
skills:
  external_dirs:
    - /home/sandbox/harness/.claude/skills
```

That makes the harness' in-repo Claude-style skills visible to Hermes by default.

Hermes auth does not live here as a committed or project-local file. The sandbox mounts the `hermes-auth` named volume at `~/.hermes`, and the entrypoint links `.hermes/auth.json` to `~/.hermes/auth.json` so credentials stay in the home-scoped auth volume.
