# PRD: Slack-requested Pi session compaction

Issue: [#739](https://github.com/mifunedev/openharness/issues/739)

## Goal

Let an already-authorized Slack user request compaction of the current dedicated `client-slack-pi` session, receive a normal bridge-delivered acknowledgement first, and have the supervisor proactively restart/reconnect Pi after compaction replaces the session context.

## Requirements

1. Add `.pi/slack-compact/index.ts` outside `.pi/extensions/` auto-discovery and load it only as the third extension in `client-slack-pi`: bridge, Codex recovery, Slack compaction.
2. Accept only bridge-stamped `[📱 @… via slack]: …` inputs with exact case-insensitive natural text: `compact session`, `compact current session`, or `compact the current session`.
3. Optionally accept stamped `/compact [instructions]` as ordinary Slack text without registering or claiming a native Slack slash command. Limit instructions to 500 characters and reject control characters.
4. Transform a valid request into a short no-tool acknowledgement turn. Call documented `ctx.compact({ customInstructions, onComplete, onError })` only after a non-empty, tool-free assistant `turn_end`, so the bridge posts the acknowledgement while `pendingRemoteChat` is intact.
5. Prevent duplicate/in-flight compactions and clear extension state on session lifecycle/error paths.
6. Generate an unpredictable supervisor-owned nonce for every Pi launch. Emit the exact nonce-bound completion marker only from `onComplete`; tail logs from EOF, accept only the current nonce, record compaction recovery, kill Pi, clear lock, and relaunch. Compaction errors must not emit the marker or restart-loop.
7. Preserve stale-ctx and Codex recovery, Slack auth/thread semantics, heartbeat/status, lock cleanup, Hermes generic supervision, and interactive TTY behavior.
8. Update gateway wiring, full scaffold template, tests, eval probe, Slack/upstream docs, and changelog.

## Acceptance criteria

- Focused extension tests cover parser boundaries, transport stamp, transform, state machine, exact compact options/callbacks, duplicate/empty/tool turns, errors, and lifecycle reset.
- Supervisor/gateway/entrypoint tests prove load order, nonce plumbing, EOF/current-nonce recovery, and secret-safe env handling.
- A Tier-A eval probe guards gateway-only placement, exact Slack grammar, compact API, and proactive nonce restart.
- Focused and full checks, shell linting, provider/link checks, and evals pass; PR targets `development`, is CI-green and ready for review, and is not merged.
