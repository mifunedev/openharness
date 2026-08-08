# PM2 Pi Supervision Assessment

## US-016 bounded status

| Claim | Label | Bounded evidence |
|---|---|---|
| At US-016 execution time, US-005 through US-015 were First-Mate-passed and US-016 was the active comparison scope. | LIVE-VERIFIED | [`prd.json`](prd.json), [`progress.txt`](progress.txt) |
| The benchmark protocol was frozen before observation with SHA-256 `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b` and has no amendments. | SOURCE-VERIFIED | [`evidence/benchmark-manifest.json`](evidence/benchmark-manifest.json), [`evidence/US-004/manifest.sha256`](evidence/US-004/manifest.sha256) |
| Fresh unprivileged user/network namespace isolation is unavailable in this environment, so every candidate and fault slot stopped before launch. | NOT RUN | [`evidence/US-005/aggregate.json`](evidence/US-005/aggregate.json), [`evidence/US-011/fault-matrix.json`](evidence/US-011/fault-matrix.json), [`evidence/US-012/fault-matrix.json`](evidence/US-012/fault-matrix.json), [`evidence/US-013/fault-matrix.json`](evidence/US-013/fault-matrix.json), [`evidence/US-014/fault-matrix.json`](evidence/US-014/fault-matrix.json), [`evidence/US-015/fault-matrix.json`](evidence/US-015/fault-matrix.json) |
| No candidate runtime capability, lifecycle outcome, semantic-health outcome, observability completeness, recovery latency, or operational-responsibility count was measured. | LIVE-UNVERIFIED | [`evidence/US-011/aggregate.json`](evidence/US-011/aggregate.json), [`evidence/US-012/aggregate.json`](evidence/US-012/aggregate.json), [`evidence/US-013/aggregate.json`](evidence/US-013/aggregate.json), [`evidence/US-014/aggregate.json`](evidence/US-014/aggregate.json), [`evidence/US-015/aggregate.json`](evidence/US-015/aggregate.json) |
| The bounded safe-stop, cleanup, metadata-only, test, syntax, policy/secret-scan, and typecheck gates completed successfully; this verifies the evidence path, not candidate behavior. | LIVE-VERIFIED | [`evidence/US-011/verification.jsonl`](evidence/US-011/verification.jsonl), [`evidence/US-012/verification.jsonl`](evidence/US-012/verification.jsonl), [`evidence/US-013/verification.jsonl`](evidence/US-013/verification.jsonl), [`evidence/US-014/verification.jsonl`](evidence/US-014/verification.jsonl), [`evidence/US-015/verification.jsonl`](evidence/US-015/verification.jsonl) |
| The study read only source/installed-package metadata and bounded task evidence; candidate runs recorded metadata-only production checks with `productionContentRead: false` and unchanged identity metadata. | LIVE-VERIFIED | [`evidence/US-006/version-integrity-source.json`](evidence/US-006/version-integrity-source.json), [`evidence/US-011/production-metadata-delta.json`](evidence/US-011/production-metadata-delta.json), [`evidence/US-012/production-metadata-delta.json`](evidence/US-012/production-metadata-delta.json), [`evidence/US-013/production-metadata-delta.json`](evidence/US-013/production-metadata-delta.json), [`evidence/US-014/production-metadata-delta.json`](evidence/US-014/production-metadata-delta.json), [`evidence/US-015/production-metadata-delta.json`](evidence/US-015/production-metadata-delta.json) |

## Source characterization

