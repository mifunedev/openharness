# Herdr

[Herdr](https://herdr.dev/) is Open Harness's primary interactive workspace. It is not in the image. It enters the sandbox only through `oh tool install herdr`.

## Start here

A fresh sandbox has no `herdr`. After entering the sandbox, install it, then run it:

```bash
# host
oh shell

# first commands inside the sandbox
oh tool install herdr
herdr
```

The install lands in `~/.local/bin` inside the persistent home volume, so later
boots find `herdr` on PATH immediately. `oh destroy` removes the volume and the
install with it.

Bare Herdr works before GitHub or provider authentication. It creates or reattaches a workspace for the current repository. Complete GitHub setup, provider authentication, agent sessions, tests, development servers, and reviews from Herdr panes so interactive work stays together.

```bash
# inside the initial Herdr pane
gh auth login && gh auth setup-git
claude auth login                 # or configure codex / pi
claude                            # launch agents from Herdr panes
```

Agent detection works without extra hooks. Optional integrations provide richer status and session restore, but modify provider configuration and are never installed automatically:

```bash
herdr integration install claude # or: codex, pi
herdr integration status
```

## Working model

- Use Herdr workspaces, tabs, and panes for interactive setup, agents, tests, servers, and reviews.
- Detach with `Ctrl-b q`; run `herdr` again to reattach while the container keeps running.
- Open Harness automation worktrees stay under `.worktrees`; open those paths in Herdr. Herdr-created worktrees default to `~/.herdr/worktrees`.
- Cron, Slack gateway, the cron supervisor, and other headless infrastructure remain in their existing tmux sessions. Do not run Herdr inside those managed sessions.
- A raw shell or direct agent command remains a recovery path if Herdr is unavailable.

## Persistence

- `~/.config/herdr`: configuration, logs, and session metadata.
- `~/.herdr`: Herdr-created worktrees and related data.

Both persist in the single `/home/sandbox` mount.

`oh stop` and normal rebuilds preserve metadata and layout in these volumes, but stopped containers do not preserve running agent, test, or server processes. `oh destroy` runs Compose with `-v` and removes the volumes too.

## Troubleshooting

```bash
herdr --version
herdr status
herdr --help
herdr server reload-config
herdr server stop              # end a broken Herdr server
herdr --no-session             # run Herdr without its server/client session
```

Herdr is pinned in the tool catalog (`.oh/cli/src/lib/tools/catalog.ts`) and provisioned into `~/.local/bin/herdr` at boot from a checksum-verified binary. Upgrade it by bumping that pin and running `oh tool install herdr`, not by self-updating the binary in place.

See the upstream [quick start](https://herdr.dev/docs/quick-start/), [agents guide](https://herdr.dev/docs/agents/), and [configuration reference](https://herdr.dev/docs/configuration/).
