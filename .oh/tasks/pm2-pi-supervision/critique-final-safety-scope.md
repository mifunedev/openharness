# critic-final-safety-scope — terminal safety/scope audit

**Date:** 2026-08-01T04:02:28Z
**Story:** US-018
**Scope:** Read-only review of the current `prompt.md`, `prd.md`, `prd.json`, `progress.txt`, `assessment.md`, task-local fixture/evidence, tracked-path metadata, and identity-only tmux/process metadata. No production config, state, lock, log, bridge, extension, settings, session content, command line, or runtime content was read.
**Verdict:** **PASS**
**Severity count:** **H0 / M0 / L1**

## Executive conclusion

The study failed closed before every candidate launch because fresh user/network namespace isolation is unavailable. That safe stop is consistently represented as `NOT RUN`, not as candidate behavior: 75/75 fault slots are unmeasured and non-comparable, and the evidence records zero candidate launches, runtime roots, registered candidate PIDs, fault injections, signals, Pi/provider turns, or production asset loads.

The executable fixture contract and its tests enforce the credentialless allowlist, fresh empty disposable homes, mode-`0700` `PM2_HOME`, exact PID/start-time/parent ownership, bounded reverse-order cleanup, and forbidden broad PM2/signal operations. Because no candidate started, runtime enforcement is supported by contract tests and zero-action evidence rather than a live candidate demonstration. Production checks remained restricted to the four authorized metadata surfaces and every US-005–US-015 metadata delta reports unchanged identity sets with `productionContentRead: false`.

Evidence is bounded and secret-scanned: 151 files, maximum file size 30,150 bytes, no symlinks, no retained log over 1 MiB, no prohibited control bytes, and zero findings in the fresh deterministic scan. One low-severity redaction-hygiene issue remains: six lines in four evidence files retain generic sandbox-local absolute paths. They contain no credential or personal data and do not undermine the safety result.

The tracked branch/current worktree path inventory is task-folder-only. No dependency, Docker/devcontainer, provider settings, production config, gateway, supervisor, or runtime path changed. Independent output checks found no candidate selection, recommendation, migration, or rollout statement; comparison remains explicitly unranked with `selectionAuthority: false` and requires a separate human-approved issue or ADR.

## Boundary results

| Boundary | Result | Evidence |
|---|---|---|
| Credentialless allowlist | PASS | `fixture/contract.mjs` fixes `PATH`, locale/time values, and runtime-root HOME/XDG/TMP/PM2 paths; fixture keys are allowlisted and prohibited credential-key patterns fail closed. Test suite subtests 6–7 pass. Manifest: `constraints.environment`. |
| Empty disposable homes / isolated PM2 home | PASS | `createRuntimeRoot()` creates fresh mode-`0700` homes; `assertDisposableHomesEmpty()` rejects preexisting content. No candidate runtime root was created. `evidence/US-005..US-015/cleanup-proof.json`. |
| Denied-network safe stop | PASS | Fresh probe returned `status="NOT RUN"`, `probeExitCode=1`, and `candidate launch is prohibited`. All candidate/fault evidence follows this path with zero launches. |
| Zero live/provider turns | PASS | `evidence/US-008/probe-obligations.json` records `liveModelTurns=0`, `providerBackedModelTurns=0`, `fakeProviderTurns=0`, zero credential-discovery attempts, zero production extension/settings loads, and zero Pi launches. |
| Exact PID / cleanup / no signal | PASS | No candidate PID existed: every US-005–US-015 cleanup proof records zero registrations, signals, remaining PIDs, and residue. The synthetic registry tests separately verify reverse-order exact-PID TERM, PID/start-time/parent revalidation, PID-reuse rejection before signal, and idempotence. No live cleanup capability is claimed. |
| Production identity unchanged, content unread | PASS | All 11 `production-metadata-delta.json` files report `metadataOnly=true`, `productionContentRead=false`, `unchanged=true`, and zero changed command sets. Fixture metadata commands are exactly Git status/path names, tmux identity fields, and PID/PPID/start/comm fields. |
| Evidence bounds / redaction / confidentiality | PASS with L-01 | Fresh scan: 151 files, 0 findings; max file 30,150 bytes; 0 symlinks; 0 logs over 1 MiB; 0 prohibited control-byte files. Generic absolute path remnants are bounded in L-01. |
| Production config/dependencies/runtime | PASS | `git diff --name-only development...HEAD` and current porcelain status contain no path outside `.oh/tasks/pm2-pi-supervision/`; targeted config/dependency/runtime pattern count is zero. |
| No selection/recommendation/migration output | PASS | Independent assessment/comparison scan found zero prohibited output-label hits and zero candidate-coupled selection/migration/rollout claims. `comparison.json` has 0 ranked candidates and `selectionAuthority=false`; `policy-scan.json` is PASS with all authority/config/default flags false. |
| Required typecheck | PASS | `timeout 180s pnpm typecheck` exited 0; `tsc --noEmit` completed without diagnostics. |

