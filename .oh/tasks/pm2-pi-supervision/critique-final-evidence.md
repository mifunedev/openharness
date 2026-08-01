# US-017 terminal evidence critique

**Critic:** `critic-final-evidence`
**Completed:** 2026-08-01T04:02:59Z
**Scope:** Read-only review of current `prompt.md`, `prd.md`, `prd.json`, `progress.txt`, `assessment.md`, the frozen manifest, all fixture source/tests, and all 151 bounded evidence files. The only critic mutations are this report and one completion-ledger line in `progress.txt`.

## Verdict and severity

**PASS — H0 / M0 / L3.** No unresolved high- or medium-severity evidence defect was found. Three low-severity wording/provenance defects should be cleaned up during First Mate synthesis; none changes the frozen hash, slot registration, raw/aggregate result, non-comparability, attribution, or decision boundary.

## Findings

### L1 — The US-016 scope sentence is now stale against its linked current state

`assessment.md:7` says US-016 is “the only story in this execution scope” and labels that claim `LIVE-VERIFIED`, linking current `prd.json` and `progress.txt`. Those artifacts now show US-016 passed and US-017/US-018 unlocked. The bottom terminal-synthesis placeholder correctly says US-019 awaits those critics, so the evidence conclusion is unaffected.

**Bounded action:** In US-019 synthesis, either date-qualify the sentence as the status at US-016 execution or update it to say US-005 through US-016 are passed and US-017/US-018 are the active terminal scope.

### L2 — “Applied exactly” is broader than the comparison’s explicit `orderingApplied: false`

`assessment.md:28` says the full frozen sequence “is applied exactly.” `evidence/US-016/comparison.json` correctly records `orderingApplied: false` for every candidate because all candidates are `NOT RUN` and non-comparable; the ordering contract was enforced, but no candidate ranking sequence was applied. The same assessment later correctly says no rank can be computed.

**Bounded action:** Replace “is applied exactly” with “was enforced exactly; ranking was not applied after the non-comparability stop.”

### L3 — The fault runner self-reports `timeout 900s` inside an exact `timeout 2100s` invocation

`fixture/run-faults.mjs:343` hard-codes `timeout 900s` in its emitted `story-run.command`. Consequently, each `first-mate-exact.log` says `timeout 900s` even when the First Mate actually invoked the PRD-required `timeout 2100s` wrapper. Exact 2100-second evidence still exists unambiguously: each US-011–US-015 `verification.jsonl` contains exactly one `kind: command` row with the full exact 2100-second command, UTC start/end, duration, and `exitCode: 0`, linked to the corresponding `first-mate-exact.log`. This is provenance noise, not a missing exact-command gate.

**Bounded action:** Make the runner report only its own Node argv, or pass the outer timeout label into the recorder; do not hard-code a conflicting wrapper duration.

## Evidence checks

### 1. Frozen manifest hash and amendments

- Recomputed SHA-256: `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b`.
- Exact match: `evidence/US-004/manifest.sha256`.
- Manifest state: `FROZEN_PRE_OBSERVATION`, `candidateObservationCountAtFreeze: 0`, `amendments.current: []`.
- Every US-005–US-015 aggregate and every US-011–US-015 fault matrix carries the same hash.

Exact command, exit `0`:

```sh
sha256sum .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json && test "$(sha256sum .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json | cut -d' ' -f1)" = "$(cut -d' ' -f1 .oh/tasks/pm2-pi-supervision/evidence/US-004/manifest.sha256)" && jq -e '.amendments.current == [] and .candidateObservationCountAtFreeze == 0' .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json
```

### 2. Complete bounded-evidence inventory

A deterministic read-only parser read all **151 files / 585,461 bytes** under `evidence/`, parsed **57 JSON files** and **188 JSONL records**, and rejected malformed JSON/JSONL or files over 2 MiB. It independently recomputed the US-005–US-015 inventory and matched all **124** paths, byte counts, and SHA-256 values in `evidence/US-016/traceability.json`; `inputByteCount` also matched.

Validator result:

```json
{"status":"PASS","evidenceFilesRead":151,"bytesRead":585461,"jsonFiles":57,"jsonlRecords":188,"manifestSha256":"ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b","faultStories":5,"faultSlots":75,"exact2100Commands":5,"traceabilityFiles":124,"assessmentClaimRows":25}
```

### 3. Three-by-five registration, ordering, and raw-to-aggregate calculations

For each of US-011 through US-015:

