# Adversarial implementation critique

## Independent verdict at head `4fb07864`

**FAIL.** The first implementation transformed an authenticated-looking stamp
inside a separate local extension, waited for a later arbitrary assistant text
turn, emitted a forgeable environment-nonce log sentinel, broadly killed by
process-name pattern, and relaunched bare Pi. Passing tests proved those
mechanics rather than the required security/session semantics.

## Mandatory findings and resolutions

1. **Session continuity — high, fixed:** bare relaunch lost the compacted active path. The supervisor now owns a private persistent session directory and uses `--session-dir ... --continue` on every launch. Integration launch two reads launch one's compaction entry from the same active file.
2. **Correlation/delivery — high, fixed:** the bridge package now handles only an already-authorized exact request, posts directly to the originating chat/thread, treats successful Slack delivery as the commit point, waits for active work to settle, and serializes overlaps. Tests cover active work, simultaneous/direct-next traffic, provider failure/empty/tool independence, and Slack post failure.
3. **IPC — high, fixed after second redesign:** the inherited fd was still forgeable through `/proc/$PPID/fd/$FD`. It is removed. A mode-0600 Unix listener is ready before launch and authenticates `SO_PEERCRED` PID plus supervisor-direct-child SID/PGID identity. The socket path is not a secret. A real child discovers it from parent env, scans `/proc`, connects with the right protocol, and cannot trigger; the exact Pi PID succeeds.
4. **No stale window — high, fixed:** listener bind/chmod/listen readiness completes before Pi launch. Package completion closes the logical intake gate immediately, disconnects Slack, then signals. The supervisor settles the watcher before rc evaluation. Immediate completion and direct-next races are tested.
5. **Generation guard — high, fixed:** request id, session generation, and context identity guard late completion/error callbacks. Replacement tests prove old callbacks cannot disconnect or signal the new request.
6. **Exact target/cleanup — high, fixed:** no compact-path `pkill`; the authenticated peer PID identifies the exact isolated process group. Bounded TERM→KILL closes descendants even if the leader exits immediately after IPC acknowledgement. Completion+rc0 is synchronized. EXIT/INT/TERM/HUP cleanup unlinks socket/readiness/PID/restart state, lock, and heartbeat while leaving the persistent session. Sibling Pi/Hermes processes survive.
7. **Untrimmed controls — medium, fixed:** package validates raw optional instructions before trimming, rejects all C0/DEL/C1 classes, and counts Unicode code points.
8. **Local-turn destination leak — medium, fixed after final review:** `sendUserMessage(..., followUp)` no longer assigns Slack metadata at enqueue time. A cryptographically unpredictable request id is appended, metadata activates only on matching user `message_start`, and Pi's supported `message_end` replacement strips the marker before provider/session use. Behavioral tests prove a local assistant/tool response stays local and two chats/threads with identical text each receive exactly their own response.

## Compatibility review

- Thread replies and originating thread anchors remain package-owned; FIFO serialization now binds them at the actual user-message boundary.
- Existing admin slash handlers and challenge trust checks run before compact recognition.
- Codex recovery remains the sole harness-local co-extension.
- Hermes stays on the generic backend path without Pi session/IPC logic.
- Tokens remain in the source-delete mode-600 runtime environment file.
- No Slack manifest or documentation claims a native `/compact` command.
- Harness remains exact-package-pin based with no `node_modules` patch or vendored package source.

## Gate

**APPROVED after redesign.** No unmitigated high finding remains; final promotion
still requires green fork+harness CI and independent deterministic PR audit.