## Evidence limitations preserved

- Credentialless child execution, empty homes, PM2 isolation, PID registration, and cleanup are contract/test verified but were not exercised by a benchmark candidate because denied-network proof was unavailable.
- No candidate lifecycle, transport, semantic recovery, observability completeness, latency, or operational-responsibility value was measured.
- The synthetic stale-context scenario was not run and proves nothing about Slack stale-context recovery.
- Metadata equality proves identity stability across each bounded safe-stop operation; it does not inspect or make claims about production content.

## Low-severity finding

### L-01 — Four evidence files retain generic absolute sandbox paths

**Evidence:**

- `evidence/US-001/typecheck.log:2` and `evidence/US-002/typecheck.log:2` retain the absolute worktree path.
- `evidence/US-006/topology.json:11-12` and `evidence/US-006/version-integrity-source.json:38-39` retain `/home/sandbox/.local/...` Pi installation paths.

**Impact:** The values identify only the generic sandbox layout, are bounded, and contain no credential, token, personal email, production content, or disposable runtime path. The deterministic secret scan remains zero-finding. This is redaction consistency, not a confidentiality or execution-boundary failure.

**Bounded remediation:** During US-019 final evidence regeneration, substitute `<WORKTREE_ROOT>` and `<HOST_TOOL_ROOT>` in these six fields/lines, then rerun the deterministic secret/personal-data scan. No production source or runtime change is needed.

## Exact read-only verification commands and results

All commands ran from `/home/sandbox/harness/.oh/worktrees/feat/677-pm2-pi-supervision` unless shown otherwise.

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

Exit `0`:

```json
{"status":"PASS","fileCount":151,"findingCount":0,"findings":[]}
```

```sh
timeout 180s pnpm typecheck
```

Exit `0`; root typecheck invoked `.oh/cli` `tsc --noEmit` with no diagnostics.

```sh
node -e 'import("./.oh/tasks/pm2-pi-supervision/fixture/contract.mjs").then(m=>console.log(JSON.stringify(m.proveDeniedNetwork())))'
```

Exit `0`; probe result was `NOT RUN`, mechanism `none`, `probeExitCode: 1`, with candidate launch prohibited.

```sh
test "$(sha256sum .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json | cut -d' ' -f1)" = "$(cut -d' ' -f1 .oh/tasks/pm2-pi-supervision/evidence/US-004/manifest.sha256)"
jq '.amendments.current|length' .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json
```

Exit `0`; hash `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b`, amendments `0`.

```sh
for s in 005 006 007 008 009 010 011 012 013 014 015; do
  jq -r '[.status,.candidateLaunchCount,.runtimeRootsCreated,.registeredOwnedProcessCount,.signalAttempts,(.remainingOwnedPids|length),.residue,.idempotent]|@tsv' ".oh/tasks/pm2-pi-supervision/evidence/US-$s/cleanup-proof.json"
done
```

Exit `0`; every row reports `clean-no-candidate-launched`, `0,0,0,0,0`, `none-created`, and `true`.

```sh
for s in 005 006 007 008 009 010 011 012 013 014 015; do
  jq -r '[.metadataOnly,.productionContentRead,.unchanged,([.commands[]|select(.unchanged != true)]|length)]|@tsv' ".oh/tasks/pm2-pi-supervision/evidence/US-$s/production-metadata-delta.json"
done
```

Exit `0`; every row reports `true`, `false`, `true`, `0`.

```sh
jq -s -r '[(map(.executionBoundary.candidateLaunchCount)|add),(map(.executionBoundary.faultInjectionCount)|add),(map(.executionBoundary.signalAttempts)|add),(map(.executionBoundary.observations)|add)]|@csv' .oh/tasks/pm2-pi-supervision/evidence/US-{011,012,013,014,015}/fault-matrix.json
```

Exit `0`: `0,0,0,0`.

```sh
jq -r '[.observed.liveModelTurns,.observed.providerBackedModelTurns,.observed.fakeProviderTurns,.observed.externalCredentialDiscoveryAttempts,.observed.productionExtensionLoads,.observed.productionSettingsLoads,.observed.piLaunches]|@csv' .oh/tasks/pm2-pi-supervision/evidence/US-008/probe-obligations.json
```

