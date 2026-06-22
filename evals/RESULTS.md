# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| advisor-monitored-loop | A | 2026-06-22 05:16 | PASS | conversation 2026-06-19 (advisor-monitored ralph loop pattern, issue #257) |
| agent-browser-cli | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-07 (agent-browser 0.8.5 CLI) |
| autopilot-executor-toggle | A | 2026-06-22 05:16 | PASS | conversation 2026-06-13 (autopilot delegate-advisor executor) |
| autopilot-merged-pr-reference-dedupe | A | 2026-06-22 05:16 | PASS | issue #468 — autopilot must not rebuild open tickets whose development PRs already merged |
| autopilot-no-pr-session-close | A | 2026-06-22 05:16 | PASS | issue #209 (autopilot no-PR tmux session closure) 2026-06-16 |
| autopilot-open-pr-reference-dedupe | A | 2026-06-22 05:16 | PASS | issue #437 — autopilot must not start duplicate work when open PRs reference the same issue without linked-PR metadata |
| autopilot-pi-agent | A | 2026-06-22 05:16 | PASS | issue #116 (autopilot Pi tmux alignment) 2026-06-14; issue #118 (attachable Pi TUI tmux) 2026-06-14; issue #126 (kept Pi overlap lock release) 2026-06-14; issue #142 (worktree-by-default, skip→worktree) 2026-06-14 |
| autopilot-preflight-gate | A | 2026-06-22 05:16 | PASS | issue #194 (deterministic autopilot caps preflight gate) 2026-06-15 |
| autopilot-upstream-default | A | 2026-06-22 05:16 | PASS | issue #420 — future autopilots must target canonical repo, not personal fork |
| autopilot-worktree-log-root | A | 2026-06-22 05:16 | PASS | issue #152 (persist autopilot worktree logs) 2026-06-15 |
| boot-lint-glob | A | 2026-06-22 05:16 | PASS | issue #90, issue #120 |
| capability-benchmark-schema | A | 2026-06-22 05:16 | PASS | issue #167 — capability benchmark instrument |
| clean-restore | A | 2026-06-22 05:16 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| cleanup-tasks-scoped-guard | A | 2026-06-22 05:16 | PASS | issue #85 |
| cleanup-tasks-worktree-grooming | A | 2026-06-22 05:16 | PASS | issue #168; issue #478 |
| codex-stale-response-retry | A | 2026-06-22 05:16 | PASS | issue #506 — Codex previous_response_not_found RCA |
| cron-claude-codex-fallback | A | 2026-06-22 05:16 | PASS | conversation 2026-06-12 (default Codex fallback for crons) |
| cron-watchdog | A | 2026-06-22 05:16 | PASS | issues #130/#453 (cron runtime watchdog + legacy system-cron reaping) 2026-06-19 |
| curl-bash-safe-alternatives | A | 2026-06-22 05:16 | PASS | vet-run/vet integration — public curl|bash examples need review-first alternatives |
| datasets-schema | A | 2026-06-22 05:16 | PASS | issue #196 — evals/datasets verifiable trajectory corpus (Repo2RLEnv-inspired) |
| devtcp-hook | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-10 (zsh /dev/tcp) |
| docs-build-fast-path | A | 2026-06-22 05:16 | PASS | #455 — docs builds must stay out of fast harness/eval/release gates |
| drift-check-cron-staleness-glob | A | 2026-06-22 05:16 | PASS | issue #98; issue #225 (restart-required cron frontmatter/config drift) |
| eval-ci-gate | A | 2026-06-22 05:16 | PASS | #103 — eval probe suite gated in CI |
| eval-gate | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-11 (eval-gate) |
| eval-results-atomic | A | 2026-06-22 05:16 | PASS | issue #83 (eval-results-atomic-write) |
| eval-runner-exit | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-11 (eval-runner-exit) #29 |
| git-skill | A | 2026-06-22 05:16 | PASS | conversation 2026-06-15 — rules are not always supported; git workflow must be the /git skill |
| harness-audit-empty-output-gate | A | 2026-06-22 05:16 | PASS | issue #246 — /harness-audit must fail closed on empty auditor outputs |
| harness-audit-memory-path | A | 2026-06-22 05:16 | PASS | issue #183 — /harness-audit must inspect the active worktree, not a hardcoded root |
| harness-audit-shared-memory | A | 2026-06-22 05:16 | PASS | issue #432 — /harness-audit must load durable memory from shared log root in cron worktrees |
| harness-ci-core-paths | A | 2026-06-22 05:16 | PASS | #165 — core sandbox config files must trigger harness CI |
| harness-ci-hooks-paths | A | 2026-06-22 05:16 | PASS | issue #202 — credential/security hook changes must trigger harness CI |
| health-check-docker-stats | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-10 (docker stats vs ps Size) |
| heartbeat-logging-contract | A | 2026-06-22 05:16 | PASS | issue #447 (heartbeat log append hardening) 2026-06-18 |
| locked-append-critical-path | A | 2026-06-22 05:16 | PASS | issue #204 (lock shared runtime log appends) 2026-06-15 |
| memory-gitignore-claim | A | 2026-06-22 05:16 | PASS | issue #101 |
| memory-log-locked-append | A | 2026-06-22 05:16 | PASS | issue #476 — memory log writes in skill contracts must use scripts/locked-append.sh |
| next-dev-prod | A | 2026-06-22 05:16 | SKIPPED | memory/MEMORY.md 2026-06-04 |
| owned-surface-guard | A | 2026-06-22 05:16 | PASS | issue #63 (autopilot-stray-wip-guard) 2026-06-12; issue #81 (owned-paths-zsh-split) 2026-06-13 |
| pnpm-audit-ci-gate | A | 2026-06-22 05:16 | PASS | issue #171 — pnpm security audits must run in CI |
| pr-audit-duplicate-issue-refs | A | 2026-06-22 05:16 | PASS | issue #439 — /pr-audit must flag duplicate open PRs that reference the same issue |
| prd-output-path-contract | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-19 |
| prompt-miner-schema-compat | A | 2026-06-22 05:16 | PASS | issue #253 — prompt-miner JSONL schema-drift guard |
| ralph-fallback-order | A | 2026-06-22 05:16 | PASS | conversation 2026-06-12 (Ralph default fallback order) |
| repo-map-contract | A | 2026-06-22 05:16 | PASS | issue #464 — repo map must optimize orientation without adding a tree dependency or unmeasured performance claims |
| retro-deterministic-contract | A | 2026-06-22 05:16 | PASS | issue #443 — /retro deterministic output and self-contained helper contract |
| rl-delegation-write-worker | A | 2026-06-22 05:16 | PASS | memory/MEMORY.md 2026-06-10 (rl-delegation) #57 |
| sandbox-boot-guard-ci | A | 2026-06-22 05:16 | PASS | issue #449 (sandbox image build CI guard) 2026-06-19 |
| ship-spec-ready-finalization | A | 2026-06-22 05:16 | PASS | issue #134 — /ship-spec must finalize ready PRs after gates, not stop at draft scaffold |
| skill-paths | A | 2026-06-22 05:16 | PASS | issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard |
| spec-family-contract | A | 2026-06-22 05:16 | PASS | conversation 2026-06-19 (spec-* family split, issue #265) |
| submitted-by-trailers | A | 2026-06-22 05:16 | PASS | conversation 2026-06-12 (commit attribution trailers) |
| watchdog-completed-session-reap | A | 2026-06-22 05:16 | PASS | issue #235 (completed autopilot PR session reaping) |
| watchdog-draft-prs | A | 2026-06-22 05:16 | PASS | conversation 2026-06-15 (generic watchdog + stale draft PR recovery) |
| watchdog-stuck-sessions | A | 2026-06-22 05:16 | PASS | issue #240 (Codex zero-credit stuck autopilot sessions) 2026-06-17 |
| wiki-readme-index | A | 2026-06-22 05:16 | PASS | issue #132 — wiki README index drift guard |
| workflow-boundaries | A | 2026-06-22 05:16 | PASS | conversation 2026-06-19 (workflow consolidation, issue #259) |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
