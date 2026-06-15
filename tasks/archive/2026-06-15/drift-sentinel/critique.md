# Critique — drift-sentinel

Generated 2026-06-10; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-001] "expected branch" undefined for the unexpected-branch warning. → mitigated.
[SEVERITY: H] [US-001] `git fetch upstream` is not read-only in the git sense (writes remote-tracking refs + FETCH_HEAD); AC's "no working-tree-mutating checkout" is narrower than the "fully non-mutating" claim. → mitigated (read-only redefined precisely + fetch guarded/timed-out).
[SEVERITY: H] [US-001] Cron-staleness via /proc/<pid>/stat assumes the PID (crons/.pid=1791166, host namespace) is resolvable from where the skill runs; may not be in a container PID namespace. → mitigated (fallback required).
[SEVERITY: M] [US-001] Section (A) remediation `<paths>` placeholder teaches nothing and bare `git checkout upstream/development --` is destructive. → mitigated (derive real paths via git diff --name-only; never recommend pathless checkout).
[SEVERITY: M] [US-001] "Inert crons" mtime check will always fire on heartbeat.md after US-003 edits it until runtime restart. → acknowledged: this is CORRECT drift (the cron boot-load gap the skill exists to catch); remediation (restart runtime) clears it.
[SEVERITY: M] [US-003] New heartbeat step number/position unspecified. → mitigated (step 2.7, after 2.5, before 3).
[SEVERITY: M] [US-002] `grep -c 'drift-check'` counts lines, can exceed 1 with prose refs. → mitigated (match table-row syntax).
[SEVERITY: M] [US-001] Scope: three detection algorithms in one story; no structural test. → kept unified (avoids two workers editing one file) + added structural grep AC.
[SEVERITY: L] [US-001] No guard when `upstream` remote missing. → mitigated (preflight `git remote get-url upstream`).
[SEVERITY: L] [US-004] Changelog link needs a real issue/PR number. → mitigated (US-004 runs after issue # known; require valid ([#N](url))).
```

## Critic B — User lens

```
[SEVERITY: H] [US-003] No zero-drift output contract — heartbeat could bloat every hourly log. → mitigated (skill prints single summary line; heartbeat appends DRIFT: only when drift found, nothing extra when clean).
[SEVERITY: H] [US-003] [PROTECTED-PATH] crons/heartbeat.md edited without override note. → FALSE POSITIVE: protected-paths policy scopes protection to deletion/deprecation only; US-003 is additive and preserves the step-2.5 block byte-identical. Added explicit additive-only + git-revert rollback note to AC for transparency.
[SEVERITY: H] [US-001] `git fetch` is a network call + ref mutation, conflicts with read-only claim; fails offline. → mitigated (same as Critic A H git-fetch: precise read-only definition + offline-safe + timeout).
[SEVERITY: M] [US-001] /proc assumes Linux procfs (not portable to darwin). → mitigated (Linux-sandbox constraint stated + platform guard message).
[SEVERITY: M] [US-003] Heartbeat timing budget unconstrained; fetch can stall overlap:false pulse. → mitigated (timeout on fetch).
[SEVERITY: M] [*] No behavior scoped for missing upstream remote. → mitigated (preflight guard + diagnostic message).
[SEVERITY: M] [US-001] "Expected branch" undefined (dup of Critic A). → mitigated.
[SEVERITY: L] [US-002] AGENTS.md is session-load-bearing; malformed table corrupts discovery for all sessions. → acknowledged (table-validity AC already present; note added).
[SEVERITY: L] [US-004] "As a maintainer" inconsistent with single-developer framing. → mitigated ("As the orchestrator").
```

## Synthesis

- **High-severity findings**: 6 raised (3 Critic A + 3 Critic B; the two git-fetch findings are the same issue raised twice).
  - 5 distinct H issues mitigated in-place via AC tightening: expected-branch definition, git-fetch read-only redefinition + offline/timeout guards, cron-PID namespace fallback, heartbeat zero-drift output contract.
  - 1 H ([PROTECTED-PATH] on crons/heartbeat.md) determined a **false positive** under the policy's own "deletion or deprecation" scope; the edit is additive and preserves the protected block byte-identical. Additive-only + rollback note added for transparency.
- **Medium-severity findings**: 9 — all mitigated or explicitly acknowledged (the heartbeat-self-trip M is correct-by-design drift).
- **Low-severity findings**: 4 — mitigated or acknowledged.
- **New scope added from critique**: per the protected-paths.txt header ("ship a new orchestrator-load-bearing skill → ADD it here in the same PR"), `drift-check` is added to `.claude/protected-paths.txt` in US-002 (it becomes referenced by the heartbeat cron at runtime).
- **Recommendation**: PROCEED (no unmitigated high-severity finding remains after in-place AC revision).
