# In-Sandbox Process Lifecycle

## Source of Truth

Every long-running process inside a sandbox — dev servers, tunnels, AI
agents, background workers, heartbeats — MUST run inside a named tmux
session. This is the single mechanism for inspection, attach/detach,
restart, and log capture across all internal apps.

`tmux` is preinstalled in the sandbox image; a default `.tmux.conf` is
baked in (see commit `b30cef9`).

## Session Naming

Format: `<category>-<identifier>` (kebab-case inside each segment).

| Category | Example | Purpose |
|----------|---------|---------|
| `app-` | `app-docs`, `app-api` | User dev servers |
| `expose-public-` | `expose-public-3000` | Cloudflare quick tunnels (auto-created) |
| `agent-` | `agent-watcher`, `agent-batch` | Headless / long-running agent processes. Interactive CLIs (`claude`, `codex`, `opencode`) are normally foreground in a terminal or VS Code, not detached in tmux. |
| `client-` | `client-slack`, `client-discord` | External-surface clients that bridge an in-sandbox agent to a third-party UI |
| `cron-` | `cron-heartbeat`, `cron-autopilot-0613-1805`, `cron-system` | Scheduled cron jobs and the cron runtime. |

Reserved prefix: `system-`. Do not use for user apps.

## Grouping Related Apps Into One Session

When several processes belong to the same project (e.g. frontend + API +
worker for a single app), put them in **one session** as stacked panes
rather than three sibling sessions. This keeps related logs visible at a
glance, lets you attach once to see the whole stack, and makes
`tmux ls` reflect logical groups, not process count.

Layout convention: **horizontal separators, panes stacked top-to-bottom**
(each app's log occupies a full-width row). The pane below the one above
is created with `tmux split-window` (default orientation) or `-v`.

```bash
# Launch the "docs-site" group: one session, three stacked panes.
tmux new-session  -d  -s app-docs-site 'pnpm --filter web dev        2>&1 | tee /tmp/app-docs-site.web.log'
tmux split-window -t app-docs-site     'pnpm --filter api dev        2>&1 | tee /tmp/app-docs-site.api.log'
tmux split-window -t app-docs-site     'pnpm --filter worker start   2>&1 | tee /tmp/app-docs-site.worker.log'
tmux select-layout -t app-docs-site even-vertical    # equal row heights
```

Per-pane log files follow `/tmp/<session>.<pane-label>.log` so each
process has its own file without losing the grouping.

When in doubt (not clearly "related"), err on the side of **separate
sessions** — it's always safe to split later; merging independent
sessions into one is not.

## Why

- Named sessions let any listener be traced back to the command that owns
  it: `tmux ls` shows what's running, `tmux attach -t <name>` shows the
  live output.
- Terminal-bound processes survive disconnects; reattach with
  `tmux attach -t <name>`.
- Restart is deterministic: `tmux kill-session -t <name>` then relaunch
  with the same command.
- No need for `nohup`, `systemd-user`, or ad-hoc backgrounding inside the
  sandbox — tmux is the single convention.

## Starting a Session

Inside the sandbox:

```bash
tmux new-session -d -s app-docs 'pnpm --filter @openharness/docs dev 2>&1 | tee /tmp/app-docs.log'
```

The `tee` to `/tmp/<session>.log` is the convention — one log file per
session keeps later inspection straightforward.

From the host, drive tmux inside the container with `docker exec`:

```bash
docker exec -it -u sandbox openharness \
  tmux new-session -d -s app-docs 'pnpm ... 2>&1 | tee /tmp/app-docs.log'
```

## Anti-patterns

- **Foregrounded inside another session** — starting a dev server in the
  foreground of an `agent-*` pane makes logs shared, restart awkward.
- **`nohup cmd &`** — orphans the process, lost on container restart,
  invisible to `tmux ls`.
- **Running as root** — breaks `/proc/<pid>/fd/*` resolution for the
  sandbox user, hiding which process owns which socket.
- **Unnamed sessions** (`tmux` with no `-s`) — shows as `0`, `1`, `2` in
  `tmux ls`; impossible to map back to an app.
