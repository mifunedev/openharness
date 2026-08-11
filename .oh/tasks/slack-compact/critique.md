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
3. **IPC — high, fixed:** nonce/log sentinel removed. The supervisor opens a private FIFO reader before launch, passes only an inherited write fd, unlinks the FIFO, and accepts one byte. A Node integration proves an ordinary spawned tool lacks the fd while the bridge process can write it; pane/log forgery is inert.
4. **No stale window — high, fixed:** watcher open handshake completes before Pi launch. Package completion closes the logical intake gate immediately, disconnects Slack, then signals. The supervisor settles the watcher before rc evaluation. Immediate completion and direct-next races are tested.
5. **Generation guard — high, fixed:** request id, session generation, and context identity guard late completion/error callbacks. Replacement tests prove old callbacks cannot disconnect or signal the new request.
6. **Exact target/cleanup — high, fixed:** no compact-path `pkill`; watchers signal the recorded exact PID. Completion+rc0 is synchronized. EXIT/INT/TERM/HUP cleanup removes transient watcher/PID/restart state, lock, and heartbeat while leaving the persistent session. A sibling process survives the functional restart.
7. **Untrimmed controls — medium, fixed:** package validates raw optional instructions before trimming, rejects all C0/DEL/C1 classes, and counts Unicode code points.

## Compatibility review

- Thread replies and originating thread anchors remain package-owned.
- Existing admin slash handlers and challenge trust checks run before compact recognition.
- Codex recovery remains the sole harness-local co-extension.
- Hermes stays on the generic backend path without Pi session/IPC logic.
- Tokens remain in the source-delete mode-600 runtime environment file.
- No Slack manifest or documentation claims a native `/compact` command.
- Harness remains exact-package-pin based with no `node_modules` patch or vendored package source.

## Gate

**APPROVED after redesign.** No unmitigated high finding remains; final promotion
still requires green fork+harness CI and independent deterministic PR audit.
