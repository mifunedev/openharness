# Critique — prompt-miner

Generated 2026-06-19; reviews `prd.md` post-/prd, pre-/ralph. Two adversarial critics
(implementer + user lens), plus orchestrator verification of the high-severity claims.

## Critic A — Implementer lens (raw)

```
[H US-008] /orchestrate has no --repo flag and does not consume AUTOPILOT_REPO; the cron cannot make /orchestrate target origin/development. ship-spec defaults to mifunedev/openharness; autopilot-upstream-default.sh probe guards that default.
[H US-008] Cron step "run /orchestrate so the loop ships a PR" is mechanically broken: /orchestrate starts at ideate and re-derives its own candidate; no AC specifies how the top mined marker becomes a loop-ready prd.json at the plan node.
[H US-003] isMeta claimed phantom; suggests userType=="external" + promptSource for the human-prompt detector.
[M US-002] Ground-truth git log origin/development needs a fetched ref; no `git fetch origin development` step; cron worktrees cut from local HEAD.
[M US-001] US-001 bundles ≥6 independently testable units (CLI, enumeration, streaming, Claude adapter, Pi adapter, dedup, exports) into one story.
[M US-007] Unquoted $ARGUMENTS in `node ... $ARGUMENTS` word-splits --weights JSON; shell-injection/word-split surface.
[M US-004] Redaction set misses github_pat_, sk-ant-, and multi-line key BODIES (only the BEGIN header line).
[M US-009] Probe AC doesn't specify how it locates mine-traces.mjs/fixtures; existing probes derive ROOT via dirname; needs SKIPPED guard.
[M US-007] render-log-entry.sh flag interface unspecified (retro's has a domain-specific signature).
[M US-007/008] No .pi/skills/prompt-miner/ mirror; retro-deterministic-contract.sh enforces .pi mirror parity — parity gap with no probe.
[M US-008] Cron omits preflight: field; autopilot uses preflight: scripts/autopilot-caps.sh to gate open-PR caps; PR-creating cron is unguarded.
[L US-004] --report-only "never proposes/performs MEMORY/IDENTITY edits" is ambiguous vs the daily log write at memory/<date>/log.md.
[L US-001] --max-file-mb skip behavior unspecified; no skippedFiles manifest counter.
```

## Critic B — User lens (raw)

```
[H US-008] /orchestrate always starts at ideate; no --input/--seed/--candidate; the mined marker is silently discarded and the loop ships whatever ideate independently finds.
[H US-008] Non-Goal "no autonomous MEMORY/IDENTITY writes from cron" contradicts the loop's retro node, which /orchestrate walks; retro needs propose-then-confirm — cron either stalls or auto-approves.
[H US-008] autopilot-caps.sh is scoped to mifunedev; prompt-miner targets the origin fork, so the existing caps don't cover it — up to 7+ unreviewed PRs/week for a solo dev.
[H US-008] enabled: true default vs autopilot's enabled: false opt-in for a PR-shipping cron; no kill-switch documented.
[M US-008] worktree:true: branch push-before-reap and $AUTOPILOT_LOG_ROOT-style shared-root log resolution unspecified.
[M US-001/002] "zero-dependency" vs implicit `git` binary dependency for the ground-truth bonus; --dry-run probe bypasses it; no test of the git-absent path.
[M US-008] "mine last 24h" vs --since/--until YYYY-MM-DD: midnight-UTC sessions double-counted/missed; suggests --hours N.
[M US-006/007] sessions_supporting≥10 + stratification unreachable on a small corpus → NO-CANDIDATE for weeks; suggests a NO-CORPUS early-exit.
[M *] Wiki creation is embedded in Wiki Alignment, not a standalone US-011; risk of being dropped.
[L US-003] correctionDensity is the highest-variance signal (casual clarifications fire the lexicon); calibrate against hand-labeled sessions.
[L US-007] disable-model-invocation vs LLM marker synthesis in Step 3 — clarify the flag only blocks auto-invocation.
```

## Orchestrator verification of high-severity findings

| Claim | Verified? | Evidence |
|---|---|---|
| `/orchestrate` has no `--repo` / candidate-seed | **TRUE** | `argument-hint: "[--start <node>] [--dry-run] [--max-iters <N>]"`; only `--start` gates entry (`.claude/skills/orchestrate/SKILL.md:3,53`). |
| `/orchestrate`→ship-spec defaults to upstream | **TRUE** | `SHIP_SPEC_REPO="${SHIP_SPEC_REPO:-mifunedev/openharness}"` (`ship-spec/SKILL.md:61`); `evals/probes/autopilot-upstream-default.sh` guards it. |
| Caps scoped to mifunedev, not origin | **TRUE** | `REPO="${AUTOPILOT_REPO:-mifunedev/openharness}"` (`scripts/autopilot-caps.sh:50`). |
| PR-shipping cron defaults `enabled:false` + preflight caps | **TRUE** | `crons/autopilot.md`: `enabled: false`, `preflight: scripts/autopilot-caps.sh`, `repo: mifunedev/openharness`. |
| `isMeta` is a phantom field (Critic A) | **FALSE** | `isMeta:true` exists (sparse); `userType=="external"` + string-vs-array content are the stronger discriminators. US-003 detector is essentially correct; refine with `userType`. |
| `disable-model-invocation` blocks Step-3 LLM synthesis (Critic B) | **FALSE** | The flag only suppresses *auto*-invocation; a user-typed `/prompt-miner` still runs the body's synthesis. No conflict. |

## Synthesis
- **High-severity findings**: 6 raw (4 distinct, all US-008 cron) + 1 refuted (isMeta) + 1 refuted (disable-model-invocation).
- **Medium-severity findings**: ~10 — accepted as PRD refinements (split US-001, redaction patterns, $ARGUMENTS quoting, probe path+SKIPPED, render-log-entry flags, .pi mirror+parity probe, git-fetch/--no-git, --hours window, NO-CORPUS token, promote wiki to US-011).
- **Recommendation (initial)**: **HALT** — the US-008 cron→`/orchestrate`→origin mechanism is mechanically infeasible (`/orchestrate` cannot target origin nor be seeded) and unsafe as specced (`enabled:true`, uncapped). The skill core was sound. No GitHub-side state was created.

## Re-gate (after PRD revision)

Operator chose: cron → file origin issue → `/ship-spec --repo ryaneggz/openharness --base development --issue <N>`, shipped `enabled: false` + origin-scoped preflight caps. PRD rewritten (US-009 cron; engine split US-001/US-002; medium fixes folded in). One focused re-gate critic run:

- **RE-GATE VERDICT: PROCEED.**
- Prior 4 HIGH findings: all **MITIGATED**. retro-consistency: **MITIGATED** (`/ship-spec` does not walk retro/compound, so no unattended MEMORY/IDENTITY mutation).
- New finding **[M US-009]**: label-cap no-op — cron labeled only the issue; GitHub doesn't propagate the label to the PR, so the cap read 0. **Fixed in PRD**: US-009 now labels the created PR via `gh pr edit <PR> --add-label prompt-miner` after `/ship-spec`.
- Verified independently: `/ship-spec` supports `--repo`/`--base`/`--issue`; `cron-runtime.ts:28` exports `repo:`→`AUTOPILOT_REPO`; `autopilot-caps.sh` reads `AUTOPILOT_REPO`/`AUTOPILOT_LABEL`.

- **Recommendation (final)**: **PROCEED** to Stage 5 (open GH issue) — no unmitigated high-severity findings remain.
