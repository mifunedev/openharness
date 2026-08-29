# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`.oh/evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| advisor-monitored-loop | A | 2026-08-29 06:52 | PASS | conversation 2026-06-19 (single-owner implementation workflow, issue #257) |
| agent-browser-cli | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-07 (agent-browser 0.8.5 CLI) |
| agents-identity-contract | A | 2026-08-29 06:52 | PASS | issue #854 — T3-style root identity, glossary, and skill-owned procedures |
| artifact-contract-audit | A | 2026-08-29 06:52 | PASS | issue #583/#645 — production /audit implementation Gate 1 behavior |
| audit-dispatcher-contract | A | 2026-08-29 06:52 | PASS | issue #645 — audit consolidation public taxonomy |
| audit-implementation-behavior | A | 2026-08-29 06:52 | PASS | issue #645 — implementation root/repo/browser behavior |
| audit-pr-acquire | A | 2026-08-29 06:52 | PASS | issue #645 — production PR acquisition behavior |
| audit-pr-classifier | A | 2026-08-29 06:52 | PASS | issue #645 — deterministic focused and queue PR classifier |
| audit-run-root-contract | A | 2026-08-29 06:52 | PASS | issue #645 — executable immutable audit root/run correlation |
| audit-shellcheck-coverage | A | 2026-08-29 06:52 | PASS | issue #645 — private audit scripts require release and CI lint coverage |
| audit-stale-references | A | 2026-08-29 06:52 | PASS | issue #645 — clean-breaking audit migration |
| boot-lint-glob | A | 2026-08-29 06:52 | PASS | issue #90, issue #120 |
| builder-skill-consolidation | A | 2026-08-29 06:52 | PASS | issue #643 — consolidate artifact builders behind one /builder dispatcher |
| capability-benchmark-schema | A | 2026-08-29 06:52 | PASS | issue #167 — capability benchmark instrument |
| cc-safety-net-wiring | A | 2026-08-29 06:52 | PASS | .oh/tasks/cc-safety-net/prd.json US-007 2026-07-19 |
| changelog-entry-length | A | 2026-08-29 06:52 | PASS | conversation 2026-08-24 — CHANGELOG.md grew to 259KB of bullet prose because "one line" was unquantified |
| cleanup-tasks-scoped-guard | A | 2026-08-29 06:52 | PASS | issue #85 |
| cleanup-tasks-worktree-grooming | A | 2026-08-29 06:52 | PASS | issue #168; issue #327 |
| close-issues-on-development | A | 2026-08-29 06:52 | PASS | issue #841 (closing keywords never fire because the default branch is main) 2026-08-26 |
| codex-stale-response-retry | A | 2026-08-29 06:52 | PASS | issue #506 — Codex previous_response_not_found RCA |
| compose-config-path-parity | A | 2026-08-29 06:52 | PASS | ? |
| context-tier-size-budget | A | 2026-08-29 06:52 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-007) — the always-on tier was 85,256 B |
| cron-claude-codex-fallback | A | 2026-08-29 06:52 | PASS | conversation 2026-06-12 (default Codex fallback for crons) |
| cron-watchdog | A | 2026-08-29 06:52 | PASS | issues #130/#453 (cron runtime watchdog + legacy system-cron reaping) 2026-06-19 |
| curl-bash-safe-alternatives | A | 2026-08-29 06:52 | PASS | vet-run/vet integration — public curl|bash examples need review-first alternatives |
| datasets-schema | A | 2026-08-29 06:52 | PASS | issue #196 — .oh/evals/datasets verifiable trajectory corpus (Repo2RLEnv-inspired) |
| debugmcp-availability | A | 2026-08-29 06:52 | SKIPPED | issue #297 — DebugMCP MCP debug-server availability |
| delegate-model-effort-policy | A | 2026-08-29 06:52 | PASS | conversation 2026-07-11 (delegate model inheritance and thinking policy) |
| devtcp-hook | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-10 (zsh /dev/tcp) |
| docker-inspect-env-guard | A | 2026-08-29 06:52 | PASS | operator directive 2026-08-08 (agents keep the docker socket, but must |
| docs-build-fast-path | A | 2026-08-29 06:52 | PASS | #455 — docs builds must stay out of fast harness/eval/release gates; #536 — docs site externalized to openharness-web; docs markdown relocated to docs/ |
| drift-check-cron-staleness-glob | A | 2026-08-29 06:52 | PASS | issue #98; issue #225 (restart-required cron frontmatter/config drift) |
| entrypoint-pnpm-manifest-fingerprint | A | 2026-08-29 06:52 | PASS | issue #521 (manifest-aware sandbox installs) 2026-07-01 |
| env-schema-parity | A | 2026-08-29 06:52 | PASS | ? |
| eval-ci-gate | A | 2026-08-29 06:52 | PASS | #103 — eval probe suite gated in CI |
| eval-gate | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-11 (eval-gate) |
| eval-results-atomic | A | 2026-08-29 06:52 | PASS | issue #83 (eval-results-atomic-write) |
| eval-runner-exit | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-11 (eval-runner-exit) #29 |
| eval-runs-once-per-cycle | A | 2026-08-29 06:52 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-006) — /eval ran 3x per cycle on the |
| execution-target-contract | A | 2026-08-29 06:52 | PASS | issue #733 (ExecutionTarget contract + Docker Compose adapter) 2026-08-10 |
| get-oh-bootstrap | A | 2026-08-29 06:52 | PASS | get-oh.sh bootstrap — the Node-bootstrapping host-side path to the standalone `oh` CLI (also on npm as @mifune/openharness; see oh-npm-package.sh) |
| git-skill | A | 2026-08-29 06:52 | PASS | conversation 2026-06-15 — rules are not always supported; git workflow must be the /git skill |
| harness-audit-empty-output-gate | A | 2026-08-29 06:52 | PASS | issue #246 — /audit harness must fail closed on empty auditor outputs |
| harness-ci-core-paths | A | 2026-08-29 06:52 | PASS | #165 — core sandbox config files must trigger harness CI |
| harness-ci-hooks-paths | A | 2026-08-29 06:52 | PASS | issue #202 — credential/security hook changes must trigger harness CI |
| harness-yaml-migration | A | 2026-08-29 06:52 | PASS | ? |
| health-check-docker-stats | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-10 (docker stats vs ps Size) |
| health-check-socket-degrade | A | 2026-08-29 06:52 | PASS | issue #762 (refs #756) — /health-check degrades to one statement, not nine failures |
| heartbeat-logging-contract | A | 2026-08-29 06:52 | PASS | issue #447 (heartbeat log append hardening) 2026-06-18 |
| make-oh-lifecycle-parity | A | 2026-08-29 06:52 | PASS | the Makefile/oh surface-gap consolidation — two front doors onto |
| markitdown-wiki-ingest | A | 2026-08-29 06:52 | PASS | issue #649 — pinned local-document normalization contract for /wiki ingest |
| next-dev-prod | A | 2026-08-29 06:52 | SKIPPED | retro lesson 2026-06-04 |
| oh-devcontainer-restructure | A | 2026-08-29 06:52 | PASS | consolidate devcontainer — .oh/devcontainer/ folded back into .devcontainer/ |
| oh-image-only-deploy | A | 2026-08-29 06:52 | PASS | .oh/tasks/image-only-deploy/prd.json US-004 (issue #609, Flavor B image-only deploy) |
| oh-init-headless-config | A | 2026-08-29 06:52 | PASS | ? |
| oh-init-scaffold | A | 2026-08-29 06:52 | PASS | issue #531 Phase 2 |
| oh-npm-package | A | 2026-08-29 06:52 | PASS | npm publish path for the standalone `oh` CLI (@mifune/openharness) — alternative to get-oh.sh |
| oh-payload-manifest | A | 2026-08-29 06:52 | PASS | issue #531 follow-on (.oh payload manifest — oh update ships a declared allowlist) |
| oh-sandbox-image-mode | A | 2026-08-29 06:52 | PASS | conversation 2026-07-05 (basic Docker deployment — prebuilt-image mode) |
| oh-shipped-repo-overridable | A | 2026-08-29 06:52 | PASS | issue #531 follow-on (de-hardcode residual — shipped .oh shell scripts keep the upstream repo overridable) |
| oh-standalone-lifecycle | A | 2026-08-29 06:52 | PASS | issue #564 |
| oh-update | A | 2026-08-29 06:52 | PASS | issue #531 Phase 3 (oh update — upgrade only the .oh control plane) |
| operator-config-guard | A | 2026-08-29 06:52 | PASS | operator directives 2026-08-06 (.config/ and settings.local.json are operator-only) |
| pnpm-audit-ci-gate | A | 2026-08-29 06:52 | PASS | issue #171 — pnpm security audits must run in CI |
| post-bridge-publish-confirmation | A | 2026-08-29 06:52 | PASS | #523 — post-bridge live publishing requires an explicit final confirmation gate |
| prd-output-path-contract | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-19 |
| project-root-seam | A | 2026-08-29 06:52 | PASS | issue #531 Phase 1 (OH_PROJECT_ROOT project-root seam) 2026-06-26 |
| prompt-miner-schema-compat | A | 2026-08-29 06:52 | PASS | issue #253 — prompt-miner JSONL schema-drift guard |
| prompt-miner-symlink-entrypoint | A | 2026-08-29 06:52 | PASS | issue #663 — prompt-miner engine no-ops via the documented .claude/skills symlink |
| prompt-miner-weakness-record | A | 2026-08-29 06:52 | PASS | issue #580 — prompt-miner weakness-record (WH-xxx) cluster output |
| protected-path-deletion | A | 2026-08-29 06:52 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-001) — the critique gate was deleted, |
| protected-paths-resolve | A | 2026-08-29 06:52 | PASS | issue #753 — .claude/protected-paths.txt named 7 paths that did not exist. |
| registry-portability-gate | A | 2026-08-29 06:52 | PASS | issue #758 |
| registry-portability | A | 2026-08-29 06:52 | SKIPPED | issue #758 |
| retro-deterministic-contract | A | 2026-08-29 06:52 | PASS | issue #443 — /retro deterministic output and self-contained helper contract |
| rl-delegation-write-worker | A | 2026-08-29 06:52 | PASS | retro lesson 2026-06-10 (rl-delegation) #57 |
| rlm-context-budget | A | 2026-08-29 06:52 | PASS | .oh/tasks/rlm-weighted-trajectories/prd.json US-006 |
| runtime-preflight-gate | A | 2026-08-29 06:52 | PASS | issue #806 § B1 (open sandbox.substrate vs sandbox.runtime selector); |
| sandbox-boot-guard-ci | A | 2026-08-29 06:52 | PASS | issue #449 (sandbox image build CI guard) 2026-06-19; |
| skill-paths | A | 2026-08-29 06:52 | PASS | issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard; extended by issue #870 — deleted .oh/agents/advisor.md |
| skills-dir-clean | A | 2026-08-29 06:52 | PASS | conversation 2026-06-29 — Pi parses every top-level `.md` in the skills |
| skills-vendored | A | 2026-08-29 06:52 | PASS | absorb .mifune submodule into .oh — the skills/agents/hooks pack is vendored |
| slack-admin-command-surface | A | 2026-08-29 06:52 | PASS | issue #354 — Slack bridge docs must distinguish Pi /msg-bridge commands from Slack DM admin text handlers |
| spec-family-contract | A | 2026-08-29 06:52 | PASS | issue #265; spec-simplification issue #816; workflow authority issue #854 |
| spec-ready-finalization | A | 2026-08-29 06:52 | PASS | issue #134; spec-simplification issue #816; workflow authority issue #854 |
| ste-checker-contract | A | 2026-08-29 06:52 | PASS | issue #750 PR audit — the /ste checker had four fail-open paths (unclosed |
| submitted-by-trailers | A | 2026-08-29 06:52 | PASS | conversation 2026-06-12 (commit attribution trailers); the single-owner |
| sync-skill-contract | A | 2026-08-29 06:52 | PASS | issue #331 — /sync dispatcher skill (bidirectional origin↔upstream sync) |
| tool-catalog-boundary | A | 2026-08-29 06:52 | PASS | agent-browser's exclusion from the harness catalog (#821) and the |
| weigh-scorer-contract | A | 2026-08-29 06:52 | PASS | .oh/tasks/rlm-weighted-trajectories/prd.json US-003 (2026-06-27) |
| wiki-readme-index | A | 2026-08-29 06:52 | PASS | issue #132 — wiki README index drift guard |
| workflow-boundaries | A | 2026-08-29 06:52 | PASS | conversation 2026-06-19 (workflow consolidation, issue #259); authority moved to /spec in issue #854 |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
