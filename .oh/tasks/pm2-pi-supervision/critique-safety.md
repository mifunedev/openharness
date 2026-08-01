# critic-execution-safety — user/safety-lens audit

**Date:** 2026-08-01 01:48 UTC
**Scope:** `.oh/tasks/pm2-pi-supervision/{prd.md,prd.json,prompt.md,assessment.md,critique-prd.md,progress.txt}` plus read-only local Git state
**Verdict:** **FAIL** — unresolved high-severity findings remain.
**Finding count:** **H7 / M6 / L0**.

## Severity rule

- **H:** can authorize work before the user's gate, expose live credentials, mutate or interfere with production/runtime state, make cleanup unsafe, or make the principal PM2/RPC experiment materially different from the candidate being ranked. Must be fixed before the planning gate passes.
- **M:** does not itself authorize immediate unsafe execution because stronger global text exists, but leaves evidence, reproducibility, security, or decision boundaries too ambiguous for a safe implementation kickoff.
- **L:** editorial only.

## Executive assessment

The artifacts contain several sound intentions: exact PM2 version pinning, explicit RPC mode, no Slack bridge in controls, unique disposable naming, source/live evidence labels, a process-exit versus semantic-health distinction, and a stated no-adoption boundary. They are not yet safe to execute.

The latest sequencing instruction is contradicted in every operational artifact: the current plan puts explicit kickoff before critics and the draft PR, while the user requires this planning task to finish critics, validation, and an artifact-only draft PR first, with a later explicit kickoff gating US-002 and all implementation. Separately, the proposed “credential-free” RPC turn can invoke a real model provider unless a deterministic credentialless provider is specified; PM2's default shared daemon/home is not isolated; cleanup and fault injection are not PID/namespace bounded; and the direct-PM2 RPC transport topology is not defined well enough to know what process PM2 is actually supervising.

Local Git evidence also disproves the current “PLANNING COMPLETE” status: `HEAD` equals local `development` at `c059690c`, the branch is 0 ahead / 0 behind, all task files are ignored by `.gitignore:12` (`.oh/tasks/*`), `git ls-files .oh/tasks/pm2-pi-supervision` is empty, and the worktree is clean. There is therefore no current artifact diff from which the required draft PR can be formed.

## Boundary-by-boundary result

| Boundary | Result | Summary |
|---|---|---|
| Latest planning/kickoff sequence | **FAIL (H)** | Kickoff is incorrectly required before critics and the artifact-only draft PR. |
| Isolation | **FAIL (H)** | Unique process names do not isolate PM2's daemon, home, logs, dump, sockets, or ambient HOME/XDG state. |
| No live credentials | **FAIL (H)** | A real `sendUserMessage()` turn may consume ambient model/provider credentials; only Slack tokens are concretely named. |
| Production non-mutation | **FAIL (H)** | No safely bounded mutation/cleanup command contract or objective pre/post non-mutation oracle exists. |
| Cleanup | **FAIL (H)** | Failed assertion is covered in prose, but signals, timeouts, orphaned descendants, PM2 daemon state, and broad cleanup hazards are not. |
| No adoption decision | **PARTIAL (M)** | The prohibition exists, but “ranking” can still become a recommendation or migration design without a separate decision gate. |
| Security caveats | **PARTIAL (M)** | Stdin EOF and protocol-frame caveats are present; secret discovery, output sanitization, hostile/large JSONL, and log retention are not. |
| Objective metrics/repetitions | **FAIL (M)** | No preregistered repetitions, timeouts, ready signal, clock, aggregation, or decision thresholds. |
| PM2/RPC feasibility | **FAIL (H)** | No defined bidirectional stdin/stdout ownership for a PM2-daemonized Pi RPC child; a wrapper would change the candidate. |
| Artifact-only draft PR | **FAIL (H)** | Current task files are ignored/untracked and the branch has no diff from `development`. |

## High-severity findings

### H-01 — The explicit-kickoff gate is in the wrong place throughout the task

**Evidence**