| Claim | Label | Bounded evidence |
|---|---|---|
| PM2 is pinned to 7.0.3 with the recorded Node engine, tarball integrity, tag, and source commit; runtime resolution did not run. | SOURCE-VERIFIED | [`evidence/US-006/version-integrity-source.json`](evidence/US-006/version-integrity-source.json) |
| Installed Pi 0.82.1 source exposes explicit RPC mode, LF-JSONL RPC handling, and stdin-end shutdown behavior; Pi was not executed by the characterization. | SOURCE-VERIFIED | [`evidence/US-006/version-integrity-source.json`](evidence/US-006/version-integrity-source.json), [`evidence/US-006/topology.json`](evidence/US-006/topology.json) |
| Direct PM2-to-Pi RPC transport feasibility remains unobserved, including stdin ownership, stdout consumption, ready, EOF/exit propagation, and byte/frame equality. | LIVE-UNVERIFIED | [`evidence/US-006/transport.json`](evidence/US-006/transport.json), [`evidence/US-012/fault-matrix.json`](evidence/US-012/fault-matrix.json) |
| The separately named RPC-host-wrapper topology remains unobserved and was not substituted for direct RPC. | LIVE-UNVERIFIED | [`evidence/US-007/topology.json`](evidence/US-007/topology.json), [`evidence/US-007/transport.json`](evidence/US-007/transport.json), [`evidence/US-013/fault-matrix.json`](evidence/US-013/fault-matrix.json) |
| The extension API/fake-provider sequence remains unobserved; zero live, provider-backed, or fake-provider turns occurred. | NOT RUN | [`evidence/US-008/probe-obligations.json`](evidence/US-008/probe-obligations.json), [`evidence/US-008/aggregate.json`](evidence/US-008/aggregate.json) |
| The no-mode control's TTY state and resolved Pi mode remain unobserved rather than assumed. | NOT RUN | [`evidence/US-009/lifecycle.json`](evidence/US-009/lifecycle.json), [`evidence/US-009/aggregate.json`](evidence/US-009/aggregate.json) |
| Existing PTY utility identity/package metadata was read without executing or installing it; compatibility and runtime behavior remain unobserved. | SOURCE-VERIFIED | [`evidence/US-010/prerequisite.json`](evidence/US-010/prerequisite.json), [`evidence/US-010/mode-lifecycle.json`](evidence/US-010/mode-lifecycle.json) |

## Frozen evidence ordering

The frozen sequence was enforced exactly as recorded, but candidate ranking was not applied after the non-comparability stop: safety/cleanup gate; required-run completeness; lifecycle success count; semantic-health success count; observability-field completeness; median recovery latency; operational-responsibility count. `NOT RUN` is not converted to zero, no missing field is filled, no weighting was added after evidence collection, and ties remain ties. [`evidence/benchmark-manifest.json`](evidence/benchmark-manifest.json) **SOURCE-VERIFIED**; [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json) **LIVE-VERIFIED**.

| Candidate | Evidence label | Safety/cleanup evidence score | Completeness | Lifecycle | Semantic health | Observability | Recovery latency | Operational-responsibility count | Outcome | Bounded evidence |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Disposable synthetic baseline | NOT RUN | PASS-safe-stop | — (`0/15`) | — | — | — | — | — | Non-comparable; tied; unranked | [`US-011`](evidence/US-011/aggregate.json) |
| PM2 7.0.3 direct Pi RPC | NOT RUN | PASS-safe-stop | — (`0/15`) | — | — | — | — | — | Non-comparable; tied; unranked | [`US-012`](evidence/US-012/aggregate.json) |
| PM2 7.0.3 plus RPC-host wrapper plus Pi RPC | NOT RUN | PASS-safe-stop | — (`0/15`) | — | — | — | — | — | Non-comparable; tied; unranked | [`US-013`](evidence/US-013/aggregate.json) |
| PM2 7.0.3 direct Pi without explicit mode | NOT RUN | PASS-safe-stop | — (`0/15`) | — | — | — | — | — | Non-comparable; tied; unranked | [`US-014`](evidence/US-014/aggregate.json) |
| PM2 7.0.3 plus PTY control | NOT RUN | PASS-safe-stop | — (`0/15`) | — | — | — | — | — | Non-comparable; tied; unranked | [`US-015`](evidence/US-015/aggregate.json) |

| Comparison claim | Label | Bounded evidence |
|---|---|---|
| Across five candidates, 75 fault slots were requested, 75 are `NOT RUN`, zero are measured, and zero are comparable. | LIVE-VERIFIED | [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json), [`evidence/US-016/traceability.json`](evidence/US-016/traceability.json) |
| No lexicographic candidate rank can be computed; all five remain in one explicit non-comparable tie group with null rank. | LIVE-VERIFIED | [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json) |
| Every operational-responsibility score is null because candidate operations were not observed. | LIVE-UNVERIFIED | [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json) |

## Uncertainty, blockers, and residual responsibilities

