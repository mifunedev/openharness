# Raw source notes — tree sandbox skill

Captured: 2026-06-19

## Local current-version evidence

```text
$ command -v tree
/usr/bin/tree
$ tree --version
tree v2.1.0 (c) 1996 - 2022 by Steve Baker, Thomas Moore, Francesc Rocher, Florian Sesser, Kyosuke Tokoro
```

## Local repository sources

- `.devcontainer/Dockerfile` — Debian bookworm sandbox image package installation. The repo-layout support change adds `tree` to the initial `apt-get install -y --no-install-recommends` package list.
- `.claude/skills/repo-layout/SKILL.md` — `/repo-layout` skill metadata and invocation instructions.
- `.claude/skills/repo-layout/scripts/run.sh` — deterministic wrapper that checks for `tree`, applies concise descriptive premap defaults when no args are provided, and supports `--raw` native pass-through when explicitly requested.
- `.pi/skills` — symlink to `../.claude/skills`, so the tracked Claude skill is also the Pi skill surface.

## DeepWiki comparison

Checked `https://deepwiki.com/mifunedev/openharness` on 2026-06-19. The root page frames the sandbox as a Docker container defined by `.devcontainer/docker-compose.yml` and lifecycle-managed by `Makefile`, and frames capabilities as Skills under `.claude/skills/`. No dedicated `tree` page was found. The local wiki entry mirrors DeepWiki's source-first style by tying the binary to the sandbox image and the concise descriptive premap invocation to the skills system.
