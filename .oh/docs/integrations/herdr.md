# Herdr

[Herdr](https://herdr.dev/) is Open Harness's primary interactive workspace. It is installed in every image.

## Start here

After entering the sandbox, make `herdr` your first command:

```bash
# host
make shell

# first command inside the sandbox
herdr
```

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
- Open Harness automation worktrees stay under `.oh/worktrees`; open those paths in Herdr. Herdr-created worktrees default to `~/.herdr/worktrees`.
- Cron, Slack gateway, watchdog, and other headless infrastructure remain in their existing tmux sessions. Do not run Herdr inside those managed sessions.
- A raw shell or direct agent command remains a recovery path if Herdr is unavailable.

## Persistence

- `~/.config/herdr` (in the shared `config-dir` volume): configuration, logs, and session metadata.
- `~/.herdr` (in `herdr-data`): Herdr-created worktrees and related data.

`make stop` and normal rebuilds preserve metadata and layout in these volumes, but stopped containers do not preserve running agent, test, or server processes. `make destroy` runs Compose with `-v` and removes the volumes too.

## Troubleshooting

```bash
herdr --version
herdr status
herdr --help
herdr server reload-config
herdr server stop              # end a broken Herdr server
herdr --no-session             # open an unmanaged recovery shell
```

Herdr is pinned in the Open Harness image. Upgrade it by rebuilding against a reviewed Open Harness release rather than self-updating `/usr/local/bin/herdr`.

See the upstream [quick start](https://herdr.dev/docs/quick-start/), [agents guide](https://herdr.dev/docs/agents/), and [configuration reference](https://herdr.dev/docs/configuration/).