- Raw `run.jsonl` has exactly 15 rows in frozen order: five faults, repetitions `1,2,3` for each fault.
- `registrationOrder` is exactly `1..15`.
- Every manifest-required row field is present.
- Candidate attribution is exact: baseline, direct RPC, RPC-host wrapper, direct no-mode, and PTY control remain distinct.
- Each aggregate independently recomputes to requested/measured/`NOT RUN`/comparable = `15/0/15/0`, completeness `0/15`.
- Each per-fault aggregate recomputes to requested/measured/`NOT RUN` = `3/0/3`, completeness `0/3`.
- Cross-candidate totals independently recompute to requested/measured/comparable = `75/0/0`.
- Lifecycle success, semantic-health success, detection/recovery/restart metrics, and operational-responsibility scores remain `null`; no zero or imputed value is introduced.

Evidence: `evidence/US-011..US-015/{run.jsonl,aggregate.json,fault-matrix.json}`, `evidence/US-016/{comparison.json,traceability.json}`.

### 4. `NOT RUN` versus censor handling

All 75 slots are preregistered but unexecuted:

- `status: "NOT RUN"`, `outcome: "NOT RUN"`, `comparable: false`.
- `censored: false`, `censorDeadlineNs: null`, with explicit “not executed” censor semantics.
- UTC/monotonic clocks, identities, latencies, exits, logs, protocol, and semantic observations are `null` rather than fabricated.
- Aggregates report zero censored failures and 15 unexecuted `NOT RUN` slots per candidate.
- Frozen timeout policy remains available for an executed timeout, but no timeout observation occurred.

This is consistent with the manifest rule that timeout failures are censored while pre-launch `NOT RUN` is non-comparable and not censored.

### 5. Exact 2100-second command evidence

Each of US-011, US-012, US-013, US-014, and US-015 has exactly one passing `verification.jsonl` command row matching its PRD-required command:

```text
timeout 2100s node .oh/tasks/pm2-pi-supervision/fixture/run-faults.mjs --story <US-011..US-015> --candidate <exact candidate> --manifest .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json --output .oh/tasks/pm2-pi-supervision/evidence/<story>
```

All five rows record `exitCode: 0`, UTC start/end, monotonic duration, and the corresponding `first-mate-exact.log`. L3 records the non-gating self-report mismatch inside those logs.

### 6. Frozen ordering and ties

The manifest and comparison agree on the exact lexicographic contract:

1. safety/cleanup gate;
2. required-run completeness;
3. lifecycle success count;
4. semantic-health success count;
5. observability completeness;
6. median recovery latency;
7. operational-responsibility count.

The comparison preserves `weighting: FROZEN_ONLY`, `imputation: false`, `selectiveRetries: false`, `ties: remain-ties`, and `NOT RUN/failed: not-comparable-not-zero`. All candidates have `rank: null`, one explicit non-comparable tie group, and only `PASS_SAFE_NOT_RUN` at the safety gate; all runtime score fields remain null. No post-observation weighting exists.

### 7. Claim labels and links

- All 25 assessment claim/data rows use one of `SOURCE-VERIFIED`, `LIVE-VERIFIED`, `LIVE-UNVERIFIED`, or `NOT RUN`.
- Every local Markdown evidence link resolves to an existing bounded task path.
- Source characterization, runtime non-observation, bounded-check success, non-comparability, blockers, and decision-boundary claims link to the corresponding source/aggregate/matrix/verification/comparison artifact.
- L1 and L2 are wording/current-state precision issues; no underlying evidence link is missing.

### 8. Direct-versus-wrapper attribution

- `evidence/US-006/topology.json` names direct Pi `--mode rpc`, has no wrapper PID/process, and keeps all end-to-end transport obligations `LIVE-UNVERIFIED`/null.
- `evidence/US-007/topology.json` separately names PM2 → fixture RPC-host wrapper → Pi, assigns PM2/wrapper/Pi/client responsibilities separately, and records `directCandidateSubstitution: false`.
- Wrapper execution remains unauthorized because direct transport was not proven infeasible solely on transport; unavailable isolation independently blocks launch.
- US-012 and US-013 preserve distinct direct and wrapper candidate IDs throughout raw and aggregate fault evidence.

### 9. Semantic and Slack recovery claims

No bounded evidence row claims observed semantic health or Slack recovery. Sentinel rows preserve only unexecuted obligations: same live/running child PID, common public stderr `SYNTHETIC_STALE_CONTEXT`, blocked ordinary work, no hidden candidate channel, and simulation-only classification. The assessment explicitly says the sentinel provides no proof of Slack stale-context recovery.

Exact command, exit `0`:

```sh
! grep -R -E '"slackRecoveryProofClaimed"[[:space:]]*:[[:space:]]*true|"semanticHealthObserved"[[:space:]]*:[[:space:]]*true|"orderingApplied"[[:space:]]*:[[:space:]]*true' .oh/tasks/pm2-pi-supervision/evidence && grep -F 'no proof of Slack stale-context recovery' .oh/tasks/pm2-pi-supervision/assessment.md
```

