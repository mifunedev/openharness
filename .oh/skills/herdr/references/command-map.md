# Herdr command map

Full subcommand catalog for `herdr` 0.7.4 as shipped in the Open Harness image,
transcribed from `herdr --help` and each `herdr <group> --help`. Read the group
you need; `herdr <group> --help` remains ground truth if the pinned version
changes.

## Contents

1. [Top level](#top-level)
2. [Global options](#global-options)
3. [session](#session)
4. [workspace](#workspace)
5. [worktree](#worktree)
6. [tab](#tab)
7. [pane](#pane)
8. [agent](#agent)
9. [wait](#wait)
10. [notification](#notification)
11. [api, config, channel, server](#api-config-channel-server)
12. [integration](#integration)
13. [Paths](#paths)

## Top level

```text
herdr                              launch or attach to the persistent session (interactive; never from an agent run)
herdr status [server|client]       local client and running server status
herdr update [--handoff]           download and install the latest version (forbidden: image-pinned)
herdr completion <shell>           generate shell completions, e.g. `herdr completion zsh`
herdr server                       run as headless server
herdr server stop                  stop the running server via the API socket
herdr server reload-config         reload config.toml in the running server
```

## Global options

```text
--no-session                       run monolithically, no server/client (escape hatch)
--session <name>                   use or create a named persistent session
--remote <ssh-target>              attach through SSH to a remote Herdr server
--remote-keybindings <local|server>  keybindings for --remote attach (default: local)
--handoff                          opt into live handoff for update or remote attach
--default-config                   print default configuration and exit
--version, -V                      print version
--help, -h                         show help
```

## session

Plain-text output except where `--json` is offered.

```text
herdr session list [--json]
herdr session attach <name>        interactive; never from an agent run
herdr session stop <name> [--json]
herdr session delete <name> [--json]
```

`default` is a valid `<name>` for targeting the default session with `stop`.

## workspace

```text
herdr workspace list
herdr workspace create [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus|--no-focus]
herdr workspace get <workspace_id>
herdr workspace focus <workspace_id>
herdr workspace rename <workspace_id> <label>
herdr workspace report-metadata <workspace_id> --source ID [--token NAME=VALUE] [--clear-token NAME] [--seq N] [--ttl-ms N]
herdr workspace close <workspace_id>
```

`report-metadata` is for integrations publishing state into Herdr's UI, not for
ordinary task work.

## worktree

```text
herdr worktree list [--workspace ID | --cwd PATH] [--json]
herdr worktree create [--workspace ID | --cwd PATH] [--branch NAME] [--base REF] [--path PATH] [--label TEXT] [--focus|--no-focus] [--json]
herdr worktree open [--workspace ID | --cwd PATH] (--path PATH | --branch NAME) [--label TEXT] [--focus|--no-focus] [--json]
herdr worktree remove --workspace ID [--force] [--json]
```

`list` reports `branch`, `path`, `is_linked_worktree`, `is_prunable`, and the
`open_workspace_id` when the worktree is already open. In Open Harness, create
worktrees through `/worktrees` under `.worktrees/` and use `worktree open`
here; `worktree create` defaults elsewhere (`~/.herdr/worktrees`).

## tab

```text
herdr tab list [--workspace <workspace_id>]
herdr tab create [--workspace <workspace_id>] [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus|--no-focus]
herdr tab get <tab_id>
herdr tab focus <tab_id>
herdr tab rename <tab_id> <label>
herdr tab close <tab_id>
```

## pane

Inspection:

```text
herdr pane list [--workspace <workspace_id>]
herdr pane current [--pane ID|--current]
herdr pane get <pane_id>
herdr pane layout [--pane ID|--current]
herdr pane process-info [--pane ID|--current]
herdr pane neighbor --direction left|right|up|down [--pane ID|--current]
herdr pane edges [--pane ID|--current]
herdr pane read <pane_id> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
```

Layout control:

```text
herdr pane focus --direction left|right|up|down [--pane ID|--current]
herdr pane resize --direction left|right|up|down [--amount FLOAT] [--pane ID|--current]
herdr pane zoom [<pane_id>|--pane ID|--current] [--toggle|--on|--off]
herdr pane split [<pane_id>|--pane ID|--current] --direction right|down [--ratio FLOAT] [--cwd PATH] [--env KEY=VALUE] [--focus|--no-focus]
herdr pane swap --direction left|right|up|down [--pane ID|--current]
herdr pane swap --source-pane ID --target-pane ID
herdr pane move <pane_id> --tab <tab_id> --split right|down [--target-pane ID] [--ratio FLOAT] [--focus|--no-focus]
herdr pane move <pane_id> --new-tab [--workspace ID] [--label TEXT] [--focus|--no-focus]
herdr pane move <pane_id> --new-workspace [--label TEXT] [--tab-label TEXT] [--focus|--no-focus]
herdr pane rename <pane_id> <label>|--clear
herdr pane close <pane_id>
```

Input:

```text
herdr pane send-text <pane_id> <text>     literal text, no Enter
herdr pane send-keys <pane_id> <key> ...  named keys, e.g. Enter, Escape
herdr pane run <pane_id> <command>        command text plus Enter
```

Integration reporting (for provider hooks, not task work):

```text
herdr pane report-agent <pane_id> --source ID --agent LABEL --state idle|working|blocked|unknown [--message TEXT] [--seq N] [--agent-session-id ID] [--agent-session-path PATH]
herdr pane report-agent-session <pane_id> --source ID --agent LABEL [--seq N] [--agent-session-id ID] [--agent-session-path PATH]
herdr pane release-agent <pane_id> --source ID --agent LABEL [--seq N]
herdr pane report-metadata <pane_id> --source ID [--agent LABEL] [--applies-to-source ID] [--title TEXT|--clear-title] [--display-agent TEXT|--clear-display-agent] [--state-label STATUS=TEXT] [--clear-state-labels] [--token NAME=VALUE] [--clear-token NAME] [--seq N] [--ttl-ms N]
```

## agent

```text
herdr agent list
herdr agent get <target>
herdr agent read <target> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
herdr agent send <target> <text>          literal text, no Enter
herdr agent rename <target> <name>|--clear
herdr agent focus <target>
herdr agent wait <target> --status idle|working|blocked|unknown [--timeout MS]
herdr agent attach <target> [--takeover]  interactive; never from an agent run
herdr agent start <name> [--cwd PATH] [--workspace ID] [--tab ID] [--split right|down] [--env KEY=VALUE] [--focus|--no-focus] -- <argv...>
herdr agent explain <target> [--json]
herdr agent explain --file PATH --agent LABEL [--json]
```

Targets accept terminal ids, unique agent names, detected/reported agent labels,
and legacy pane ids.

## wait

```text
herdr wait output <pane_id> --match <text> [--source visible|recent|recent-unwrapped] [--lines N] [--timeout MS] [--regex] [--raw]
herdr wait agent-status <pane_id> --status idle|working|blocked|done|unknown [--timeout MS]
```

`wait agent-status` accepts `done`; `agent wait` does not — use the `wait` group
when you need to block on a finished agent. `--match` is required; omitting it
fails immediately with `missing required --match`.

## notification

```text
herdr notification show <title> [--body TEXT] [--position top-left|top-right|bottom-left|bottom-right] [--sound none|done|request]
```

## api, config, channel, server

```text
herdr api snapshot                 full live runtime state as JSON
herdr api schema [--json | --output PATH]
herdr config check                 validate config.toml, print diagnostics
herdr config reset-keys            back up config.toml, remove custom keybindings
herdr channel show
herdr channel set <stable|preview> forbidden: image-pinned
```

## integration

Optional provider hooks giving richer status and session restore. They modify
provider configuration and are never installed automatically; basic agent
detection works without them.

```text
herdr integration install <provider>
herdr integration uninstall <provider>
herdr integration status [--outdated-only]
```

Providers: `pi`, `omp`, `claude`, `codex`, `copilot`, `devin`, `droid`, `kimi`,
`opencode`, `kilo`, `hermes`, `qodercli`, `cursor`, `mastracode`.

## Paths

```text
config   ~/.config/herdr/config.toml        operator-only; agent tooling is denied this path
logs     ~/.config/herdr/herdr.log          plus herdr-client.log, herdr-server.log
socket   ~/.config/herdr/herdr.sock
data     ~/.herdr/                          Herdr-created worktrees and related data
env      HERDR_CONFIG_PATH                  overrides the config file path
home     https://herdr.dev
```