Exit `0`: `0,0,0,0,0,0,0`.

```sh
python3 -c 'from pathlib import Path
root=Path(".oh/tasks/pm2-pi-supervision/evidence")
files=[p for p in root.rglob("*") if p.is_file()]
control=[]
for p in files:
 b=p.read_bytes()
 if any((x<32 and x not in (9,10,13)) or x==127 for x in b): control.append(str(p.relative_to(root)))
print(f"evidence_files={len(files)}")
print(f"control_character_file_count={len(control)}")
print(f"max_file_bytes={max(p.stat().st_size for p in files)}")'
find .oh/tasks/pm2-pi-supervision/evidence -type l | wc -l
find .oh/tasks/pm2-pi-supervision/evidence -type f -name '*.log' -size +1048576c | wc -l
grep -RIn '/home/' .oh/tasks/pm2-pi-supervision/evidence
```

Exit `0`: 151 files; 0 control-character files; maximum 30,150 bytes; 0 symlinks; 0 oversized retained logs; six absolute-path lines in four files as listed in L-01.

```sh
git diff --name-only development...HEAD
git status --porcelain=v1
```

Exit `0`: branch paths are the seven original task artifacts only; current tracked changes are `assessment.md`, `prd.json`, and `progress.txt`, all task-local. Independent counts for changed paths outside `.oh/tasks/pm2-pi-supervision/` and dependency/config/runtime path patterns are all `0`.

```sh
grep -Ein '\b(adopt|recommended|winner)\b' .oh/tasks/pm2-pi-supervision/assessment.md .oh/tasks/pm2-pi-supervision/evidence/US-016/comparison.json
grep -Ein '(select|migrat|rollout).*(baseline|pm2-direct|rpc-host|pty-control)|(baseline|pm2-direct|rpc-host|pty-control).*(select|migrat|rollout)' .oh/tasks/pm2-pi-supervision/assessment.md .oh/tasks/pm2-pi-supervision/evidence/US-016/comparison.json
jq -r '[.requestedFaultSlots,.measuredFaultSlots,.comparableFaultSlots,.rankedCandidateCount,.selectionAuthority]|@csv' .oh/tasks/pm2-pi-supervision/evidence/US-016/comparison.json
jq -r '[.status,.prohibitedOutputLabelFindingCount,.selectionAuthority,.migrationOrRolloutAuthority,.productionConfigurationSupplied,.defaultChangeSupplied]|@csv' .oh/tasks/pm2-pi-supervision/evidence/US-016/policy-scan.json
```

The two greps produced zero hits; comparison returned `75,0,0,0,false`; policy returned `PASS,0,false,false,false,false`.

Identity-only current metadata was also captured with the exact allowed commands:

```sh
tmux list-sessions -F '#{session_name}\t#{session_id}\t#{session_created}\t#{session_attached}'
ps -eo pid=,ppid=,lstart=,comm=
git status --porcelain=v1
git diff --name-only
```

Only counts/hashes were retained in this audit: 3 tmux identity rows; 123 process identity rows excluding the transient `ps` observer; 3 Git status paths; 3 Git diff paths. No session or process was signaled, and no production content was opened.

Final verdict: PASS (H0 / M0 / L1).

## Re-review — 2026-08-01T04:13:57Z

**Scope:** L-01 remediation plus regression-only safety/scope verification. Review was read-only except this bounded report append and one progress ledger line. No PRD/JSON/assessment/evidence/fixture/pass state, production state, dependency, config, commit, or remote state was changed by this critic.

**Finding count:** **H0 / M0 / L0**.

### L-01 closure

**CLOSED.** A recursive scan of `.oh/tasks/pm2-pi-supervision/evidence/` found zero `/home/` occurrences. Evidence now contains 30 `<WORKTREE_ROOT>` substitutions and four `<HOST_TOOL_ROOT>` substitutions, with no unexpected `*ROOT` placeholder. The four host-tool fields are exactly the US-006 Pi command/script paths; worktree-bearing typecheck and verification output uses `<WORKTREE_ROOT>`.

### Regenerated evidence correctness

