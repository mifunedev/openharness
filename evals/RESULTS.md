# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| autopilot-executor-toggle | A | 2026-06-14 15:16 | PASS | conversation 2026-06-13 (autopilot delegate-advisor executor) |
| autopilot-pi-agent | A | 2026-06-14 15:16 | PASS | issue #116 (autopilot Pi tmux alignment) 2026-06-14; issue #118 (attachable Pi TUI tmux) 2026-06-14; issue #126 (kept Pi overlap lock release) 2026-06-14 |
| boot-lint-glob | A | 2026-06-14 15:16 | PASS | issue #90, issue #120 |
| clean-restore | A | 2026-06-14 15:16 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| cleanup-tasks-scoped-guard | A | 2026-06-14 15:16 | PASS | issue #85 |
| cron-claude-codex-fallback | A | 2026-06-14 15:16 | PASS | conversation 2026-06-12 (default Codex fallback for crons) |
| devtcp-hook | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-10 (zsh /dev/tcp) |
| drift-check-cron-staleness-glob | A | 2026-06-14 15:16 | PASS | issue #98 |
| eval-ci-gate | A | 2026-06-14 15:16 | PASS | #103 — eval probe suite gated in CI |
| eval-gate | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-11 (eval-gate) |
| eval-results-atomic | A | 2026-06-14 15:16 | PASS | issue #83 (eval-results-atomic-write) |
| eval-runner-exit | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-11 (eval-runner-exit) #29 |
| health-check-docker-stats | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-10 (docker stats vs ps Size) |
| memory-gitignore-claim | A | 2026-06-14 15:16 | PASS | issue #101 |
| next-dev-prod | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-04 |
| owned-surface-guard | A | 2026-06-14 15:16 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| ralph-fallback-order | A | 2026-06-14 15:16 | PASS | conversation 2026-06-12 (Ralph default fallback order) |
| rl-delegation-write-worker | A | 2026-06-14 15:16 | PASS | memory/MEMORY.md 2026-06-10 (rl-delegation) #57 |
| skill-paths | A | 2026-06-14 15:16 | PASS | issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard |
| submitted-by-trailers | A | 2026-06-14 15:16 | PASS | conversation 2026-06-12 (commit attribution trailers) |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
