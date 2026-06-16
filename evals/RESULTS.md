# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| agent-browser-cli | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-07 (agent-browser 0.8.5 CLI) |
| autopilot-executor-toggle | A | 2026-06-16 00:34 | PASS | conversation 2026-06-13 (autopilot delegate-advisor executor) |
| autopilot-pi-agent | A | 2026-06-16 00:34 | PASS | issue #116 (autopilot Pi tmux alignment) 2026-06-14; issue #118 (attachable Pi TUI tmux) 2026-06-14; issue #126 (kept Pi overlap lock release) 2026-06-14; issue #142 (worktree-by-default, skip→worktree) 2026-06-14 |
| autopilot-stale-draft-watchdog | A | 2026-06-16 00:34 | PASS | issue #161 — stale autopilot draft watchdog must surface investigation, not undraft |
| autopilot-worktree-log-root | A | 2026-06-16 00:34 | PASS | issue #152 (persist autopilot worktree logs) 2026-06-15 |
| boot-lint-glob | A | 2026-06-16 00:34 | PASS | issue #90, issue #120 |
| capability-benchmark-schema | A | 2026-06-16 00:34 | PASS | issue #167 — capability benchmark instrument |
| clean-restore | A | 2026-06-16 00:34 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| cleanup-tasks-scoped-guard | A | 2026-06-16 00:34 | PASS | issue #85 |
| cleanup-tasks-worktree-grooming | A | 2026-06-16 00:34 | PASS | issue #168 |
| cron-claude-codex-fallback | A | 2026-06-16 00:34 | PASS | conversation 2026-06-12 (default Codex fallback for crons) |
| cron-watchdog | A | 2026-06-16 00:34 | PASS | issue #130 (cron runtime watchdog) 2026-06-14 |
| curl-bash-safe-alternatives | A | 2026-06-16 00:34 | PASS | vet-run/vet integration — public curl|bash examples need review-first alternatives |
| datasets-schema | A | 2026-06-16 00:34 | PASS | issue #196 — evals/datasets verifiable trajectory corpus (Repo2RLEnv-inspired) |
| devtcp-hook | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-10 (zsh /dev/tcp) |
| drift-check-cron-staleness-glob | A | 2026-06-16 00:34 | PASS | issue #98 |
| eval-ci-gate | A | 2026-06-16 00:34 | PASS | #103 — eval probe suite gated in CI |
| eval-gate | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-11 (eval-gate) |
| eval-results-atomic | A | 2026-06-16 00:34 | PASS | issue #83 (eval-results-atomic-write) |
| eval-runner-exit | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-11 (eval-runner-exit) #29 |
| harness-audit-memory-path | A | 2026-06-16 00:34 | PASS | issue #176 — /harness-audit must load long-term memory from memory/MEMORY.md |
| health-check-docker-stats | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-10 (docker stats vs ps Size) |
| loop-benchmark-gate | A | 2026-06-16 00:34 | PASS | issue #179 — wire the executable-loop `benchmark` node (close the cycle) |
| loop-handoff-consistency | A | 2026-06-16 00:34 | PASS | context/rules/loop.md § 4 (executable-loop Handoff convention) |
| loop-repeat-gate | A | 2026-06-16 00:34 | PASS | issue #173 — wire the executable-loop `repeat` node (cycle-closing edge) |
| loop-runner-contract | A | 2026-06-16 00:34 | PASS | issue #160 — /loop-runner contract; issue #175 — reserved /loop command rename |
| memory-gitignore-claim | A | 2026-06-16 00:34 | PASS | issue #101 |
| next-dev-prod | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-04 |
| owned-surface-guard | A | 2026-06-16 00:34 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| pnpm-audit-ci-gate | A | 2026-06-16 00:34 | PASS | issue #171 — pnpm security audits must run in CI |
| ralph-fallback-order | A | 2026-06-16 00:34 | PASS | conversation 2026-06-12 (Ralph default fallback order) |
| rl-delegation-write-worker | A | 2026-06-16 00:34 | PASS | memory/MEMORY.md 2026-06-10 (rl-delegation) #57 |
| ship-spec-ready-finalization | A | 2026-06-16 00:34 | PASS | issue #134 — /ship-spec must finalize ready PRs after gates, not stop at draft scaffold |
| skill-paths | A | 2026-06-16 00:34 | PASS | issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard |
| submitted-by-trailers | A | 2026-06-16 00:34 | PASS | conversation 2026-06-12 (commit attribution trailers) |
| wiki-readme-index | A | 2026-06-16 00:34 | PASS | issue #132 — wiki README index drift guard |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
