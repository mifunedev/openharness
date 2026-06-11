# Critique — cron-config-hot-reload

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[H] [US-001] entry.filePath is a bare basename, not absolute — naive reloadBody fails every fire.
  loadCrons (line 54) calls parseCronFile(content, f) with f = bare filename; parseCronFile stores
  filePath: file (line 45). reloadBody doing fs.readFileSync(entry.filePath) resolves relative to cwd.
  FIX: loadCrons must store path.join(dir, f) as filePath (id derivation via path.basename is unaffected).
[H] [US-003] BODY_RELOAD_ERR log assertion infeasible — LOG_FILE is a module-const bound at import (line 22).
  FIX: export reloadBody; assert log signals via vi.spyOn(fs, "appendFileSync"), not a tmp-dir log file.
[H] [US-002] BODY_RELOADED diff-detection split across call sites → duplication / untestable boundary.
  FIX: reloadBody owns the read + diff + both log signals + fallback, returns the body string; call sites
  just use the return value. reloadBody is exported and unit-tested directly.
[M] [US-001/002] Synchronous fs.readFileSync on the croner callback blocks the event loop — fine for
  hourly-or-less crons; document as accepted tradeoff.
[M] [US-002] Repeated BODY_RELOAD_ERR on sustained failure runs a stale body silently; ensure the log
  carries filename + truncated error (log() truncates msg to 200 chars — fits).
[M] [US-002] Exact-string diff includes trailing CRLF/whitespace → spurious BODY_RELOADED. Document that
  raw-content diff is intentional, or normalize. (Chosen: raw diff; boot body and disk body both read utf-8.)
[L] [US-004] "no content removed" AC is manual-review only. [L] property test parseCronFile contract must
  stay unchanged. [L] AC <basename> placeholder should be a concrete expression.
```

## Critic B — User lens

```
[H] [US-004] "unless the optional watcher is running" is a FALSE AFFORDANCE — no watcher exists (Non-Goals
  defers it). FIX: reword to "schedule/enabled/timezone changes require a runtime restart; no watcher exists."
[H] [*] [PROTECTED-PATH] scripts/cron-runtime.ts is on .claude/protected-paths.txt. NOTE: the protected-paths
  gate is about DELETION/DEPRECATION (per file header); this change is purely additive, so it is NOT a true
  violation. Still: add an explicit override/justification note + rollback. (Mitigation applied.)
[M] [*] Title "hot-reload cron definitions" implies frontmatter reload too; body-only scope buried in
  Non-Goals. FIX: add a one-line body-only scope statement at top of Goals.
[M] [US-001/002] No documented escape hatch. FIX: add a Rollback section (revert = drop reloadBody, restore
  the two entry.body usages; no config flag).
[M] [US-002] entry never mutated (FR-4) → BODY_RELOADED logs every fire post-edit. FIX: document this as
  intentional drift signaling (fired body != boot body until runtime restart re-baselines).
[M] [US-001] Sync read blocks event loop — document accepted for single-dev hourly crons.
[L] property-test generators; [L] prompt-file write-once confirmation.
```

## Synthesis

- **High-severity findings**: 5 (A: 3, B: 2) — Critic B's [PROTECTED-PATH] is a non-violation (additive change; gate targets deletion/deprecation) but an override note is added regardless.
- **Medium-severity findings**: 7
- **Low-severity findings**: 5
- **Recommendation**: PROCEED — all five H findings have concrete AC-level mitigations, folded into the revised `prd.md` (basename→full-path fix in `loadCrons`; export `reloadBody` + spy-based tests; single-responsibility `reloadBody` owning diff+log+fallback; US-004 false-affordance reworded; protected-path override note + Rollback section added). No GitHub state existed at gate time; the spec was the cheapest artifact to revise.
