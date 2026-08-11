# Final implementation audit

## Scope

Final review findings against harness PR #740 and bridge PR #2:

1. **MEDIUM — active remote destination survives local steering:** closed by recording the source of every active user turn. A correlated remote `message_start` activates that exact destination; any unmarked local/TUI steer or follow-up `message_start` switches delivery back to local without discarding the unresolved remote queue owner. Behavioral bridge tests prove both pre-settlement local steering and a local follow-up after a remote response never post to Slack, the remote queue settles at `agent_settled`, a later remote request still works, and identical cross-chat/thread FIFO remains unchanged.
2. **MEDIUM — signal cleanup skips a group after its Pi leader exits:** closed by treating the already-authenticated recorded PGID as cleanup authority while the group exists, rather than revalidating the departed leader. Signal/EXIT cleanup applies bounded TERM→KILL to that group and removes supervisor state, heartbeat, PID/PGID, socket/restart files, and lock. The behavioral supervisor test preempts cleanup after the leader is gone while a descendant ignores TERM; the descendant dies, an unrelated sibling survives, and all transient state is removed.

## Compatibility review

- Authorization still precedes compact recognition.
- Originating Slack chat/thread acknowledgement and reply routing remain intact.
- `agent_settled` still owns queue release and active-work compaction deferral.
- Compact provider errors, Slack post/disconnect failures, direct-next blocking, generation guards, and untrimmed control validation remain covered.
- The harness still uses isolated `--session-dir --continue`, exact process-group restart, Codex recovery, Hermes generic supervision, private runtime state, and no broad `pkill`.
- No native Slack `/compact` claim, local package patch, vendor copy, or duplicate compact extension was introduced.

## Verification evidence

- Bridge head `4056384d7e3901809019e006185a68987fcc8c0b`: `npm test` (122 tests), `npm run lint`, `npm run typecheck`, and `npm run build` — passed.
- Harness focused supervisor/gateway suites: 36 tests passed, including the exact installed artifact lifecycle and leader-gone signal preemption; the new signal test also passed three repeated focused runs.
- Harness full suite under a clean test environment: 39 files / 491 tests passed.
- Harness lint, format check, typecheck, build, Bash syntax, Dockerized ShellCheck across 36 boot scripts, JSON parse, template parity, exact installed-artifact smoke, and `git diff --check` — passed.
- Eval: 98 probes ran; 94 PASS, 4 environment-appropriate SKIPPED, 0 REGRESSION. Both Slack probes pass at the exact bridge pin.
- Harness CI runs `.oh/scripts/smoke-slack-bridge-artifact.sh`, so the consumer gate installs and exercises the exact reviewed bridge head rather than relying only on source-repository checks.

## Verdict

**AUDIT-PASS for implementation and local gates.** The two reported findings are closed by behavioral controls rather than secret-path or inherited-descriptor assumptions. GitHub promotion remains separately gated on both PR check surfaces; neither PR may be merged.
