# Standing execution prompt: PM2 Pi supervision study

Implement issue #677 only from this folder's `prd.md` and authoritative schema-version-1 `prd.json`, on branch `feat/677-pm2-pi-supervision`, under First Mate supervision.

## Current phase: docs-only, pre-kickoff

Planning is not complete. US-001 owns the current `critic-prd-alignment` and `critic-execution-safety` re-reviews, remediation of every finding, exact cross-artifact validation, and the task-artifacts-only commit, push, and draft PR to `development`. Those planning actions are permitted before kickoff. The critics have bounded full-report paths `critique-prd.md` and `critique-safety.md`; they append only concise dated ledger entries to `progress.txt`. They do not edit shared artifacts. The First Mate alone writes the synthesis into `assessment.md` and `progress.txt`.

Before US-001 passes, the only permitted mutations are files beneath `.oh/tasks/pm2-pi-supervision/` and Git/GitHub operations strictly needed for the artifact-only commit, branch push, and draft PR. Do not install a package, create or run a fixture/prototype, launch/signal a process, change runtime/config/dependencies, or execute a benchmark.

US-002 is a distinct explicit-human-kickoff gate after US-001 and before every implementation story. It requires a new, unambiguous human statement authorizing issue #677 implementation after the verified draft PR exists. Never infer authorization from issue creation, prior messages, critic approval, commit, push, PR creation/review/merge, or elapsed time. Record the exact quote, source, author, and UTC timestamp in `progress.txt`. Without it, leave US-002 and every later `passes` value false and stop.

## Dependency and delegation protocol

Execute the exact dependency-first graph, priorities, assigned delegates, criteria, commands, and evidence paths in `prd.json`.

- Before each serial briefing, read the latest `progress.txt`.
- A delegate is not done until it appends a dated completion entry and supplies every criterion's evidence at its bounded path.
- Delegates never change `passes`. The First Mate validates each criterion against exact commands/evidence and alone changes pass state.
- Parallelize only graph-independent nodes; do not use priority to bypass dependencies.
- Missing prerequisites, denied safety checks, infeasible transport, unavailable PTY, unavailable fake provider, or unavailable network isolation produce a documented safe `NOT RUN`, never scope expansion.
- Conflicting claims are resolved with evidence or bounded rerun. Rework is a new bounded briefing.
- US-017 and US-018 are independent terminal critics with full reports only at `critique-final-evidence.md` and `critique-final-safety-scope.md`; the First Mate owns terminal synthesis in US-019.

## Immutable production and process boundary

All durable work/evidence stays under `.oh/tasks/pm2-pi-supervision/`. Runtime work uses a fresh `mktemp -d` root. Read-only source inspection is allowed; production runtime content is not.

Do not execute, load, read the contents of, edit, stop, or signal any production bridge, recovery extension, settings, scripts, config, state, lock, log, tmux session, gateway process, or runtime. Do not alter Docker/devcontainer files, manifests, lockfiles, provider settings, images, sessions, defaults, or production configuration. Do not replace/remove tmux; use PM2 cluster/modules/startup/save/resurrect; install globally; add dependencies; or leave a daemon, service, dump, socket, process, or runtime root.

Production pre/post proof is metadata-only: tracked changed-path status, tmux session identity, and process identity as specified in the PRD. Current-side comparisons use cited source and the purpose-built disposable baseline only, never live production log/state/heartbeat/lock/config contents.

Every child starts from `env -i` with only the manifest allowlist and fresh runtime-root `HOME`, XDG homes, `TMPDIR`, and mode-`0700` `PM2_HOME`. Do not inspect, inherit, copy, inventory, or mount ambient credential values/auth stores. The child preflight rejects prohibited key patterns and escaping/non-empty homes before launch.

Deny outbound network or record `NOT RUN`. The sole setup exception is the exact pinned PM2 7.0.3 tarball URL and integrity in the PRD; resolve dependencies offline, and treat a cache miss as `NOT RUN`. No other fetch is allowed. Use only synthetic inputs and a deterministic local fake/test provider. No live Slack connection, credential, external provider, or live/provider-backed model turn is permitted.

Register each owned process immediately by exact PID, parent, `/proc` start time, role, candidate, and namespace. Signal only revalidated registered PIDs. Install idempotent `EXIT`, `INT`, `TERM`, and `HUP` traps plus outer deadlines. Cleanup exact PIDs in reverse order with bounded TERM-to-KILL escalation. Prohibit pattern/global kills, existing tmux targets, `pm2 delete all`, `pm2 kill`, and PM2 commands without explicit fixture `PM2_HOME`. Cleanup failure stops the graph and requires human inspection.

## Candidate, protocol, and benchmark boundary

Treat direct PM2-to-Pi RPC and PM2-to-RPC-host-wrapper-to-Pi RPC as distinct candidates:

- Direct: PM2's script target is Pi `--mode rpc`; prove stdin writer/owner, stdout consumer, ready signal, LF-JSONL path, EOF/exit propagation, and byte/frame losslessness. PM2 logs are not transport. If infeasible, direct is `NOT RUN`.
- Wrapper: only when direct transport is infeasible; PM2 targets a fixture wrapper that owns Pi pipes and a mode-`0600` runtime-root Unix socket. Attribute PM2/wrapper/Pi separately. Never silently substitute or describe it as direct.

RPC handling is lossless bounded UTF-8 LF JSONL with frame sequence/type/count/hash evidence and explicit `extension_ui_request` parsing; malformed or oversized input fails closed with sanitized diagnostics.

Freeze `evidence/benchmark-manifest.json` before observation. Use three independent measured repetitions per runnable candidate/fault, fresh runtime each time, monotonic duration clocks, UTC audit times, fixed ready/idle/detection/recovery/cleanup/total deadlines, frozen fault order, censored timeout failures, median/min-max plus `n/3`, no selective retries or imputation, and the preregistered lexicographic evidence ordering. Amendments invalidate and fully rerun affected comparisons.

The synthetic sentinel keeps the same child PID alive/running, emits `SYNTHETIC_STALE_CONTEXT` on the common public stderr surface, and blocks synthetic ordinary work. No hidden candidate channel is allowed. Attribute detection/recovery to the actual component, and call the result a simulation rather than proof of Slack stale-context recovery.

Use synthetic data only. Enforce line/frame/total/log caps, sanitize paths and control characters, retain structured summaries/hashes where possible, and run the deterministic secret/personal-data scan before staging. A scan finding fails the story and blocks commit/push.

## Evidence and terminal output

Every claim in `assessment.md` is `SOURCE-VERIFIED`, `LIVE-VERIFIED`, `LIVE-UNVERIFIED`, or `NOT RUN` and links to its bounded task-local evidence. Preserve exact sanitized commands, UTC and monotonic times, exit codes, candidate/component PIDs, versions, protocol counts/hashes, fault/recovery fields, production metadata deltas, and cleanup proof.

Run each story's exact bounded command plus the shared `node --test`, `node --check`, and secret-scan commands. Every required command must exit `0`; never use `|| true`, ignored failures, or unbounded commands as pass evidence.

The final output is evidence scores, ties, uncertainty, blockers, and residual responsibilities only. Do not label any candidate `adopt`, `recommended`, or `winner`; authorize migration/rollout; provide proposed production PM2 configuration; change defaults; or mutate production. Any selection requires a separate human-approved issue or ADR after the two terminal critics and First Mate synthesis.