- **US-006:** The three recorded Pi SHA-256 values independently match the installed public package metadata/source files (`package.json`, `dist/main.js`, and `dist/modes/rpc/rpc-mode.js`). PM2 remains exactly 7.0.3 with the frozen integrity and URL. Pi remains 0.82.1. `topology.json` preserves direct `--mode rpc`, no wrapper substitution, zero candidate launches, and `NOT RUN`; only path presentation changed to `<HOST_TOOL_ROOT>`.
- **US-016:** All 125 `traceability.json` inventory entries match current input byte counts and SHA-256 values. `comparison.json` remains `PASS`, references the unchanged manifest hash, retains 75 requested / 0 measured / 0 comparable / 0 ranked slots, and has no selection authority. `policy-scan.json` remains `PASS` with zero prohibited labels and no migration, rollout, production-configuration, or default-change authority.
- **Manifest:** SHA-256 remains `ed79d0e7f623938e92e17cc2b3203b07074f5d796f0de3abeb5013700fc2e31b`, exactly matching `evidence/US-004/manifest.sha256`; amendment count remains zero.

### Regression safety/scope

- Shared fixture suite: 48/48 passed; syntax checks passed for every fixture `.mjs` file.
- Required typecheck: `timeout 180s pnpm typecheck` exited 0; `tsc --noEmit` emitted no diagnostics.
- Fresh deterministic evidence scan: `PASS`, 153 files, 0 findings.
- Fresh denied-network probe remains safe `NOT RUN` with exit 1 before candidate launch.
- Every US-005–US-015 cleanup proof still records zero candidate launches, runtime roots, registered PIDs, signals, remaining PIDs, or residue; all are idempotent clean safe stops.
- Every US-005–US-015 production delta remains metadata-only, content-unread, unchanged, and has zero changed identity command sets.
- US-008 still records zero live/provider turns, credential-discovery attempts, production extension/settings loads, and Pi launches.
- Independent decision-boundary scans remain clean. Branch and working-tree metadata show zero path outside `.oh/tasks/pm2-pi-supervision/` and zero config/dependency/runtime-path change.

### Exact checks

```sh
! grep -RIn '/home/' .oh/tasks/pm2-pi-supervision/evidence
grep -RIoh '<WORKTREE_ROOT>' .oh/tasks/pm2-pi-supervision/evidence | wc -l
grep -RIoh '<HOST_TOOL_ROOT>' .oh/tasks/pm2-pi-supervision/evidence | wc -l
```

Exit `0`; results: `0` absolute-home hits, `30` worktree placeholders, `4` host-tool placeholders.

```sh
timeout 180s node --test .oh/tasks/pm2-pi-supervision/fixture/tests/*.test.mjs
find .oh/tasks/pm2-pi-supervision/fixture -type f -name '*.mjs' -print0 | sort -z | xargs -0 -r -n1 node --check
timeout 180s node .oh/tasks/pm2-pi-supervision/fixture/secret-scan.mjs .oh/tasks/pm2-pi-supervision/evidence
timeout 180s pnpm typecheck
```

All exited `0`; tests `48/48`, secret scan `{"status":"PASS","fileCount":153,"findingCount":0,"findings":[]}`, syntax/typecheck clean.

```sh
test "$(sha256sum .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json | cut -d' ' -f1)" = "$(cut -d' ' -f1 .oh/tasks/pm2-pi-supervision/evidence/US-004/manifest.sha256)"
jq '.amendments.current|length' .oh/tasks/pm2-pi-supervision/evidence/benchmark-manifest.json
```

Exit `0`; hash match true, amendments `0`.

```sh
E=.oh/tasks/pm2-pi-supervision/evidence/US-006/version-integrity-source.json
PI_REAL=$(readlink -f "$(command -v pi)")
PI_ROOT=$(dirname "$(dirname "$PI_REAL")")
test "$(sha256sum "$PI_ROOT/package.json" | cut -d' ' -f1)" = "$(jq -r '.pi.packageJsonSha256' "$E")"
test "$(sha256sum "$PI_ROOT/dist/main.js" | cut -d' ' -f1)" = "$(jq -r '.pi.mainSourceSha256' "$E")"
test "$(sha256sum "$PI_ROOT/dist/modes/rpc/rpc-mode.js" | cut -d' ' -f1)" = "$(jq -r '.pi.rpcSourceSha256' "$E")"
```

Exit `0`. Exact US-006 PM2/Pi identity, placeholder, direct-topology, safe-stop, and no-wrapper assertions also exited `0`.

A read-only Python inventory check recomputed every US-016 traceability byte count/hash: `traceability_inventory=125`, `traceability_mismatches=0`; comparison/policy assertions returned `PASS`.

Final verdict: PASS (H0 / M0 / L0).
