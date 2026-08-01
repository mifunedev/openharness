# PM2 Pi Supervision Assessment

## Current status

Planning remediation only. No fixture, install, prototype, model/provider turn, process launch, fault injection, benchmark, artifact commit/push, or draft PR has occurred in this task.

The earlier `PLANNING COMPLETE — AWAITING EXPLICIT KICKOFF` ledger status is superseded. Both initial critic reports currently record FAIL. Their H/M findings have been remediated in the shared planning artifacts and now await bounded critic re-review. US-001 remains false until both reports contain new PASS verdicts with no unresolved H/M, the First Mate validates exact artifact parity, and the task-folder-only commit/push/draft PR to `development` is proven. US-002 remains a separate later gate; no human kickoff has been recorded or inferred.

## Evidence vocabulary

- **SOURCE-VERIFIED:** directly supported by a cited source inspected for planning.
- **LIVE-VERIFIED:** observed after explicit kickoff in the isolated fixture with bounded command/evidence.
- **LIVE-UNVERIFIED:** source-derived or planned behavior not yet observed in the isolated fixture.
- **NOT RUN:** a planned run safely did not execute; its exact prerequisite or blocker must be recorded.

No current claim is `LIVE-VERIFIED`.

## Source baseline

Inspection date: 2026-08-01.

| Claim | Status | Evidence |
|---|---|---|
| The current Pi gateway starts a detached `client-slack-pi` tmux session, launches the shell supervisor inside it, and mirrors the pane to a log with `tmux pipe-pane`. | SOURCE-VERIFIED | Open Harness commit `c059690c3142e39fa5288a7ff2e31c6822242688`: `.oh/scripts/gateway.sh` lines 205-209. |
| The shell supervisor launches Pi without `--mode rpc`, retains pane PTY semantics, redirects stderr, maintains heartbeat/state, caps logs, watches for `ctx is stale`, clears the bridge lock, restarts non-zero exits after three seconds, and stops on exit 0. | SOURCE-VERIFIED | Same commit: `.devcontainer/client-slack-supervise.sh` comments and lines 47-157. |
| Pi selects RPC when `parsed.mode === "rpc"`; otherwise non-TTY stdin or stdout selects print mode, while two TTYs select interactive mode. | SOURCE-VERIFIED | Installed `@earendil-works/pi-coding-agent` 0.82.1: `dist/main.js` lines 78-88 and 423. |
| Pi RPC uses stdin/stdout LF-delimited JSONL, emits responses/events, and maps extension UI calls to `extension_ui_request` frames. | SOURCE-VERIFIED | Pi 0.82.1 `docs/rpc.md` lines 1-37 and 1145-1168; `dist/modes/rpc/rpc-mode.js` lines 1-29 and 39-99. |
| Pi RPC installs a stdin `end` handler that shuts down and otherwise remains alive. | SOURCE-VERIFIED | Pi 0.82.1 `dist/modes/rpc/rpc-mode.js` lines 624-638. |
| The pinned bridge injects transport messages through `pi.sendUserMessage(..., {deliverAs: "followUp"})` and sends responses from a `turn_end` handler. | SOURCE-VERIFIED | `ryaneggz/pi-messenger-bridge` commit `dca59db0482e97a9ef85e1a3a49da937e9b94bc5`, `src/index.ts` lines 183-188 and 214-238: https://github.com/ryaneggz/pi-messenger-bridge/blob/dca59db0482e97a9ef85e1a3a49da937e9b94bc5/src/index.ts#L183-L238 |
| PM2 7.0.3 is published for Node >=18 with integrity `sha512-zRJOdburpb9OEPB0uqoNT8C1Gp7hPJPVy4Kr67XJNuT9UlMQcOt1WXrYQUmwqKPHk8FyauvP1CPhqoCrCaPw0Q==`. | SOURCE-VERIFIED | `npm view pm2@7.0.3 version engines dist.integrity`; upstream tag commit `01d4f6d59c5eaf4ff6683bb38824dcf38d25b289`: https://github.com/Unitech/pm2/tree/v7.0.3 |
| PM2 7.0.3 restart logic supports autorestart controls, stop exit codes, restart delay, restart counts, and an errored state after excessive unstable restarts. | SOURCE-VERIFIED | https://github.com/Unitech/pm2/blob/v7.0.3/lib/God.js#L414-L424 and https://github.com/Unitech/pm2/blob/v7.0.3/lib/God.js#L455-L519 |
| PM2 exposes process listing, logs, and terminal monitoring. | SOURCE-VERIFIED | https://github.com/Unitech/pm2/blob/v7.0.3/README.md#L80-L87 and https://github.com/Unitech/pm2/blob/v7.0.3/README.md#L159-L198 |

Read-only source inspection above does not authorize reading production runtime logs, state, heartbeat, locks, config contents, sessions, or process content during implementation. The disposable baseline is the only runtime comparison surface.

## Pre-kickoff planning gate

### Bounded current critic reports

| Critic | Full report path | Current verdict | Re-review requirement |
|---|---|---|---|
| `critic-prd-alignment` | `.oh/tasks/pm2-pi-supervision/critique-prd.md` | PASS, H0/M0/L0 at final re-review | Verified all 19 stories, graph fields, Ralph initialization, kickoff order, sizing, and mirrored Typecheck criteria. Original H5/M6/L0 report is preserved as history. |
| `critic-execution-safety` | `.oh/tasks/pm2-pi-supervision/critique-safety.md` | PASS, H0/M0/L0 at second re-review | Verified sequencing, credential/isolation/cleanup/RPC/evidence/decision boundaries and the post-force-add cached diff check. Original H7/M6/L0 and intermediate M1 reports are preserved as history. |

