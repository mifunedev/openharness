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
directory launched with `--continue`, a listener-ready-before-launch mode-0600
Unix socket that authenticates the exact Pi PID with Linux peer credentials,
exact process-group restart, and complete listener/heartbeat/lock cleanup. The
socket path is rendezvous metadata, not an environment secret. No local duplicate
compact extension, `node_modules` patch, vendor copy, log sentinel, inherited fd,
or broad `pkill` is permitted.

## Requirements

1. Pin `github:ryaneggz/pi-messenger-bridge` to the exact tested commit from its focused unmerged PR; preserve thread replies, Slack admin commands, challenge trust, and all sibling transports.
2. Authorize before compact recognition. Bind one immutable request to its exact Slack chat, thread, message, session generation, and request generation.
3. Post the acknowledgement directly through Slack to the originating chat/thread. Failed delivery must not compact, disconnect, or notify the supervisor.
4. Wait for an active prior turn to settle; never compact because of the next arbitrary `turn_end`. Provider errors, empty output, and tool turns cannot steal the request.
5. Serialize overlapping authenticated inbound callbacks. Do not assign a remote destination until the exact queued user message reaches `message_start`; correlate with a per-request unpredictable internal id and remove it through finalized `message_end` replacement before provider/session use. Once a compact request is committed, block direct-next messages from entering the context being replaced.
6. Validate the untrimmed optional custom-instruction capture. Reject C0, DEL, and C1 controls; bound to 500 Unicode code points.
7. Generation-guard completion/error callbacks after session or request replacement.
8. On successful compaction, synchronously close the logical intake gate, disconnect Slack, then connect from Pi itself to a supervisor-created private Unix socket and write the one-byte protocol.
9. Prepare and synchronize the mode-0600 listener before launch. Authenticate the exact supervised Pi PID with `SO_PEERCRED` plus direct-child SID/PGID identity; reject tool children even when they discover the parent environment, path, and protocol. Settle the listener after Pi exits and before rc evaluation, including immediate completion and completion+rc0 races, and unlink the path on every exit.
10. Signal only the authenticated exact supervised Pi process group with bounded TERM→KILL, including descendants after an immediate leader exit; never broad-name-kill the compact path. Preserve sibling Pi processes.
11. Store gateway sessions under an isolated mode-700 directory and launch every generation with explicit `--continue`, proving launch two reopens launch one's compacted active path.
12. Clean up exact Pi/listener/ticker processes, socket/ready/PID/restart files, bridge lock, and heartbeat on normal exit, INT, TERM, and HUP. Preserve the persistent session directory.
13. Preserve Codex stale-response recovery, stale-ctx fallback recovery, Hermes generic supervision, tokens-as-data, interactive TTY behavior, status/heartbeat, and thread replies.
14. Update package/harness tests, task artifacts, Slack docs, UPSTREAM provenance/template parity, changelog, and Tier-A eval probes. Do not claim a native Slack `/compact` command.

## Acceptance criteria

- Bridge tests cover active prior turn, simultaneous/overlapping messages, exact chat/thread ack, provider error, empty/tool independence, Slack post failure, untrimmed controls, direct-next race, disconnect-before-signal, and late generation callbacks.
- Supervisor integration proves listener readiness/mode, immediate completion+rc0, a real child discovering parent env and attempting `/proc`/socket forgery without triggering, exact Pi peer success, exact sibling survival, launch-two continuation of the compacted path, and cleanup contracts.
- Bridge integration proves Slack arriving during a local assistant/tool turn leaves the local response local, then delivers the remote response exactly once; two chats/threads with identical content remain independently correlated and internal markers are absent from finalized user messages.
- Harness consumes only an exact commit pin and contains no package patch/vendor or local compact implementation.
- Focused and full package/harness test, eval, lint, format, typecheck, build, shellcheck, and template/provider parity gates pass.
- Both PRs remain unmerged and all required CI is green.