- `prd.md` Introduction says no benchmark may begin until kickoff, two critics approve, and the draft PR exists; US-001 then requires the kickoff ledger entry before US-001 can pass.
- `prd.json` makes US-002 depend only on US-001 and embeds kickoff inside US-001's criteria rather than representing a later gate.
- `prompt.md` forbids touching GitHub state before kickoff, then requires the task-artifact draft PR only “after kickoff.”
- `assessment.md` says both critics run “after explicit kickoff.”
- `progress.txt` says planning is complete and awaiting kickoff even though one critic has failed, this critic had not run, validation is absent, and the artifact-only draft PR is absent.
- The user's latest order is the opposite: **planning ends with critics + validation + artifact-only draft PR; implementation and US-002+ wait for a later explicit kickoff**.

**Impact**

The written workflow either blocks completion of the present planning task or encourages an operator to interpret kickoff as permission to start implementation before planning has reached its required terminal state. Because US-002 has no independent kickoff dependency, a future rewrite of US-001 could also accidentally unlock implementation without a dated later authorization.

**Exact remediation**

1. In both PRD forms, make US-001 contain only critic reports, resolution of all high findings, deterministic artifact validation, and creation/verification of the task-artifacts-only draft PR to `development`.
2. Add an explicit `human-kickoff-US-002-plus` node after passed US-001. Make US-002 depend on both US-001 and a dated kickoff record; transitively keep US-003+ blocked.
3. Revise `prompt.md` to permit only task-artifact edits, validation, commit/push, and draft-PR creation before kickoff, while continuing to forbid installs, prototypes, runtime/process changes, and experiments.
4. Revise `assessment.md` and `progress.txt` so critic/validation/PR work is pre-kickoff and the status remains `PLANNING IN PROGRESS` until the draft PR is evidenced. Do not backfill or infer kickoff.

### H-02 — The safety critic's required output contract is impossible to satisfy

**Evidence**

US-001 in both PRD forms requires `critic-execution-safety` to record evidence in `assessment.md`. This bounded critic assignment requires the full report only in `critique-safety.md`, a concise ledger append in `progress.txt`, and forbids editing other artifacts. `critique-prd.md` identifies the same structural mismatch for the alignment critic.

**Impact**

A compliant critic necessarily fails the current acceptance criterion; satisfying the criterion would require violating the user's least-write/scope restriction. That makes honest gate validation impossible and trains later delegates to override bounded permissions.

**Exact remediation**

Change the mirrored US-001 criterion to require this standalone report at `.oh/tasks/pm2-pi-supervision/critique-safety.md` and the alignment report at `critique-prd.md`. Assign any synthesis into `assessment.md` to `first-mate-gate` only after both reports exist. Require each critic's dated verdict and count in `progress.txt`; never require a critic to write outside its briefing.

### H-03 — The required artifact-only draft PR has no committable artifact diff

**Evidence**

Read-only local Git checks at 2026-08-01 01:48 UTC show:

- branch `feat/677-pm2-pi-supervision` is at `c059690c`, identical to local `development` (ahead/behind `0/0`);
- `git status --short` is empty;
- `git ls-files .oh/tasks/pm2-pi-supervision` returns no paths;
- every inspected task artifact is ignored by `.gitignore:12` (`.oh/tasks/*`).

`progress.txt` itself says no commit, push, or PR action was performed, yet labels planning complete.

**Impact**

A normal add/commit produces no change and no meaningful draft PR. An operator could open an empty or unrelated PR, or add broader ignored content, while claiming the artifact-only gate passed.

**Exact remediation**

