---
name: t3
description: |
  Start, inspect, or stop T3 Code (`npx t3`) in the Open Harness sandbox.
  Use this for the browser-based T3 Code harness on port 3773, including tmux
  launch, pairing URL discovery, logs, status, and shutdown. T3 Code wraps an
  already-authenticated Claude Code, Codex, or OpenCode backend.
  TRIGGER when: user asks to run T3 Code, start `npx t3`, open the T3 browser
  UI, get the T3 pairing URL, check T3 Code status/logs, or stop T3 Code.
argument-hint: "[start|status|url|logs|stop|attach|help] [--session <name>] [--port <port>] [--log <path>]"
allowed-tools: Bash, Read
disable-model-invocation: true
---

# T3 Code

Run T3 Code as a sandbox-local browser harness. Treat it as a long-running
process: start it in tmux, report the pairing URL, and leave the session running
for the operator to open at `localhost:3773` through their host/VS Code port
forwarding.

## Arguments

Arguments received: `$ARGUMENTS`

- `ACTION`: optional first positional argument; default `start`
  - `start`: start T3 Code in tmux, or report the existing session
  - `status`: show whether the tmux session is running and print recent output
  - `url`: print the latest pairing URL from the log/pane if present
  - `logs`: print recent log lines
  - `stop`: kill the tmux session
  - `attach`: print the attach command; do not attach from an agent run
  - `help`: print script usage
- `--session`: tmux session name; default `agent-t3code`
- `--port`: expected UI port; default `3773`
- `--log`: log file; default `/tmp/<session>.log`

If the user does not specify an action, use `start`.

## Preconditions

Before launch, remind the user that T3 Code is a UI over an existing provider.
At least one backend must already be installed and authenticated inside the
sandbox:

```bash
claude        # complete OAuth on first launch
codex login
opencode auth login
```

Do not treat T3 Code itself as replacing provider login. It starts a browser UI
and prints a single-use pairing URL such as
`http://localhost:3773/pair#token=...`.

## Run

Run the bundled script with the received arguments:

```bash
bash "$CLAUDE_SKILL_DIR/scripts/t3-code.sh" $ARGUMENTS
```

The script verifies `tmux` and `npx`, starts `npx --yes t3` in tmux for the
`start` action, waits briefly for a pairing URL, and prints follow-up commands.

## Report

After `start`, report:

- tmux session name
- log path
- pairing URL if found, otherwise the command to inspect logs
- local UI URL, normally `http://localhost:3773`
- reminder: if running over SSH/remote host, use VS Code port forwarding or see
  `docs/connecting.md`

For public sharing beyond the attached host, use `/cloudflared 3773` only after
confirming the operator wants a public bearer URL.

## Examples

```bash
/t3
/t3 status
/t3 logs --session agent-t3code
/t3 stop
```
