# Critique — ralph-runner-test-coverage

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-002] REPO_ROOT env injection alone does NOT control normal-mode REPO_ROOT — line 358 unconditionally re-derives `git rev-parse --show-toplevel 2>/dev/null || pwd`; the env var is only honored in --loop mode (line 283). The child must be spawned with cwd = a non-git temp dir so git rev-parse falls back to pwd. | RECOMMENDATION: US-002 AC must require spawnSync(..., { cwd: tmpDir, env: { ...process.env, REPO_ROOT: tmpDir } }).
[SEVERITY: H] [US-002] (CLAIM) resolve_initial_harness/require_harness_command (lines 375-376) run BEFORE the task-dir/four-file checks, so in CI (no claude binary) those branches are unreachable without a harness stub. | STATUS: REFUTED empirically — see Synthesis. Checks at lines 361/369 precede harness resolution at 375; verified with PATH=/usr/bin:/bin returning exit 1 + expected messages.
[SEVERITY: M] [US-001] `--harness` no-value AC has no stderr assertion while every other case does — not spec-locked against message drift. | RECOMMENDATION: add stderr matches /requires a value/.
[SEVERITY: M] [US-003] Guard AC verifies only 2 of 3 invocation paths; the no-tmux foreground path (line 389 `exec bash "$SCRIPT_PATH" --loop`) is omitted. | RECOMMENDATION: add a third verification bullet.
[SEVERITY: M] [US-004] If US-003 is dropped, US-004 lacks an explicit skip gate in its own header. | RECOMMENDATION: add "skip entire story if US-003 dropped" to US-004 AC.
[SEVERITY: M] [US-004] claude_limit_detected uses TWO greps AND-ed (line 182): `hit (your|the)? limit` AND `resets?`. A positive fixture missing one yields a false negative. | RECOMMENDATION: require both phrases in the positive fixture + a negative case where only one matches.
[SEVERITY: L] [US-001] Exit-code propagation of `exit 2` inside `$(normalize_harness …)` is bash-specific; tests MUST invoke bash not sh. | RECOMMENDATION: echo the bash constraint into the AC. (Verified: exits 2 under bash.)
[SEVERITY: L] [US-001/US-002] run() opts param is implicit; established harness-config.test.ts uses run(args: string[]). | RECOMMENDATION: specify run(args: string[], opts?: { env?, cwd? }).
```

## Critic B — User lens

```
[SEVERITY: M] [US-003] "Conditional/optional" framing is an in-flight judgment call with no team to adjudicate; the drop-to-black-box fallback isn't encoded as a formal Non-Goal branch. | RECOMMENDATION: add the conditional-drop branch to Non-Goals.
[SEVERITY: M] [US-004] require_harness_command path (lines 122-130) is untested though implied comprehensive. | RECOMMENDATION: add it to US-004 AC or note out-of-scope in Non-Goals.
[SEVERITY: M] [US-001] `--harness` last-arg edge: ensure RALPH_HARNESS is absent from child env so the empty-value check (not set -e) fires; assert exit 2. | RECOMMENDATION: specify no RALPH_HARNESS in child env for that case.
[SEVERITY: M] [US-002] Hermeticity depends on REPO_ROOT handling; cite the line so a future edit can't silently break it. | RECOMMENDATION: add an AC citing line 358 behavior.
[SEVERITY: L] [US-001] Pin the taskdesc regex assertion to the actual error string (cite line). | RECOMMENDATION: cite line 354 "must match".
[SEVERITY: L] [*] Non-Goals omit the --loop re-entry path arg handling. | RECOMMENDATION: add to Non-Goals.
[SEVERITY: L] [US-001/US-002] Soften the DRY sub-loop prescription to "may be implemented as a sub-loop." | RECOMMENDATION: keep the outcome required, not the mechanism.
```

## Synthesis

- **High-severity findings**: 2 raised; 1 REFUTED empirically (US-002 harness-ordering — task-dir/four-file checks at lines 361/369 precede harness resolution at line 375; confirmed exit 1 with no harness on PATH, so NO harness stub is needed), 1 CONFIRMED and mitigated at the AC level (US-002 REPO_ROOT — child must run with `cwd` = non-git temp dir; line 358 re-derives REPO_ROOT and ignores the env var).
- **Medium-severity findings**: 8 — all folded into revised ACs (message-locking, third invocation path, US-004 skip gate, claude_limit_detected AND-logic, require_harness_command scope, last-arg edge, hermeticity citation).
- **Low-severity findings**: 5 — folded in (bash-not-sh constraint, run() signature, regex message pin, --loop Non-Goal, soften DRY prescription).
- **No protected-path violations; no destructive operations.** Purely additive test code.
- **Recommendation**: REVISE-PRD (done in this commit) → PROCEED. No unmitigated high-severity finding remains.
