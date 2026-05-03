# Bring Your Own Harness

A **harness pack** is a directory (or git repo) that contributes onboarding steps, compose overlays, workspace seeds, and runtime hooks to an openharness sandbox. Authoring a pack lets you bundle an opinionated agent stack — coding agent, automations, slack bot, custom tools — into something a user installs by cloning into their workspace.

## Installing a pack

Clone the pack into your sandbox workspace and follow its README:

```bash
git clone https://github.com/<owner>/<repo> workspace/<pack-name>
```

The pack's README is the source of truth for what to do next — typically: register any compose overlays in `.openharness/config.json`, run an install script to pull agent CLIs, and copy any seed files into `workspace/`. Each pack documents its own steps so the harness itself stays minimal.

## Pack layout

A pack is a self-contained directory. Conventional layout:

```
<pack-root>/
  README.md               # Install + usage instructions (REQUIRED)
  harness.json            # Manifest (optional, informational)
  install-hook.sh         # Pulls agent CLIs / sets up the sandbox
  entrypoint-hook.sh      # Sourced by openharness entrypoint at runtime
  overlays/*.yml          # Compose overlays — register in .openharness/config.json
  workspace-seed/         # Files to copy into the sandbox workspace
  Dockerfile              # OPTIONAL: derived image FROM openharness base
```

## `harness.json` (informational)

A pack MAY ship a `harness.json` describing itself for discoverability. The file is no longer consumed by an installer — treat it as documentation:

```json
{
  "name": "mifune",
  "version": "2026.5.2",
  "description": "Pi+Mom harness for openharness",
  "openharness": ">=2026.5.2",
  "agents": ["pi"],
  "compose_overlays": [
    "overlays/docker-compose.pi-host.yml",
    "overlays/docker-compose.slack.yml"
  ],
  "prebuilt_image": "ghcr.io/ryaneggz/mifune:latest"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Pack identifier. Lowercase, kebab-case. |
| `version` | string | Pack version — independent of the underlying agent CLI version. |
| `description` | string | One-line summary. |
| `openharness` | string | Minimum compatible openharness version (semver range). |
| `agents` | string[] | Agent CLIs the pack wires in. Informational. |
| `compose_overlays` | string[] | Paths-within-pack to docker-compose YAML overlays — user adds these to `.openharness/config.json`. |
| `prebuilt_image` | string? | Optional GHCR image tag for a fast Docker-only on-ramp. |

## Distribution

- **Public git repo** — the canonical channel. Users clone the repo into `workspace/<pack-name>` and follow the README. Iterate freely; tags signal stable versions.
- **Prebuilt image** — publish a derived image (e.g. `ghcr.io/<you>/<pack>:latest`) for users who want a Docker-only on-ramp without cloning.

## Reference implementation

The [`mifune`](https://github.com/ryaneggz/mifune) pack is the canonical example: Pi agent CLI + Mom Slack bot, distributed as a git repo and a `ghcr.io/ryaneggz/mifune:latest` Docker image derived from the openharness base. Read its README for the current install steps.
