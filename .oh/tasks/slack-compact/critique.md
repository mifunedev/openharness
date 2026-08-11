# Adversarial plan critique

## Implementer lens

- **High, mitigated — acknowledgement/compaction ordering:** Calling `compact()` from input or agent lifecycle can invalidate the bridge context before `turn_end` posts. Mitigation: transform into an acknowledgement-only model turn and invoke compaction from this later-loaded extension's `turn_end` only after non-empty assistant text with no tool call; bridge runs its own `turn_end` first by load order.
- **High, mitigated — replayable restart sentinel:** A fixed public log phrase could be replayed from old logs or transcript output. Mitigation: supervisor creates a fresh cryptographic nonce per launch, watcher tails from EOF and exact-matches only that launch's nonce-bound marker, and the extension validates the nonce before enabling requests.
- **Medium, mitigated — callback/lifecycle race:** Compaction can reset extension state before completion. Mitigation: `onComplete` emits the marker without relying on mutable request state; ordinary lifecycle handlers still clear request/in-flight state.
- **Medium, mitigated — restart loops:** Errors must not kill Pi. Mitigation: only `onComplete` emits the marker; `onError` logs a bounded safe message and re-arms state without a marker.
- **Medium, mitigated — scaffold drift:** Root-only files would disappear from `oh init`. Mitigation: mirror the extension and relationship documentation in `.oh/templates/full/.pi/` and guard parity.

## User/security lens

- **High, mitigated — unauthorized or cross-transport trigger:** The extension must not become an auth surface. Mitigation: require the exact bridge Slack stamp and explicitly document that authorization remains owned by the bridge before forwarding.
- **High, mitigated — accidental conversational trigger:** Mentions of “compact” must not compact. Mitigation: full-message alternatives only; `/compact` optional text form is separately parsed and bounded.
- **Medium, mitigated — misleading acknowledgement:** Slack cannot receive a post-compaction completion from the stale process. Mitigation: acknowledgement says request accepted and restart/reconnect follows, not that compaction completed.
- **Medium, mitigated — native slash-command overclaim:** Slack does not route undeclared slash commands. Mitigation: natural message text is primary; docs explicitly say no native Slack `/compact` registration exists.

## Post-build adversarial self-review

- **High, fixed — clean signal exit could suppress required relaunch:** The first supervisor draft restarted only for non-zero Pi exit. If Pi handled supervisor `SIGTERM` gracefully and returned `0`, successful compaction would stop supervision instead of reconnecting. Fixed with a per-launch `restart-trigger` state file written before the kill; clean exits stop only when no recovery trigger exists. The functional test now traps `TERM` and exits `0`, proving a second launch still occurs.
- **Medium, fixed — watcher polling left a wider stale-context window:** GNU `tail -F` defaults to a one-second polling interval. Changed the gateway-container watcher to `tail -s 0.1 -Fn0`, retaining EOF semantics while reducing proactive-restart latency.
- **Medium, fixed — status lacked positive compaction evidence:** Added non-secret `pi.compact` timestamp state and `compaction reconnected … ago` status output/test; nonce data is absent from state.
- **Medium, fixed — instruction-control tests covered only one C0 byte:** Expanded parser tests across tab/newline, DEL, and C1 controls, plus synchronous `ctx.compact` failure and undefined natural-command instructions.
- **Low, accepted residual — same-user process/tool access can observe process environment:** The per-launch nonce is not a credential and is kept out of argv/state/human supervisor lines, but any code running as the same OS user can inspect its own environment. The security boundary remains sandbox/process trust; remote command input never receives the nonce, exact command transformation suppresses arbitrary request text, old markers are ignored from EOF, and every relaunch rotates the nonce.

## Gate

APPROVED. All high-severity findings are fixed and covered by executable tests; no unmitigated high finding remains.