After all high findings are repaired and both critics re-pass, the First Mate must explicitly add only the approved task files (using the repository's intentional ignored-artifact procedure), then verify the staged and eventual PR path list is non-empty and every path is under `.oh/tasks/pm2-pi-supervision/`. Record commit, PR URL/number, base `development`, draft state, and exact changed-path proof. Keep implementation/runtime files absent. Supersede—not silently edit away—the premature planning-complete ledger status.

### H-04 — “Credential-free” conflicts with the required model turn and does not block ambient credential discovery

**Evidence**

- The root description calls the study credential-free.
- US-002 names Slack token absence and “other live service credential,” but requires only a redacted environment-key inventory.
- US-003 requires a probe extension to call `sendUserMessage()` and observe `turn_end`. A normal Pi turn can invoke a configured model provider and therefore use provider API credentials, local auth stores, settings, or network services even without Slack.
- `prompt.md` concretely prohibits live Slack credentials, not every model/provider/GitHub/cloud credential or ambient credential store.
- The plan does not isolate `HOME`/XDG/config, start from an allowlisted environment, provide a deterministic local fake provider, or deny outbound network.

**Impact**

The experiment can consume billable/live model credentials or expose unrelated host secrets while still satisfying the named Slack checks. A list of redacted key names does not prove values were unavailable to the child, and reading the ambient environment merely to inventory it expands exposure.

**Exact remediation**

Define a credentialless execution contract before kickoff: launch all fixture processes from an explicit allowlisted environment (not inherited then merely redacted), with disposable `HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, and temp directories; enumerate prohibited credential key patterns and auth/config paths; use a deterministic local fake/test provider or a probe that does not invoke an external model; and block or tightly allowlist outbound network. Capture only allowlisted key names, never ambient values. Add a negative preflight that aborts before process launch if a prohibited key/path is visible, plus a post-run secret scan of task evidence. If a real provider is required, the task is not credential-free and must be separately re-scoped and explicitly authorized.

### H-05 — PM2's shared daemon/state is not isolated by a unique process name

**Evidence**

The artifacts require unique process/session names and a disposable install, and `prd.md` non-goals reject a persistent daemon/dump/global install. They never require a unique disposable `PM2_HOME` on every PM2 invocation, nor isolate PM2 sockets, logs, pids, modules, dump files, or its daemon from any existing user PM2 runtime. `prd.json`, the authoritative execution list, omits the PM2-daemon non-goals identified by `critique-prd.md` M-03.

**Impact**

A local temporary npm package can still connect to the user's default PM2 daemon and mutate its process list. Cleanup commands such as `pm2 delete all` or `pm2 kill` could terminate unrelated services; leaving the daemon alive violates teardown and persistence boundaries.

**Exact remediation**

Make a freshly created, mode-0700 directory the unique `PM2_HOME` and disposable `HOME` for **every** PM2 command and child. Assert before launch that the PM2 home is inside the fixture root and has no pre-existing daemon/socket/process list. Prohibit `startup`, `save`, `resurrect`, modules, cluster mode, global installs, default-home PM2 commands, and broad `delete all`/`kill` operations. Teardown only the isolated PM2 instance, verify its daemon/socket/PIDs are gone, and remove its home. Any command missing the fixture environment must fail closed.

### H-06 — Fault injection and cleanup are not safely bounded or complete

**Evidence**

US-002 promises cleanup after failed assertions, and the benchmark lists crashes, SIGTERM, rapid loops, and a live-unhealthy sentinel. No artifact defines PID ownership, descendant tracking, signal/timeout/interrupt traps, command deadlines, safe kill targets, cleanup idempotency, or how to distinguish fixture PIDs from production Pi/tmux/PM2 processes. No pre/post oracle proves existing sessions/processes and tracked runtime/config paths were unchanged. US-005's request to compare “current state/heartbeat/log surfaces” also conflicts with US-002's prohibition on reading those live surfaces.

**Impact**

A hung test, cancellation, shell death, or partial PM2 startup can leave daemons and children behind. Name-based or global cleanup (`pkill`, `killall`, `tmux kill-server`, `pm2 delete all`, default-home `pm2 kill`) could terminate production. Conversely, the current no-read language makes it impossible to produce objective non-mutation evidence.

**Exact remediation**

Specify a fixture-owned process registry created from exact spawn results and isolated PM2 metadata. Allow mutations/signals only to verified descendant PIDs and the exact unique namespace; explicitly ban broad name/global kill commands and existing tmux targets. Install idempotent cleanup traps for normal exit, assertion failure, `INT`, `TERM`, and timeout, with bounded TERM→KILL escalation only for owned PIDs. Record pre/post **metadata-only** snapshots needed to prove non-mutation (existing session/process identifiers and tracked-path Git state, without reading production logs/config contents), fixture-root residue checks, owned-PID liveness checks, and isolated PM2 daemon/socket absence. Define what happens if cleanup itself fails: stop the graph, record FAIL, and require human inspection before any rerun.

### H-07 — The PM2/RPC candidate has no defined feasible bidirectional transport topology

**Evidence**

- US-003 says PM2 starts Pi directly in `--mode rpc`, the fixture sends LF-delimited JSONL, retains stdin, and parses stdout frames.
- `assessment.md` correctly notes that RPC lives only while stdin remains open and that PM2 child-stdin behavior is unverified.
- The plan does not say what process owns Pi's stdin/stdout once PM2 daemonizes it, how an external fixture writes commands to that exact stdin, or how stdout remains a lossless protocol stream instead of PM2 log output.
- PM2 process messaging is not specified as a byte stream to a non-PM2-aware Pi RPC process. Introducing a wrapper/RPC-client process could solve transport, but PM2 would then supervise the wrapper, not necessarily Pi directly, changing lifecycle, restart, PID, status, and cleanup conclusions.
- An extension that self-injects `sendUserMessage()` sidesteps only one input; it does not demonstrate the stated general RPC-client contract.

**Impact**

Implementation may stall, silently broaden into wrapper development, benchmark a different process boundary, or parse lossy logs as protocol. Results could falsely attribute wrapper behavior to PM2 supervising Pi.

**Exact remediation**

Add a post-kickoff, pre-benchmark feasibility story that defines and tests one topology with no live credentials: exact PM2 `script` target, parent/child tree, stdin owner, stdout consumer, ready signal, command transport, EOF behavior, exit-code propagation, and frame-loss check. If direct PM2→Pi cannot provide a safe bidirectional channel, mark that direct candidate `NOT RUN` with evidence. Any wrapper must become a separately named candidate, with PM2-versus-wrapper responsibilities measured independently; it must not be substituted silently. US-003 and downstream stories must handle feasibility failure without pretending the candidate ran.

## Medium-severity findings

### M-01 — Metrics and repetitions are not preregistered

**Evidence:** The plan asks for a “declared observation window,” common timing, recovery latency, and complete rows, but gives no ready event, number of repetitions, warmup policy, monotonic clock, timeout, sampling interval, aggregation, variance, success threshold, or treatment of failed/censored runs.

**Impact:** A delegate can choose windows or stop after a favorable run, and a ranking can rest on incomparable single observations.

**Exact remediation:** Before any run, version a benchmark manifest in the task folder defining the ready signal, monotonic timestamps, identical fault schedule, per-step timeout, idle window, at least three independent repetitions per runnable candidate/fault (or a justified higher count), teardown/recreate between repetitions, raw per-run results, median/range or p50/p95 as appropriate, failure/censor handling, and predetermined ranking rules. Never alter it after seeing results without a dated protocol amendment and complete rerun.

### M-02 — The synthetic stale-context sentinel can overclaim semantic recovery

**Evidence:** US-005 calls for a sentinel “equivalent to the stale-context class” but does not define equivalence, detection channel, child-alive invariant, or expected recovery. The source baseline says the real supervisor watches a specific stderr signature, clears a bridge lock, and restarts a still-live Pi.

**Impact:** A fixture-authored health endpoint or deliberate process exit can make PM2 appear to solve a semantic failure it cannot detect in production.

**Exact remediation:** Define the sentinel before runs: child remains alive and externally appears running; a deterministic synthetic symptom is emitted on the same class of channel under comparison; ordinary work remains blocked; no candidate-specific helper receives privileged knowledge. Record whether detection comes from PM2, a wrapper, or the retained custom watchdog. Label it a simulation, not proof of Slack stale-context recovery.

### M-03 — “Rank” can still become an adoption recommendation

**Evidence:** The artifacts repeatedly say no adoption decision, but US-006 requires ranking and prerequisites without defining the terminal output boundary or requiring a later decision record.

**Impact:** A numbered winner, “recommended” label, or migration-ready configuration can function as a de facto adoption decision even if no production file changes in this task.

**Exact remediation:** Restrict US-006 to evidence scores, uncertainty, blockers, and residual responsibilities. Prohibit “adopt,” “recommended,” “winner,” migration authorization, production rollout steps, and default architecture changes. State that any selection requires a separate human-approved issue/ADR after final critics; all generated PM2 config remains disposable evidence, not proposed production configuration.

### M-04 — Evidence capture lacks a confidentiality and parser-abuse policy

**Evidence:** The evidence template retains exact commands, protocol frames/counts, and logs. The plan recognizes high-frequency `extension_ui_request` frames but sets no maximum line/frame size, malformed-JSON behavior, output retention limit, synthetic-payload rule, path scrubbing, or secret scan before task artifacts enter a PR.

**Impact:** Ambient paths, tokens, model content, control characters, or unbounded frames can leak into a durable PR or exhaust the fixture/parser.

**Exact remediation:** Use synthetic prompts/data only; store structured summaries and hashes where raw content is unnecessary; bound line/frame size and total output; fail closed on malformed/oversized JSONL while preserving a sanitized diagnostic; escape control characters; redact home/worktree paths where not needed; and run a deterministic secret/personal-data scan before staging artifacts. Never commit raw ambient environment or provider/Slack output.

### M-05 — The baseline fixture is not concretely separated from production assets in authoritative criteria

**Evidence:** US-002 says “baseline” and compares current behavior, but does not name the disposable substitute executable/config. The stronger prohibition on loading the production bridge is global in `prompt.md` and explicit for US-004 controls, not mirrored into the US-002 authoritative acceptance criteria. `prd.json` also omits several non-goals.

**Impact:** A delegate following the story alone could copy or invoke the production supervisor/bridge/settings to make the baseline “representative,” creating locks, logs, state, or network attempts even without tokens.

**Exact remediation:** Define the baseline as a purpose-built credentialless fixture that reproduces only the measured lifecycle contract. Mirror into every execution story: do not execute or load the production bridge, recovery extension, settings, scripts, config, state, lock, log, or tmux session; source files may be inspected read-only only. List the exact fixture-owned files and paths.

### M-06 — “Tests pass” and “Typecheck passes” are not safe, deterministic gates

**Evidence:** Every story repeats generic test/typecheck criteria without exact commands, working directories, expected exit codes, network/runtime side effects, or evidence destinations. The current planning phase itself is not implementation and has no declared artifact-validation command set.

**Impact:** Delegates can run different or side-effecting commands, claim irrelevant repository checks, or start runtime work while attempting to satisfy a vague gate.

**Exact remediation:** Define exact, non-interactive, bounded commands per story, their cwd/environment, expected exit code, timeout, network policy, and task-local result section. Give US-001 artifact-only checks (`jq`, required-file/path/schema/all-false/graph/gate consistency and changed-path validation) that cannot launch PM2 or Pi. Give later fixture tests their own commands after kickoff. Do not use ignored failures or commands that touch production state.

## Required re-review conditions

This critic may return PASS only when all of the following are true:

1. The planning sequence is consistent in `prd.md`, `prd.json`, `prompt.md`, `assessment.md`, and `progress.txt`: critics, remediation, deterministic artifact validation, and a task-only draft PR occur before a distinct later explicit kickoff; US-002+ cannot start before that kickoff.
2. Critic reports have bounded task-local output paths, and First Mate synthesis—not critic scope violation—updates shared assessment state.
3. The task files are intentionally included in a non-empty draft-PR diff whose base is `development` and whose changed paths are exclusively under `.oh/tasks/pm2-pi-supervision/`.
4. A credentialless provider/network/environment design makes the RPC probe unable to discover or use any live Slack, model, GitHub, cloud, or other service credential.
5. PM2 uses a unique disposable `PM2_HOME`/HOME and cannot attach to or clean up the default/existing PM2 daemon.
6. Fault injection and cleanup are exact-PID/namespace bounded, trap signals/timeouts, prove no owned process or fixture state remains, and cannot issue global production-affecting commands.
7. The direct PM2/RPC transport topology is explicit and has a safe `NOT RUN` path; wrappers are separate candidates rather than silent substitutions.
8. Metrics/repetitions, semantic-sentinel semantics, evidence sanitization, exact verification commands, and no-adoption output limits are preregistered.
9. Both existing high-severity alignment findings and this report's high-severity safety findings are remediated in both PRD forms before either critic is asked to re-review.

**Final verdict: FAIL (H7 / M6 / L0).**

## Re-review — 2026-08-01 02:14 UTC

**Scope:** Bounded re-review of all current task artifacts, the alignment critic's re-review, the original safety report above, and read-only Git state. The original report is preserved. The intentionally uncommitted/ignored branch state was not treated as missing final PR proof; US-001's explicit pre-PR force-add procedure was reviewed as the proposed remediation.

### Prior H/M remediation verification

| Prior finding / required boundary | Result | Current evidence |
|---|---|---|
| H-01 sequence | Resolved | US-001 owns both re-reviews, remediation, artifact validation, artifact-only commit/push, and draft PR. Distinct US-002 requires a new post-US-001 human kickoff; US-003–US-019 are transitively blocked. `prompt.md`, `assessment.md`, and the latest `progress.txt` state preserve that order; no kickoff record exists. |
| H-02 bounded critic writes | Resolved | Full reports are bounded to `critique-prd.md` and `critique-safety.md`; concise critic ledger entries are permitted in `progress.txt`; only the First Mate synthesizes shared assessment/pass state. |
| H-03 committable artifact procedure | **Partially resolved; M-01 remains** | US-001 explicitly uses `git add -f`, non-empty staged-path proof, task-folder-only staged-path proof, branch-specific commit/push, and draft-PR base/head/draft/file verification. `git add -n -f` currently enumerates exactly the seven intended task files. However, its pre-stage `git diff --check` is vacuous for this ignored/untracked folder and no post-stage cached equivalent exists. |
| H-04 credentialless environment/network | Resolved | The normative contract uses `env -i`, constructed allowlisted keys only, fresh runtime-root HOME/XDG/TMP, prohibited credential-key/path preflight without ambient-value inspection, denied network or safe `NOT RUN`, one exact integrity-pinned PM2 tarball setup exception, offline dependency resolution, deterministic local fake provider, and no live/provider-backed turn. |
| H-05 isolated PM2 state | Resolved | Every PM2 command must use fresh mode-`0700` runtime-root `PM2_HOME`; default/shared PM2 state, persistence features, global install, broad delete/kill, and commands missing the explicit fixture environment are prohibited. |
| H-06 bounded cleanup/PIDs | Resolved | Immediate PID/PPID/`/proc` start-time/role/candidate/namespace registration, descendant or isolated-PM2 ownership proof, PID/start-time revalidation before signals, traps plus outer timeout, reverse-order bounded TERM→five-second wait→revalidated KILL, idempotent cleanup, residue/socket/metadata/death proofs, and stop-on-cleanup-failure are explicit. Pattern/global kills and production tmux targets are forbidden. |
| H-07 direct-vs-wrapper RPC topology | Resolved | Direct means PM2's exact script target is Pi `--mode rpc`, with stdin writer/owner, stdout consumer, ready/EOF/exit and losslessness proof; PM2 logs are not transport and infeasibility is `NOT RUN`. The conditional wrapper is separately named, PM2 targets the wrapper, the wrapper owns Pi pipes plus a mode-`0600` runtime-root socket, and PM2/wrapper/Pi attribution remains separate. |
| M-01 repetitions/metrics | Resolved | The pre-observation manifest freezes three independent measured repetitions per runnable candidate/fault, fresh roots, monotonic-ns and UTC clocks, ready/idle/detection/recovery/cleanup/total deadlines, fault order, censored failures, no retries/imputation, median plus inclusive min-max and `n/3`, lexicographic ordering, ties/`NOT RUN`, and amendment/full-rerun rules. |
| M-02 sentinel | Resolved | The same child stays alive and externally running during the synthetic fault, emits exact `SYNTHETIC_STALE_CONTEXT` on the common public surface, blocks ordinary synthetic work, exposes no hidden candidate signal, requires component attribution, and is labeled a simulation. |
| M-03 no-adoption boundary | Resolved | Output is limited to evidence, ties, uncertainty, blockers, and residual responsibilities; no selection label, migration/rollout/default change, production configuration, or production mutation is authorized. Selection requires a separate human-approved issue or ADR. |
| M-04 evidence confidentiality/parser abuse | Resolved | Synthetic-only payloads, 64-KiB line/10,000-frame/8-MiB repetition bounds, fail-closed malformed/oversized handling, escaped controls, frame metadata/hashes, 1-MiB retained-log caps, path scrubbing, structured summaries, and deterministic credential/personal-data scanning before staging are explicit. |
| M-05 baseline separation | Resolved | The baseline is purpose-built and credentialless; production bridge/supervisor/extensions/settings/config/state/locks/logs/tmux assets cannot be executed or loaded. Production checks are metadata-only and comparisons use cited source plus the disposable baseline. |
| M-06 exact verification commands | **Not fully resolved; see M-01** | Runtime stories now name bounded exact commands, cwd convention, exit policy, shared test/syntax/secret-scan gates, evidence paths, and `verification.jsonl`. US-001's ignored-artifact diff check remains an objective false-positive gate. |

### Read-only checks performed

- Required-file, branch, `jq empty`, schema/branch/19-story/all-false/all-empty/sorted-priority, and current `git diff --check` commands exited `0`.
- JSON story IDs/priorities, delegates, task-graph mirrors, dependencies, and topological ordering passed scripted checks; the alignment report ends `PASS (H0 / M0 / L0)`.
- `git ls-files .oh/tasks/pm2-pi-supervision` reports zero tracked files and `git status --short --ignored` reports the folder ignored, as expected pre-PR. `git add -n -f -- .oh/tasks/pm2-pi-supervision` lists exactly `assessment.md`, both critique files, `prd.json`, `prd.md`, `progress.txt`, and `prompt.md`.
- No `KICKOFF issue=#677` line exists. No install, process, PM2, network, fixture, or benchmark command was run.

### M-01 — US-001's diff validation is a false-positive check for the ignored artifacts

**Evidence:** US-001 runs `git diff --check -- .oh/tasks/pm2-pi-supervision` before `git add -f`. All seven files are ignored and untracked, so Git has no diff to inspect and exits `0` regardless of their content. The later staging procedure checks only staged path names and does not run `git diff --cached --check`. A direct read-only `git diff --no-index --check` demonstrates that the proposed staged content currently contains blank-at-EOL findings (including Markdown hard-break whitespace), which the required pre-stage command never sees.

**Impact:** The exact US-001 verification transcript can claim artifact diff validation while checking zero artifact bytes. This leaves prior M-06's deterministic-gate remediation incomplete and can commit content that a real staged-diff check rejects.

**Exact fix:** In mirrored US-001 criteria and gate text, move the whitespace/diff validation after the intentional force-add and require `git diff --cached --check -- .oh/tasks/pm2-pi-supervision` before commit. First reconcile the intentional Markdown hard breaks with the repository's whitespace policy (remove/replace them, or define and use one explicit reviewed exemption consistently); then record the cached-check command and exit in `progress.txt`. Keep the existing non-empty and task-folder-only staged-path checks. Re-run this bounded safety review after remediation.

Final verdict: FAIL (H0 / M1 / L0).

## Second re-review — 2026-08-01 02:19 UTC

**Scope:** Second bounded re-review of the exact M-01 remediation in `prd.md` and `prd.json`, semantic parity, and artifact whitespace. History above is preserved; no files were staged and no implementation/runtime action was performed.

### Verification

- **M-01 resolved:** Mirrored US-001 criterion 4 now places whitespace validation after `git add -f -- .oh/tasks/pm2-pi-supervision` and explicitly requires `git diff --cached --check -- .oh/tasks/pm2-pi-supervision` before commit, while retaining the non-empty and task-folder-only staged-path gates and progress recording.
- **Semantic parity:** The Markdown and JSON US-001 title, description, five criteria, dependencies, delegate, evidence, priority, and false/empty initialization agree. The fix introduces no sequencing, scope, credential, isolation, cleanup, RPC-topology, metrics, evidence, or no-adoption regression.
- **Whitespace:** Independent byte-level trailing-whitespace/CR/final-LF checks and `git diff --no-index --check` inspection report clean content for all seven task artifacts: `assessment.md`, `critique-prd.md`, `critique-safety.md`, `prd.json`, `prd.md`, `progress.txt`, and `prompt.md`.
- **State:** Branch is `feat/677-pm2-pi-supervision`; the task folder remains ignored and unstaged, consistent with this critic's bounded no-stage scope. The cached check is correctly required for the later First Mate staging gate rather than falsely claimed as executed here.

No new high-, medium-, or low-severity finding was found.

Final verdict: PASS (H0 / M0 / L0).
