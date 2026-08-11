# PRD: authenticated Slack-requested Pi session compaction

Issue: [#739](https://github.com/mifunedev/openharness/issues/739)
Bridge dependency: [ryaneggz/pi-messenger-bridge#2](https://github.com/ryaneggz/pi-messenger-bridge/pull/2)

## Goal

Let an already-authorized Slack user compact the active dedicated
`client-slack-pi` session without losing delivery correlation, allowing forged
restart signals, exposing a replaced context to later Slack messages, or
relaunching into a new bare session.

## Architecture

The exact-pinned bridge package owns behavior available only where authenticated
message metadata and transport delivery/disconnect are available: strict compact
parsing, originating chat/thread acknowledgement, active-turn settling,
deterministic inbound serialization, `ctx.compact`, generation guards, Slack
intake shutdown, and one-shot completion notification.

The harness owns process/session continuity only: an isolated mode-700 session
directory launched with `--continue`, a watcher-open-before-launch private
inherited pipe that is unlinked after fd inheritance, exact-PID restart, and
complete watcher/heartbeat/lock cleanup. No local duplicate compact extension,
`node_modules` patch, vendor copy, log sentinel, environment nonce, or broad
`pkill` is permitted.

## Requirements

1. Pin `github:ryaneggz/pi-messenger-bridge` to the exact tested commit from its focused unmerged PR; preserve thread replies, Slack admin commands, challenge trust, and all sibling transports.
2. Authorize before compact recognition. Bind one immutable request to its exact Slack chat, thread, message, session generation, and request generation.
3. Post the acknowledgement directly through Slack to the originating chat/thread. Failed delivery must not compact, disconnect, or notify the supervisor.
4. Wait for an active prior turn to settle; never compact because of the next arbitrary `turn_end`. Provider errors, empty output, and tool turns cannot steal the request.
5. Serialize overlapping authenticated inbound callbacks. Once a compact request is committed, block direct-next messages from entering the context being replaced.
6. Validate the untrimmed optional custom-instruction capture. Reject C0, DEL, and C1 controls; bound to 500 Unicode code points.
7. Generation-guard completion/error callbacks after session or request replacement.
8. On successful compaction, synchronously close the logical intake gate, disconnect Slack, then write one byte to a supervisor-created private one-shot pipe unavailable to ordinary tool subprocesses.
9. Prepare and synchronize the pipe watcher before launch. Settle it after Pi exits and before rc evaluation, including immediate completion and completion+rc0 races.
10. Signal only the exact supervised Pi PID; never broad-name-kill the compact path. Preserve sibling Pi processes.
11. Store gateway sessions under an isolated mode-700 directory and launch every generation with explicit `--continue`, proving launch two reopens launch one's compacted active path.
12. Clean up exact Pi/watcher/ticker processes, FIFO/ready/PID/restart files, bridge lock, and heartbeat on normal exit, INT, TERM, and HUP. Preserve the persistent session directory.
13. Preserve Codex stale-response recovery, stale-ctx fallback recovery, Hermes generic supervision, tokens-as-data, interactive TTY behavior, status/heartbeat, and thread replies.
14. Update package/harness tests, task artifacts, Slack docs, UPSTREAM provenance/template parity, changelog, and Tier-A eval probes. Do not claim a native Slack `/compact` command.

## Acceptance criteria

- Bridge tests cover active prior turn, simultaneous/overlapping messages, exact chat/thread ack, provider error, empty/tool independence, Slack post failure, untrimmed controls, direct-next race, disconnect-before-signal, and late generation callbacks.
- Supervisor integration proves watcher readiness, immediate completion+rc0, tool/pane forgery failure, exact sibling survival, launch-two continuation of the compacted path, and cleanup contracts.
- Harness consumes only an exact commit pin and contains no package patch/vendor or local compact implementation.
- Focused and full package/harness test, eval, lint, format, typecheck, build, shellcheck, and template/provider parity gates pass.
- Both PRs remain unmerged and all required CI is green.
