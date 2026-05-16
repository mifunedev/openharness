# `scripts/`

Repository-level maintenance scripts. These are not skill scripts (those live inside each `skills/<name>/scripts/`); these operate on the repo as a whole.

## Scripts

| Script | Purpose |
|--------|---------|
| `install.sh` | Curl-pipe installer for the `mifune` CLI (US-006) |
| `validate.sh` | CI wrapper: runs `skills-ref` lint + custom rules against all skills (US-007) |
| `publish-registry.sh` | Walks `skills/*/SKILL.md`, parses frontmatter, computes checksums, writes `registry.json` and `.claude-plugin/marketplace.json` |

## Conventions

- Scripts are Bash. Use `#!/usr/bin/env bash` and `set -euo pipefail`.
- Scripts must be idempotent — safe to run multiple times.
- `publish-registry.sh` is the only script that writes tracked files (`registry.json`, `.claude-plugin/marketplace.json`). It runs in CI on push to `main`.
