---
name: escalate
description: |
  Deliver a human-addressed escalation from an unattended session to the
  operator's Slack channel, so a finding that needs a person does not die in a
  log nobody tails or a GitHub thread that notifies no one.
  TRIGGER when: an unattended, detached, cron, or background session is blocked
  and needs an operator decision; a finding requires consent the session cannot
  give (restart infrastructure, spend budget, change identity, publish
  externally); a guard or cap refuses and only a human can lift it; asked to
  "escalate this", "tell the operator", "notify me", or "ping me in Slack".
  Do NOT trigger for routine progress, completion notices, or anything the
  session can resolve itself. No-ops when the channel is unavailable.
argument-hint: "--summary <what happened> --needs <the human decision> [--tried <what you already did>] [--key <dedupe-key>] [--link <url>]"
allowed-tools: Bash
---

# Escalate

Send one escalation to the operator through the Slack gateway's channel. Use the
bundled script; it is the only supported path and it works with no live agent and
no attached terminal.

```bash
bash .oh/skills/escalate/scripts/escalate.sh \
  --summary "<what happened, in one or two sentences>" \
  --needs   "<the decision only the operator can make>" \
  --tried   "<what you already attempted and why it was not enough>" \
  --key     "<stable-slug>" \
  --link    "<issue, PR, or log URL>"
```

## When to escalate

Escalate only when the session is **blocked on a human**. The bar is a decision,
not a status.

| Escalate | Do not escalate |
|---|---|
| A guard, cap, or permission refuses and only the operator can lift it | A task finished, or is progressing normally |
| An action needs consent the session cannot give — restart infrastructure, spend budget, publish externally, change identity | Something the session can fix, retry, or route around itself |
| A finding will silently rot if nobody sees it before the next run | A finding already captured where the operator will see it |

An escalation that names no decision is a log line. `--needs` is required for
exactly that reason: if you cannot state what the human must decide, you are
reporting, not escalating.

## Rules

1. **Say what you already tried.** An operator who cannot tell what was attempted
   has to redo the diagnosis before they can act. Use `--tried`.
2. **Pass a `--key` for anything recurring.** The same key is suppressed for 12
   hours (`ESCALATE_QUIET_HOURS`). A repeating session that escalates the same
   finding every run trains the operator to ignore the channel — the
   `prompt-miner` cron sent the same escalation nine times before anyone acted.
   Use `--force` only when the situation genuinely changed.
3. **Never assume delivery. Exit 0 is not proof.** An unavailable channel is a
   **no-op**, not an error: the script exits `0` so a blocked session is not
   itself broken by a dead channel, and prints `{"ok":false,"skipped":true,...}`.
   Read `.ok`. When it is false the operator was **not** reached, and the session
   must surface it where a human will look — a PR comment, `evidence.md`. The
   script has already written the record for you (see below); it has not made
   anyone read it.
4. **One escalation per blocker.** Do not narrate a session in Slack.
5. **Read the reply channel honestly.** This is one-way. The script delivers a
   message; it does not wait for or receive an answer. A session that needs an
   answer must stop and leave durable state, not poll.

## Exit codes

Branch on `.ok` in the JSON on stdout, not on the exit code alone.

| Exit | stdout | Meaning | What the session must do |
|---|---|---|---|
| `0` | `{"ok":true,...,"ts":...}` | Delivered | Continue |
| `0` | `{"ok":false,"skipped":true,"reason":...}` | **No-op** — the channel is unavailable | **Record the escalation elsewhere; the operator did not see it** |
| `64` | — | Bad usage: missing `--summary` or `--needs` | Fix the call |
| `75` | — | Suppressed by the quiet window for this `--key` | Continue; the operator was already told |

## Channel health

Every send is preceded by a `conversations.info` check on the resolved channel.
The escalation **no-ops** — never raises — when any of these hold:

- no `PI_SLACK_BOT_TOKEN` is resolvable (checked before any network call);
- no `--channel` and no enabled channel in the bridge config;
- Slack is unreachable, or answers `not_in_channel`, `channel_not_found`,
  `invalid_auth`, or any other error;
- the channel is archived;
- `chat.postMessage` itself is rejected.

A dead channel must not take down the session that was trying to report through
it. That is the whole reason this is a no-op instead of a failure — but a no-op
is still a **non-delivery**, and rule 3 governs what the session owes the
operator afterwards. Silence here is the exact failure this skill exists to
remove, so the reason is always printed to stderr and returned in the JSON.

## Resolution

- **Token**: `PI_SLACK_BOT_TOKEN` from the environment, else from
  `.devcontainer/.env` — the same order `.oh/scripts/gateway.sh` uses. The token
  is passed to `curl` through a header file, never on the command line where
  `/proc` would expose it.
- **Channel**: `--channel`, else the first `enabled` entry in
  `~/.pi/msg-bridge.json` under `auth.channels`.
- **State**: quiet-window markers in `~/.oh/escalate/` (`ESCALATE_STATE_DIR`).
- **Log**: every attempt, delivered or not, appends one JSON line to
  `$OH_PROJECT_ROOT/.oh/logs/escalations.jsonl` (`ESCALATE_LOG`). The path
  resolves to the **harness root**, so sessions in worktrees and cron checkouts
  all write one canonical trail. Logging never fails the send.

  ```bash
  jq -c 'select(.ok == false)' .oh/logs/escalations.jsonl   # what never reached a human
  ```

  This is what makes a no-op recoverable: the next session, or the operator after
  the fact, can see an escalation was attempted and died in a dead channel. See
  [`.oh/logs/README.md`](../../logs/README.md).
- **Timeout**: `ESCALATE_TIMEOUT` seconds per Slack call, default 10 — an
  unreachable gateway must not hang an unattended session.

Verify wiring without sending anything by adding `--dry-run`, which prints the
resolved channel and the exact rendered message.

## Not this skill

- **Sending a routine message to Slack.** This skill is for escalations; its
  format and dedupe assume a human must act.
- **Talking to the gateway agent.** The `client-slack-pi` tmux session is an
  interactive agent. Do not type into it to send a message — that requires a
  human at a keyboard, which is the failure this skill exists to remove.
- **Receiving replies.** One-way by design.
