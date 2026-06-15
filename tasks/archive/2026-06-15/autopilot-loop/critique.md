# Critique — autopilot-loop

Generated 2026-06-10; reviews `prd.md` post-/prd, pre-/ralph. 2 critics (implementer + user lens), per `/ship-spec` Stage 3.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-003] Infinite PR-flood via /harness-audit fallback — dedupe matches against open issues/PRs but /harness-audit output is free prose with no stable slug; slug-extraction undefined → fallback dedupe unreliable.
[SEVERITY: H] [US-003] cap-2 can permanently self-block if a PR hangs/abandoned; no stale-PR recovery path beyond kill switch; no human-readable "capped" warning.
[SEVERITY: H] [US-003] /ship-spec opens GH issue (stage 5) before PR; if /delegate later fails → dangling issue, no compensating cleanup.
[SEVERITY: H] [US-003] /delegate uses run_in_background for multi-task waves; cron child exits before workers finish → overlap:false (which guards on child exit) is insufficient → concurrent commits on next fire possible.
[SEVERITY: M] [US-003] "pm decompose" cited as existing primitive — verify .claude/agents/pm.md exists and cite exact invocation. (REFUTED in resolution: pm.md exists, invoked via Agent subagent_type:pm.)
[SEVERITY: M] [US-001] frontmatter AC causal claim wrong — runtime skips on missing `schedule:` field, not absence of `---`; verify grep -c '^---$' == 0.
[SEVERITY: M] [US-003] liveness printf "verbatim" — copy FORMAT, not heartbeat's status enum; use autopilot-specific status tokens.
[SEVERITY: M] [US-003] /harness-audit fallback spawns 4 agents every empty-backlog hour — no cost throttle.
[SEVERITY: M] [US-003] "on development" guardrail conflicts with own operation — after /ship-spec, HEAD is on feature branch; next fire fails guard unless restored.
[SEVERITY: M] [US-002/003] autopilot + heartbeat both at "0 * * * *" — separate overlap guards, can fire concurrently → memory log write race.
[SEVERITY: L] [US-004] Skills table "When" cell vs multi-line description — define truncation (first sentence).
[SEVERITY: L] [US-005] grep -c 'autopilot' >= 2 is weak — two prose mentions pass without a table row.
[SEVERITY: L] [US-003] "testable on demand" but no --dry-run AC; only test path is a live PR-opening run.
```

## Critic B — User lens

```
[SEVERITY: H] [US-003] kill switch (enabled:false) only stops NEXT fire, not a mid-run /delegate wave; no documented stop-now/abort mechanism.
[SEVERITY: H] [US-003] both-sources-exhausted (backlog empty AND audit fully deduped) branch undefined → risk of null/recycled selection.
[SEVERITY: H] [US-003] overnight PR quality unbounded; CI green is the only automated gate (catches lint/type/test, not semantics) — must be stated in Non-Goals to set expectations.
[SEVERITY: M] [US-003] /harness-audit fallback (4 agents) runs hourly on idle repo → 24 dup runs/day; cap-2 doesn't stop the audit calls.
[SEVERITY: M] [US-003] /ship-spec critic-gate HALT is a normal outcome but invisible to an unattended maintainer — needs a distinct memory/.cron.log entry.
[SEVERITY: M] [*] CI-red-after-ready unaddressed — "ensure CI green or leave draft" is ambiguous; a ready PR could have failing/pending CI.
[SEVERITY: M] [US-001] backlog lives in crons/ — footgun if frontmatter accidentally added; must not appear in Scheduled jobs table; add top-of-file "reference, not a cron" comment.
[SEVERITY: M] [US-004] CLAUDE.md is session-loaded identity — "no other lines changed" needs a git diff verification step.
[SEVERITY: L] [US-002] schedule collision with heartbeat (both 0 * * * *) — offset to 5 * * * *.
[SEVERITY: L] [*] Rollout says first fire "ships Drift Sentinel" but Non-Goals say Drift Sentinel is out of scope — clarify it is the selected work ITEM (a loop product), not part of this PRD.
```

## Synthesis
- **High-severity findings**: 7 (4 implementer + 3 user) — all unattended-operation safety; all AC-tightening (resolvable by revising prd.md ACs + the skill's documented behavior, no approach change).
- **Medium-severity findings**: 9 · **Low-severity**: 5.
- **Recommendation**: PROCEED with in-place mitigation. All HIGHs folded into prd.md `## Critic-gate mitigations`; one finding (pm callable) factually refuted. No GitHub-side state created at gate time; halt would have been fully reversible.