| Claim | Label | Bounded evidence |
|---|---|---|
| The common blocker is unavailable fresh user/network namespace isolation. | NOT RUN | [`evidence/US-011/fault-matrix.json`](evidence/US-011/fault-matrix.json), [`evidence/US-012/fault-matrix.json`](evidence/US-012/fault-matrix.json), [`evidence/US-014/fault-matrix.json`](evidence/US-014/fault-matrix.json), [`evidence/US-015/fault-matrix.json`](evidence/US-015/fault-matrix.json) |
| The wrapper has an additional eligibility blocker: direct transport was not proven infeasible, so conditional wrapper launch was not authorized. | NOT RUN | [`evidence/US-007/aggregate.json`](evidence/US-007/aggregate.json), [`evidence/US-013/fault-matrix.json`](evidence/US-013/fault-matrix.json) |
| Eight custom-supervisor responsibilities remain unresolved for every candidate: mode/terminal semantics, stderr health surface, live-unhealthy detection, blocked-work enforcement, semantic recovery attribution, heartbeat/state, bounded logs, and bridge-lock cleanup. | LIVE-UNVERIFIED | [`evidence/benchmark-manifest.json`](evidence/benchmark-manifest.json), [`evidence/US-008/probe-obligations.json`](evidence/US-008/probe-obligations.json), [`evidence/US-011/fault-matrix.json`](evidence/US-011/fault-matrix.json), [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json) |
| The sentinel obligations remain an unexecuted simulation and provide no proof of Slack stale-context recovery. | NOT RUN | [`evidence/US-011/fault-matrix.json`](evidence/US-011/fault-matrix.json), [`evidence/US-012/fault-matrix.json`](evidence/US-012/fault-matrix.json), [`evidence/US-013/fault-matrix.json`](evidence/US-013/fault-matrix.json), [`evidence/US-014/fault-matrix.json`](evidence/US-014/fault-matrix.json), [`evidence/US-015/fault-matrix.json`](evidence/US-015/fault-matrix.json) |

## Decision boundary

This assessment supplies evidence state, uncertainty, blockers, and unresolved responsibilities only. It grants no selection authority and changes no production state or default. Any selection requires a separate human-approved issue or ADR after the terminal critics and First Mate synthesis. [`evidence/benchmark-manifest.json`](evidence/benchmark-manifest.json) **SOURCE-VERIFIED**; [`evidence/US-016/policy-scan.json`](evidence/US-016/policy-scan.json) **LIVE-VERIFIED**.

## Terminal First Mate synthesis

### Terminal evidence state

| Claim | Label | Bounded evidence |
|---|---|---|
| Both bounded terminal reports now end with the exact verdict `PASS (H0 / M0 / L0)` after re-review; no high-, medium-, or low-severity finding remains open. | LIVE-VERIFIED | [`critique-final-evidence.md`](critique-final-evidence.md), [`critique-final-safety-scope.md`](critique-final-safety-scope.md) |
| The frozen protocol hash remains `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b` with no amendment. | SOURCE-VERIFIED | [`evidence/benchmark-manifest.json`](evidence/benchmark-manifest.json), [`evidence/US-004/manifest.sha256`](evidence/US-004/manifest.sha256) |
| During delegated verification, the bounded terminal verifier preserved US-019 as `passes: false`; delegated verification did not certify or mutate pass state. | LIVE-VERIFIED | [`evidence/US-019/verification.jsonl`](evidence/US-019/verification.jsonl), [`prd.json`](prd.json) |
| Every candidate behavior remains unobserved: 75/75 preregistered fault slots are `NOT RUN`, with zero measured, comparable, or ranked slots. | NOT RUN | [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json), [`evidence/US-019/policy-scan.json`](evidence/US-019/policy-scan.json) |
| Cleanup evidence records zero candidate launches, runtime roots, registered fixture-owned processes, signal attempts, remaining owned PIDs, or residue across the eleven bounded candidate/control stories. | LIVE-VERIFIED | [`evidence/US-019/cleanup-proof.json`](evidence/US-019/cleanup-proof.json) |
| Eleven already-captured per-run metadata deltas use only authorized tracked-path, tmux-session-identity, and PID/parent/start-time/command-name fields; each bounded pre/post delta is unchanged and reads no production content. This does not prove globally identical volatile ambient process identities. | LIVE-VERIFIED | [`evidence/US-019/production-metadata-boundary-proof.json`](evidence/US-019/production-metadata-boundary-proof.json) |
| No production runtime, configuration, default, or state was changed by this study; the proof is bounded to task-local changes, zero-action cleanup records, and the already-captured per-run metadata deltas. | LIVE-VERIFIED | [`evidence/US-019/cleanup-proof.json`](evidence/US-019/cleanup-proof.json), [`evidence/US-019/production-metadata-boundary-proof.json`](evidence/US-019/production-metadata-boundary-proof.json), [`evidence/US-019/policy-scan.json`](evidence/US-019/policy-scan.json) |