Critics did not edit this assessment or shared pass state. The First Mate performs the synthesis below.

### First Mate critic synthesis

**PASS (H0 / M0 / L0).** The First Mate reviewed both bounded report histories and their latest exact PASS footers. Former findings are remediated in the normative artifacts: US-001 now owns critics, validation, force-add, cached-diff verification, commit/push, and draft-PR proof; US-002 is the separate post-planning human kickoff gate; US-003 through US-019 are Ralph-sized and transitively blocked; all stories have objective mirrored criteria, dependency-first priorities, assigned delegates, `passes: false`, and empty `notes`. The execution contract now fail-closes ambient credentials/network, isolates homes and PM2 state, bounds owned-PID cleanup, separates direct and wrapper RPC candidates, preregisters repetition/metrics, bounds evidence, and prohibits adoption or production mutation. This synthesis approves the task artifacts for the artifact-only draft PR; it does not record kickoff or authorize implementation.

### Artifact-only draft PR proof

Pending. US-001 requires a non-empty intentional ignored-artifact stage, artifact-only commit, branch push, and draft PR based on `development`; every changed path must begin `.oh/tasks/pm2-pi-supervision/`. Record commit, PR number/URL, base/head/draft state, and exact file list in `progress.txt`. No implementation/runtime path is permitted.

### Explicit human kickoff

Not recorded. US-002 begins only after US-001 passes and requires a new explicit human authorization with exact quote/source/author/UTC timestamp. Critic approval, the artifact commit/push/draft PR, review, merge, issue state, prior instructions, or time passage do not imply kickoff.

## Registered candidate definitions

| Candidate | Exact boundary | Current status |
|---|---|---|
| Purpose-built disposable baseline | Credentialless fixture reproducing only measured lifecycle surfaces; does not execute/load production assets. | LIVE-UNVERIFIED |
| Direct PM2 7.0.3 to Pi RPC | PM2 script target is Pi `--mode rpc`; requires proven retained stdin writer, lossless stdout consumer, ready/EOF/exit behavior. | LIVE-UNVERIFIED; safe `NOT RUN` if topology is infeasible. |
| PM2 7.0.3 RPC-host wrapper to Pi RPC | Separately named conditional candidate; PM2 targets wrapper, wrapper owns Pi pipes and fixture Unix socket. | NOT RUN unless direct topology is infeasible. |
| PM2 7.0.3 direct Pi, no explicit mode | No RPC or PTY wrapper; records actual TTY and resolved mode. | LIVE-UNVERIFIED |
| PM2 7.0.3 plus existing PTY utility | Optional control only; installs nothing. | NOT RUN pending prerequisite check. |

A wrapper result is never attributed to the direct candidate. PM2 logs are not an RPC transport. Extension API probing is `NOT RUN` unless a deterministic local fake/test provider, denied network, empty disposable auth homes, and no live/provider-backed model turn are proven.

## Frozen execution/evidence contract to implement after US-002

The normative detail is in `prd.md` Section 3 and `prd.json.artifactContract`. In summary:

- Spawn children from explicit `env -i`; only allowlisted keys; fresh runtime-root HOME/XDG/TMP and mode-`0700` `PM2_HOME`; do not inspect ambient values or auth stores.
- Deny outbound network. The sole setup exception is the exact pinned PM2 tarball URL; resolve dependencies offline or record `NOT RUN`.
- Register exact PID/parent/`/proc` start-time/role/candidate/namespace; trap `EXIT`, `INT`, `TERM`, and `HUP`; use bounded exact-PID cleanup; prohibit global/name-pattern/default-PM2 kills.
- Capture only metadata-only pre/post production snapshots, never production runtime content.
- Freeze at least three repetitions, monotonic/UTC clocks, ready/idle/fault/recovery/cleanup/total deadlines, fault order, censor handling, median/min-max and `n/3`, and lexicographic evidence ordering before observing a candidate.
- Keep the synthetic sentinel child alive, expose one common public symptom, block synthetic work, and attribute detection/recovery to the actual component. It is a simulation.
- Bound JSONL/evidence, use synthetic payloads, redact paths/control characters, retain summaries/hashes, and fail the story on secret/personal-data scan findings.

## Evidence index

No implementation evidence exists yet. Future story outputs are bounded to:

| Story range | Evidence |
|---|---|
| US-003 | `fixture/`, `evidence/US-003/` |
| US-004 | `evidence/benchmark-manifest.json`, `evidence/US-004/` |
| US-005 through US-015 | `evidence/US-<id>/` per exact candidate/run |
| US-016 | This assessment plus `evidence/US-016/` |
| US-017 | `critique-final-evidence.md`, concise `progress.txt` entry |
| US-018 | `critique-final-safety-scope.md`, concise `progress.txt` entry |
| US-019 | `assessment.md#terminal-first-mate-synthesis`, `progress.txt`, `evidence/US-019/` |

Every live claim must link to sanitized raw/aggregate/verification/cleanup proof and carry the evidence vocabulary label. `NOT RUN` is safe evidence with a blocker, not a failed excuse or zero score.

## Comparison boundary

US-016 applies only the preregistered lexicographic evidence ordering and reports scores, ties, uncertainty, blockers, and residual responsibilities. It supplies no migration authorization, rollout steps, default architecture change, or production PM2 configuration, and does not label a candidate `adopt`, `recommended`, or `winner`. Selection, if any, requires a separate human-approved issue or ADR after terminal critics.

## Terminal First Mate synthesis

Not run. US-019 depends on independent bounded reports from `critic-final-evidence` and `critic-final-safety-scope`. The First Mate must resolve every H/M through bounded rework and re-review, validate every criterion before changing pass state, run final secret/policy/production-metadata checks, and preserve the separate-human-decision boundary.
