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

Hermes auth lives here as a project-local `auth.json`, gitignored and never committed. An earlier design symlinked it into the home-scoped `~/.hermes` named volume, but that volume is a different filesystem from the bind-mounted checkout, so Hermes' atomic credential writes (write-temp-then-rename) failed with a cross-device-link error (`EXDEV`). Keeping `auth.json` on the same device as `HERMES_HOME` resolves it; the entrypoint heals any leftover legacy symlink on boot.