### Scores and ties

| Candidate | Evidence label | Safety/cleanup score | Completeness | Runtime scores | Tie/rank |
|---|---|---|---:|---|---|
| Disposable synthetic baseline | NOT RUN | PASS-safe-stop | `0/15` | All null | Non-comparable tie; rank null |
| PM2 7.0.3 direct Pi RPC | NOT RUN | PASS-safe-stop | `0/15` | All null | Non-comparable tie; rank null |
| PM2 7.0.3 plus RPC-host wrapper plus Pi RPC | NOT RUN | PASS-safe-stop | `0/15` | All null | Non-comparable tie; rank null |
| PM2 7.0.3 direct Pi without explicit mode | NOT RUN | PASS-safe-stop | `0/15` | All null | Non-comparable tie; rank null |
| PM2 7.0.3 plus PTY control | NOT RUN | PASS-safe-stop | `0/15` | All null | Non-comparable tie; rank null |

The safety/cleanup score verifies only fail-closed non-execution. Lifecycle success, semantic-health success, observability completeness, recovery latency, and operational-responsibility scores remain `null`; the five-way tie is non-comparable and supplies no ordering. [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json) **LIVE-VERIFIED**.

### Uncertainty and blockers

| Claim | Label | Bounded evidence |
|---|---|---|
| Fresh user/network namespace isolation remains unavailable, so no runtime inference about any candidate is supported. | NOT RUN | [`evidence/US-005/aggregate.json`](evidence/US-005/aggregate.json), [`evidence/US-019/verification.jsonl`](evidence/US-019/verification.jsonl) |
| Direct RPC stdin/stdout ownership, losslessness, lifecycle behavior, semantic recovery, observability, and latency remain live-unverified. | LIVE-UNVERIFIED | [`evidence/US-006/transport.json`](evidence/US-006/transport.json), [`evidence/US-012/aggregate.json`](evidence/US-012/aggregate.json) |
| The wrapper remains additionally blocked because direct transport was not proven infeasible solely on transport; it was neither implemented nor substituted. | NOT RUN | [`evidence/US-007/aggregate.json`](evidence/US-007/aggregate.json), [`evidence/US-013/aggregate.json`](evidence/US-013/aggregate.json) |
| The synthetic live-unhealthy sentinel remains an unexecuted simulation and proves nothing about Slack stale-context recovery. | NOT RUN | [`evidence/US-011/fault-matrix.json`](evidence/US-011/fault-matrix.json), [`evidence/US-015/fault-matrix.json`](evidence/US-015/fault-matrix.json) |

### Residual responsibilities and decision boundary

The following responsibilities remain **LIVE-UNVERIFIED** for every candidate: preserve Pi process mode and terminal semantics; retain and supervise the public stderr health surface; detect live-unhealthy behavior while the child remains alive; block ordinary work pending recovery; attribute semantic rather than lifecycle-only recovery; maintain heartbeat/state observability; bound retained logs/diagnostics; and perform any bridge-lock cleanup required by the source design. [`evidence/US-016/comparison.json`](evidence/US-016/comparison.json).

Selection authority is false. No migration, rollout, production PM2 configuration, default change, or production state change is authorized here. Any selection requires a separate human-approved issue or ADR. Final pass-state review and any later architecture decision remain human/First-Mate responsibilities. [`evidence/US-019/policy-scan.json`](evidence/US-019/policy-scan.json) **LIVE-VERIFIED**.