## Deterministic verification commands

All commands ran from `/home/sandbox/harness/.oh/worktrees/feat/677-pm2-pi-supervision`.

```sh
timeout 180s node --test .oh/tasks/pm2-pi-supervision/fixture/tests/*.test.mjs
```

Exit `0`: 48 tests, 48 passed, 0 failed/skipped/cancelled.

```sh
find .oh/tasks/pm2-pi-supervision/fixture -type f -name '*.mjs' -print0 | sort -z | xargs -0 -r -n1 node --check
```

Exit `0`; no output.

```sh
timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/secret-scan.mjs .oh/tasks/pm2-pi-supervision/evidence
```

Exit `0`: `{"status":"PASS","fileCount":151,"findingCount":0,"findings":[]}`.

```sh
timeout 180s pnpm typecheck
```

Exit `0`: root `pnpm typecheck` ran `.oh/cli` `tsc --noEmit` successfully; `.oh/cli/node_modules` was already present, so no install path ran.

```sh
git diff --check -- .oh/tasks/pm2-pi-supervision
```

Exit `0`. Before critic writes, task-local status contained only the pre-existing modifications to `assessment.md`, `prd.json`, and `progress.txt`; the read-only checks introduced no additional path mutation.

Final verdict: PASS (H0 / M0 / L3).

## 2026-08-01T04:11:20Z — Re-review of L1/L2/L3 remediations

**Bounded scope:** Only the three prior low-severity findings and regression checks against the previously validated evidence contract were re-reviewed. No PRD, JSON, assessment, fixture, evidence, or pass state was edited by this critic.

### Closure results

- **L1 closed.** `assessment.md` now time-qualifies the claim: “At US-016 execution time, US-005 through US-015 were First-Mate-passed and US-016 was the active comparison scope.” The stale “US-016 is the only story” wording is absent.
- **L2 closed.** The ordering paragraph now says the frozen sequence was enforced but candidate ranking was not applied after the non-comparability stop. This matches all five `orderingApplied: false` and `rank: null` records in `evidence/US-016/comparison.json`.
- **L3 closed.** `fixture/run-faults.mjs` now self-reports the unwrapped `node .../run-faults.mjs` invocation. No `timeout 900s` remains in current fixture or evidence content. Historical mentions remain only in the preserved original critique/progress narrative. Each US-011–US-015 `verification.jsonl` has exactly one passing row for its full PRD-required `timeout 2100s` command, and each regenerated `first-mate-exact.log` contains the corrected unwrapped runner command.

### Updated traceability and regression checks

A read-only assertion pass parsed all **153 evidence files / 579,284 bytes**. It independently recomputed the US-005–US-015 inventory and exactly matched all **125** path, byte-count, and SHA-256 entries plus `inputByteCount: 476086` in `evidence/US-016/traceability.json`. The frozen manifest remains unchanged at SHA-256 `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b`, with no amendments.

Prior evidence invariants remain intact: five candidates × five frozen faults × three repetitions = 75 ordered slots; all are explicit non-censored, non-comparable `NOT RUN`; raw-to-aggregate totals remain `75/0/75/0`; runtime metrics remain null; direct and wrapper attribution remains distinct; no semantic-health or Slack-recovery success is claimed; all 25 assessment claim/data rows use the approved labels and all 70 local evidence links resolve; policy scan remains PASS.

Exact commands and results:

```sh
! grep -R -F 'timeout 900s' .oh/tasks/pm2-pi-supervision/fixture .oh/tasks/pm2-pi-supervision/evidence
```

Exit `0`.

```sh
timeout 180s node --test .oh/tasks/pm2-pi-supervision/fixture/tests/*.test.mjs
```

Exit `0`: 48/48 passed.

```sh
find .oh/tasks/pm2-pi-supervision/fixture -type f -name '*.mjs' -print0 | sort -z | xargs -0 -r -n1 node --check
```

Exit `0`; no output.

```sh
timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/secret-scan.mjs .oh/tasks/pm2-pi-supervision/evidence
```

Exit `0`: `{"status":"PASS","fileCount":153,"findingCount":0,"findings":[]}`.

```sh
timeout 180s pnpm typecheck
```

Exit `0`; `.oh/cli` `tsc --noEmit` passed.

```sh
git diff --check -- .oh/tasks/pm2-pi-supervision
```

Exit `0`.

**Re-review severity:** H0 / M0 / L0. All three bounded findings are closed and no prior evidence invariant regressed.

Final verdict: PASS (H0 / M0 / L0).
