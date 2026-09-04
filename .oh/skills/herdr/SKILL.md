---
name: herdr
description: |
  Drive the Herdr terminal workspace manager from the CLI inside the Open
  Harness sandbox — inspect and control workspaces, tabs, panes, agents,
  and git worktrees over the Herdr socket API, and read or steer other
  running agents headlessly.
  TRIGGER when: asked to run a `herdr` command, list/read/send to another
  agent or pane, check what agents are running or whether one is idle,
  split/focus/close panes or tabs, open or create a worktree in Herdr,
  wait for a pane's output or an agent's status, check Herdr server/session
  status, or install a Herdr provider integration.
  Do NOT trigger for tmux-managed headless services (cron, Slack gateway,
  tunnels) — those stay in their own tmux sessions, and the cron runtime is
  the systemd service openharness-cron.service.
allowed-tools: Bash, Read
---

# Herdr CLI

Herdr (`herdr`, v0.7.4 in this image) is Open Harness's primary interactive
workspace: a server process plus attached clients, with workspaces → tabs →
panes, and agent-state detection per pane. This skill covers driving it from a
non-interactive agent run. Operator-facing setup, persistence volumes, and the
attach story live in `docs/integrations/herdr.md` — do not duplicate them
here.

Full subcommand catalog: `references/command-map.md`. Read it when you need a
flag you do not already know; `herdr <group> --help` is the ground truth and
prints a usage block for every group.

## Never do these from an agent run

- **Do not run bare `herdr`, `herdr agent attach`, or `herdr session attach`.**
  They take over the terminal and hijack the operator's client. Use
  `herdr agent read` / `herdr pane read` to observe instead.
- **Do not run `herdr update` or `herdr channel set`.** Herdr is pinned in the
  Open Harness image; upgrade by rebuilding against a reviewed release.
- **Do not run `herdr server stop`.** It kills every attached client. Only the
  operator decides that.
- **Do not read or write `~/.config/herdr/`** (config.toml, logs, `herdr.sock`).
  A `.config` path segment is denied to agent tooling repo-wide. Use
  `herdr config check` and `herdr status`, which report the same facts.
- **Do not close, kill, or send text to a pane you did not create** without the
  operator asking. Other panes hold live agents mid-task.

## Output contract

Socket-API-backed groups (`workspace`, `worktree`, `tab`, `pane`, `agent`,
`wait`, `notification`, `api`) print a single JSON line:

```json
{"id":"cli:agent:list","result":{"agents":[...],"type":"agent_list"}}
```

Pipe them through `jq` rather than eyeballing — `herdr pane list` on a busy
workspace is thousands of characters. Plain-text groups are `status`,
`session list`, `integration status`, `config check`, `channel show`.

Identifiers:

| Shape | Example | Meaning |
|-------|---------|---------|
| `w<N>` | `w1` | workspace id |
| `w<N>:t<HEX>` | `w1:t1K` | tab id |
| `w<N>:p<HEX>` | `w1:p1E` | pane id |
| `term_<hex>` | `term_6587653c830dc14` | terminal id |

An `agent <target>` accepts a terminal id, a unique agent name, a
detected/reported agent label, or a legacy pane id — so `herdr agent read w1:p1E`
works. Pane ids are the safest thing to thread through a script; they appear in
every listing.

## Recipes

**Survey what is running.** Agent state is detected without any integration
installed (`herdr integration status` reporting `not installed` does not mean
detection is off — integrations only add richer status and session restore).

```bash
herdr agent list | jq -r '.result.agents[] | "\(.pane_id)\t\(.agent)\t\(.agent_status)\t\(.terminal_title_stripped)"'
herdr workspace list | jq -r '.result.workspaces[] | "\(.workspace_id)\t\(.label)\t\(.pane_count) panes"'
```

`agent_status` is one of `idle`, `working`, `blocked`, `done`, `unknown`.

**Read another agent's screen** without attaching:

```bash
herdr agent read w1:p1E --source recent --lines 80 | jq -r '.result.read.text'
```

`--source visible` is the current viewport, `recent` includes scrollback,
`recent-unwrapped` keeps long lines intact. Add `--format ansi` only when colors
matter.

**Send work to another agent.** `agent send` writes literal text and does not
press Enter; `pane run` sends a command plus Enter. Pick deliberately:

```bash
herdr agent send w1:p1E 'summarize the last test failure'   # types it, no submit
herdr pane run w1:p1E 'pnpm test'                            # types it and submits
herdr pane send-keys w1:p1E Enter                            # submit what you typed
```

**Wait instead of polling.** Both waits block server-side with a timeout in ms:

```bash
herdr agent wait w1:p1E --status idle --timeout 600000
herdr wait output w1:p1E --match 'BUILD OK' --source recent --timeout 120000
herdr wait output w1:p1E --match '^\s*PASS' --regex --timeout 120000
```

The `wait` group answers with an event object rather than the usual `id`/`result`
envelope — `{"event":"pane.agent_status_changed","data":{...}}` — so read
`.data`, not `.result`. Only `wait agent-status` accepts `done`; `agent wait`
does not.

**Start a new agent in its own pane** (everything after `--` is the argv):

```bash
herdr agent start reviewer --cwd /home/sandbox/harness --split right -- claude
```

**Open a worktree as a workspace.** Open Harness automation worktrees live under
`.worktrees/`; Herdr-created ones default to `~/.herdr/worktrees`. Prefer
opening an existing harness worktree over letting Herdr create one, so
`/worktrees` conventions keep owning the layout:

```bash
herdr worktree list --json | jq -r '.result.worktrees[] | "\(.branch // "detached")\t\(.path)"'
herdr worktree open --cwd /home/sandbox/harness --path .worktrees/bug/715-pi-langfuse-shutdown --no-focus
```

Pass `--no-focus` on anything you create in the background — stealing focus
yanks the operator out of their pane.

**Notify the operator** when a long run finishes:

```bash
herdr notification show 'CI green' --body 'branch development' --sound done
```

## Health check

```bash
herdr status          # client + server version, protocol, compatibility, socket
herdr session list    # named sessions and their status
herdr config check    # validates config.toml, prints "config: ok"
herdr api snapshot    # full runtime state as one JSON blob
```

`herdr status` reporting `compatible: no` or `restart_needed: yes` means the
client and server drifted — report it to the operator; do not self-update.

If a socket command fails with a connection error, the server is not running;
that is an operator problem (they attach with bare `herdr`), not something to
fix by starting a server from an agent run.

## Report

State the pane/agent ids you touched, what you read versus what you sent, and
any pane you created (with its workspace/tab). Never claim you observed an
agent's state without showing the `agent list` / `agent read` output you based
it on.
