# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`.oh/evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| agent-browser-cli | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-07 (agent-browser 0.8.5 CLI) |
| agents-identity-contract | A | 2026-09-01 03:02 | PASS | issue #854 — T3-style root identity, glossary, and skill-owned procedures |
| architect-skill-contract | A | 2026-09-01 03:02 | PASS | ADR #929 — skills are the role primitive; /architect is a skill, not an agent |
| architecture-record-reuse | A | 2026-09-01 03:02 | PASS | ADR #929 — durable decisions reuse the existing RFC/ADR issue convention |
| artifact-contract-audit | A | 2026-09-01 03:02 | PASS | issue #583/#645 — production /audit implementation Gate 1 behavior |
| audit-dispatcher-contract | A | 2026-09-01 03:02 | PASS | issue #645 — audit consolidation public taxonomy |
| audit-implementation-behavior | A | 2026-09-01 03:02 | PASS | issue #645 — implementation root/repo/browser behavior |
| audit-pr-acquire | A | 2026-09-01 03:02 | PASS | issue #645 — production PR acquisition behavior |
| audit-pr-classifier | A | 2026-09-01 03:02 | PASS | issue #645 — deterministic focused and queue PR classifier |
| audit-run-root-contract | A | 2026-09-01 03:02 | PASS | issue #645 — executable immutable audit root/run correlation |
| audit-shellcheck-coverage | A | 2026-09-01 03:02 | PASS | issue #645 — private audit scripts require release and CI lint coverage |
| audit-slop-gate | A | 2026-09-01 03:02 | PASS | .claude/specs/images/reduce-slop.png — the four correctness gates all pass a change |
| audit-stale-references | A | 2026-09-01 03:02 | PASS | issue #645 — clean-breaking audit migration |
| boot-lint-glob | A | 2026-09-01 03:02 | PASS | issue #90, issue #120 |
| builder-no-agent-artifact | A | 2026-09-01 03:02 | PASS | ADR #929 — /builder agent is retired; a reusable role is authored as a skill |
| builder-skill-consolidation | A | 2026-09-01 03:02 | PASS | issue #643 — consolidate artifact builders behind one /builder dispatcher |
| builder-wiki-proposer | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — the skill proposer reads accumulated knowledge first |
| capability-benchmark-schema | A | 2026-09-01 03:02 | PASS | issue #167 — capability benchmark instrument |
| cc-safety-net-wiring | A | 2026-09-01 03:02 | SKIPPED | .oh/tasks/cc-safety-net/prd.json US-007 2026-07-19 |
| changelog-entry-length | A | 2026-09-01 03:02 | PASS | conversation 2026-08-24 — CHANGELOG.md grew to 259KB of bullet prose because "one line" was unquantified |
| cleanup-no-agent-session-coupling | A | 2026-09-01 03:02 | PASS | issue #928 — retire automated /spec agent handoff; |
| cleanup-tasks-scoped-guard | A | 2026-09-01 03:02 | PASS | issue #85 |
| cleanup-tasks-worktree-grooming | A | 2026-09-01 03:02 | PASS | issue #168; issue #327 |
| cli-publish-typecheck-scope | A | 2026-09-01 03:02 | PASS | release run 33271077312 — v0.5.0 pushed its GHCR image, then failed to publish |
| close-issues-on-development | A | 2026-09-01 03:02 | PASS | issue #841 (closing keywords never fire because the default branch is main) 2026-08-26 |
| codex-stale-response-retry | A | 2026-09-01 03:02 | PASS | issue #506 — Codex previous_response_not_found RCA |
| compose-config-path-parity | A | 2026-09-01 03:02 | PASS | PR #833 (remove harness.yaml — the wrapper and VS Code "Reopen in Container" paths must resolve the same service) 2026-08-26 |
| compose-env-boundary | A | 2026-09-01 03:02 | PASS | #920 — the epic #903→#911 made the CLI provision harnesses and tools from |
| config-schema-parity | A | 2026-09-01 03:02 | PASS | PR #833 (one schema file — DOCKER_SOCKET, SANDBOX_SSH, OH_SANDBOX_IMAGE, OH_PULL_POLICY, SKIP_PNPM_INSTALL were consumed but undocumented); rewritten for the oh.json/secrets split by PR #887 |
| context-tier-size-budget | A | 2026-09-01 03:02 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-007) — the always-on tier was 85,256 B |
| continual-learning-20260831 | A | 2026-09-01 03:02 | PASS | retro lesson 2026-08-31 (unexercised oracle) — a probe green in a 112-probe run carried three parser defects |
| cron-claude-codex-fallback | A | 2026-09-01 03:02 | PASS | conversation 2026-06-12 (default Codex fallback for crons) |
| cron-watchdog | A | 2026-09-01 03:02 | PASS | issues #130/#453 (cron runtime watchdog + legacy system-cron reaping) 2026-06-19 |
| crons-directory-guide | A | 2026-09-01 03:02 | PASS | issue #874 |
| curl-bash-safe-alternatives | A | 2026-09-01 03:02 | PASS | vet-run/vet integration — public curl|bash examples need review-first alternatives |
| datasets-schema | A | 2026-09-01 03:02 | PASS | issue #196 — .oh/evals/datasets verifiable trajectory corpus (Repo2RLEnv-inspired) |
| debugmcp-availability | A | 2026-09-01 03:02 | SKIPPED | issue #297 — DebugMCP MCP debug-server availability |
| default-provisioning | A | 2026-09-01 03:02 | PASS | #902 — `oh harness install` must work from inside the sandbox, where |
| delegate-model-effort-policy | A | 2026-09-01 03:02 | PASS | conversation 2026-07-11 (delegate model inheritance and thinking policy) |
| delegate-worker-boundary | A | 2026-09-01 03:02 | PASS | ADR #929 — subagents are a bounded execution primitive, not a project-role ontology; |
| devtcp-hook | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-10 (zsh /dev/tcp) |
| docker-inspect-env-guard | A | 2026-09-01 03:02 | PASS | operator directive 2026-08-08 (agents keep the docker socket, but must |
| docs-build-fast-path | A | 2026-09-01 03:02 | PASS | #455 — docs builds must stay out of fast harness/eval/release gates; #536 — docs site externalized to openharness-web; docs markdown relocated to docs/ |
| drift-check-cron-staleness-glob | A | 2026-09-01 03:02 | PASS | issue #98; issue #225 (restart-required cron frontmatter/config drift) |
| entrypoint-pnpm-manifest-fingerprint | A | 2026-09-01 03:02 | PASS | issue #521 (manifest-aware sandbox installs) 2026-07-01 |
| escalate-contract | A | 2026-09-01 03:02 | PASS | issue #799 — seven comments on a GitHub thread produced zero notifications and nobody |
| eval-ci-gate | A | 2026-09-01 03:02 | PASS | #103 — eval probe suite gated in CI |
| eval-contract-text-20260831 | A | 2026-09-01 03:02 | PASS | retro lesson 2026-08-31 (prose-literal pinning) — two assertions failed on first run purely from source line wrapping |
| eval-gate | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-11 (eval-gate) |
| eval-results-atomic | A | 2026-09-01 03:02 | PASS | issue #83 (eval-results-atomic-write) |
| eval-runner-exit | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-11 (eval-runner-exit) #29 |
| eval-runs-once-per-cycle | A | 2026-09-01 03:02 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-006) — /eval ran 3x per cycle on the |
| execution-target-contract | A | 2026-09-01 03:02 | PASS | issue #733 (ExecutionTarget contract + Docker Compose adapter) 2026-08-10 |
| get-oh-bootstrap | A | 2026-09-01 03:02 | PASS | get-oh.sh bootstrap — the Node-bootstrapping host-side path to the standalone `oh` CLI (also on npm as @mifune/openharness; see oh-npm-package.sh) |
| git-skill | A | 2026-09-01 03:02 | PASS | conversation 2026-06-15 — rules are not always supported; git workflow must be the /git skill |
| harness-audit-empty-output-gate | A | 2026-09-01 03:02 | PASS | issue #246 — /audit harness must fail closed on empty auditor outputs |
| harness-ci-core-paths | A | 2026-09-01 03:02 | PASS | #165 — core sandbox config files must trigger harness CI |
| harness-ci-hooks-paths | A | 2026-09-01 03:02 | PASS | issue #202 — credential/security hook changes must trigger harness CI |
| harness-yaml-migration | A | 2026-09-01 03:02 | PASS | PR #833 (migrate-harness-yaml.sh — append / uncomment-in-place / preserve / overwrite, plus a silent no-op second run) 2026-08-26 |
| headless-tmux-preserved | A | 2026-09-01 03:02 | PASS | issue #928 — retire automated /spec agent handoff |
| health-check-docker-stats | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-10 (docker stats vs ps Size) |
| health-check-socket-degrade | A | 2026-09-01 03:02 | PASS | issue #762 (refs #756) — /health-check degrades to one statement, not nine failures |
| heartbeat-logging-contract | A | 2026-09-01 03:02 | PASS | issue #447 (heartbeat log append hardening) 2026-06-18 |
| image-seed-hygiene | A | 2026-09-01 03:02 | PASS | issue #900 (slim the sandbox image) 2026-08-30 |
| knowledge-path-single-owner | A | 2026-09-01 03:02 | PASS | issue #926 — durable knowledge moved to .oh/knowledge/ with no compatibility alias |
| knowledge-source-freshness | A | 2026-09-01 03:02 | PASS | issue #926 — age is telemetry; a page is stale when a declared source moved |
| knowledge-tracked-query-boundary | A | 2026-09-01 03:02 | PASS | issue #926 — ignored local scratch must never be an implicit input |
| markitdown-wiki-ingest | A | 2026-09-01 03:02 | PASS | issue #649 — pinned local-document normalization contract for /wiki ingest |
| next-dev-prod | A | 2026-09-01 03:02 | SKIPPED | retro lesson 2026-06-04 |
| no-project-agent-catalog | A | 2026-09-01 03:02 | PASS | ADR #929 — .oh/agents/ is retired; provider-link and update logic must not recreate it |
| oh-compose-env-wiring | A | 2026-09-01 03:02 | PASS | issue #880 (oh as the only front door — oh.json is the non-secret config surface) |
| oh-config-surfaces | A | 2026-09-01 03:02 | PASS | PR #887 (config split across two authored surfaces — a tracked oh.json and a secrets-only root dotenv — with nothing left under $HOME) |
| oh-destroy-guard | A | 2026-09-01 03:02 | PASS | issue #879 — `oh` becomes the only front door, so `make destroy` must |
| oh-devcontainer-restructure | A | 2026-09-01 03:02 | PASS | consolidate devcontainer — .oh/devcontainer/ folded back into .devcontainer/ |
| oh-home-mount | A | 2026-09-01 03:02 | PASS | issue #898 (single $HOME mount) 2026-08-30 |
| oh-image-only-deploy | A | 2026-09-01 03:02 | PASS | .oh/tasks/image-only-deploy/prd.json US-004 (issue #609, Flavor B image-only |
| oh-init-headless-config | A | 2026-09-01 03:02 | PASS | PR #827 (installer answers landed in the losing config file); retargeted to the .example.env template by PR #833, then to oh.json by PR #887 |
| oh-init-scaffold | A | 2026-09-01 03:02 | PASS | issue #531 Phase 2 |
| oh-lifecycle-surface | A | 2026-09-01 03:02 | PASS | issue #881 — the Makefile is retired and `oh` is the only front door |
| oh-npm-package | A | 2026-09-01 03:02 | PASS | npm publish path for the standalone `oh` CLI (@mifune/openharness) — alternative to get-oh.sh |
| oh-payload-manifest | A | 2026-09-01 03:02 | PASS | issue #531 follow-on (.oh payload manifest — oh update ships a declared allowlist) |
| oh-sandbox-image-mode | A | 2026-09-01 03:02 | PASS | conversation 2026-07-05 (basic Docker deployment — prebuilt-image mode) |
| oh-shipped-repo-overridable | A | 2026-09-01 03:02 | PASS | issue #531 follow-on (de-hardcode residual — shipped .oh shell scripts keep the upstream repo overridable) |
| oh-standalone-lifecycle | A | 2026-09-01 03:02 | PASS | issue #564 |
| oh-update | A | 2026-09-01 03:02 | PASS | issue #531 Phase 3 (oh update — upgrade only the .oh control plane) |
| operator-config-guard | A | 2026-09-01 03:02 | PASS | operator directives 2026-08-06 (.config/ and settings.local.json are operator-only) |
| pnpm-audit-ci-gate | A | 2026-09-01 03:02 | PASS | issue #171 — pnpm security audits must run in CI |
| post-bridge-publish-confirmation | A | 2026-09-01 03:02 | PASS | #523 — post-bridge live publishing requires an explicit final confirmation gate |
| prd-output-path-contract | A | 2026-09-01 03:02 | PASS | retro lesson 2026-06-19 |
| prompt-miner-schema-compat | A | 2026-09-01 03:02 | PASS | issue #253 — prompt-miner JSONL schema-drift guard |
| prompt-miner-symlink-entrypoint | A | 2026-09-01 03:02 | PASS | issue #663 — prompt-miner engine no-ops via the documented .claude/skills symlink |
| prompt-miner-weakness-record | A | 2026-09-01 03:02 | PASS | issue #580 — prompt-miner weakness-record (WH-xxx) cluster output |
| protected-path-deletion | A | 2026-09-01 03:02 | PASS | .oh/tasks/spec-simplification/ (issue #816, US-001) — the critique gate was deleted, |
| protected-paths-resolve | A | 2026-09-01 03:02 | PASS | issue #753 — .claude/protected-paths.txt named 7 paths that did not exist. |
| registry-portability-gate | A | 2026-09-01 03:02 | PASS | issue #758 |
| registry-portability | A | 2026-09-01 03:02 | SKIPPED | issue #758 |
| retired-memory-vocabulary | A | 2026-09-01 03:02 | PASS | issue #926 — .oh/README.md and .gitignore still described a deleted subsystem |
| retro-deterministic-contract | A | 2026-09-01 03:02 | PASS | issue #443 — /retro deterministic output and self-contained helper contract |
| rlm-context-budget | A | 2026-09-01 03:02 | PASS | .oh/tasks/rlm-weighted-trajectories/prd.json US-006 |
| roles-are-skills | A | 2026-09-01 03:02 | PASS | ADR #929 — roles are behavior, skills encode behavior, agents execute behavior |
| runtime-preflight-gate | A | 2026-09-01 03:02 | PASS | issue #806 § B1 (open sandbox.substrate vs sandbox.runtime selector); |
| sandbox-boot-guard-ci | A | 2026-09-01 03:02 | PASS | issue #449 (sandbox image build CI guard) 2026-06-19; |
| sandbox-node-base | A | 2026-09-01 03:02 | PASS | openharness#878 — oh as the only front door, T0 sandbox base image |
| skill-paths | A | 2026-09-01 03:02 | PASS | issue #43 — stale path references; extended by issue #69 — apps/->packages/ rename guard; extended by issue #870 — deleted .oh/agents/advisor.md |
| skills-dir-clean | A | 2026-09-01 03:02 | PASS | conversation 2026-06-29 — Pi parses every top-level `.md` in the skills |
| skills-task-tool-coupling | A | 2026-09-01 03:02 | PASS | council review 2026-08-29 (issue #886) — /delegate instructed Claude-Code-only |
| skills-vendored | A | 2026-09-01 03:02 | PASS | absorb .mifune submodule into .oh — the skills/hooks pack is vendored |
| slack-admin-command-surface | A | 2026-09-01 03:02 | PASS | issue #354 — Slack bridge docs must distinguish Pi /msg-bridge commands from Slack DM admin text handlers |
| spec-execute-knowledge-impact | A | 2026-09-01 03:02 | PASS | issue #926 — the planner predicts, the diff decides |
| spec-execute-running-contract | A | 2026-09-01 03:02 | PASS | issue #926 — execute returned before the build finished while promising a ready PR; |
| spec-family-contract | A | 2026-09-01 03:02 | PASS | issue #265; spec-simplification issue #816; workflow authority issue #854; |
| spec-no-advisor-session-coupling | A | 2026-09-01 03:02 | PASS | issue #928 — retire automated /spec agent handoff |
| spec-no-agent-handoff | A | 2026-09-01 03:02 | PASS | issue #928 — retire automated /spec agent handoff |
| spec-no-generated-prompt-contract | A | 2026-09-01 03:02 | PASS | issue #926 — a persisted copy of a template drifts from the template |
| spec-plan-knowledge-context | A | 2026-09-01 03:02 | PASS | issue #926 — /spec wrote knowledge more reliably than it read it |
| spec-plan-reconciliation-gate | A | 2026-09-01 03:02 | PASS | issue #926 — an approved plan may not become a materially different PRD silently |
| spec-ready-finalization | A | 2026-09-01 03:02 | PASS | issue #134; spec-simplification issue #816; workflow authority issue #854 |
| spec-single-owner | A | 2026-09-01 03:02 | PASS | conversation 2026-06-19 (single-owner implementation workflow, issue #257); |
| ste-checker-contract | A | 2026-09-01 03:02 | PASS | issue #750 PR audit — the /ste checker had four fail-open paths (unclosed |
| submitted-by-trailers | A | 2026-09-01 03:02 | PASS | conversation 2026-06-12 (commit attribution trailers); the single-owner |
| sync-skill-contract | A | 2026-09-01 03:02 | PASS | issue #331 — /sync dispatcher skill (bidirectional origin↔upstream sync) |
| t3-headless-launch | A | 2026-09-01 03:02 | PASS | issue #858 — /t3 launched a bare `npx --yes t3`, which is the local GUI and |
| tailscale-tool-boundary | A | 2026-09-01 03:02 | PASS | issue #858 — Tailscale mobile access for T3 Code. There is no tailnet, no |
| task-completion-structured-state | A | 2026-09-01 03:02 | PASS | issue #926 — a prose sentinel duplicated structured task-graph state |
| tool-catalog-boundary | A | 2026-09-01 03:02 | PASS | agent-browser's exclusion from the harness catalog (#821), the three-catalog |
| version-parity | A | 2026-09-01 03:02 | PASS | conversation 2026-08-29 — the oh CLI became the only lifecycle door, so its |
| weigh-scorer-contract | A | 2026-09-01 03:02 | PASS | .oh/tasks/rlm-weighted-trajectories/prd.json US-003 (2026-06-27) |
| wiki-compile-contract | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — Wiki Maintainer role added as /wiki compile |
| wiki-kind-schema-contract | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 (pattern layer); issue #926 (repo|external|pattern kinds) |
| wiki-pattern-persistence | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — pattern pages are never rolled back |
| wiki-query-pattern-isolation | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — proposer-only pattern access |
| wiki-readme-index | A | 2026-09-01 03:02 | PASS | issue #132 — knowledge README index drift guard |
| wiki-related-slugs | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — wiki lint link checks |
| wiki-skill-impact-append-only | A | 2026-09-01 03:02 | PASS | wikiskill arXiv:2608.27454 — skill-change ledger, never rolled back |
| workflow-boundaries | A | 2026-09-01 03:02 | PASS | conversation 2026-06-19 (workflow consolidation, issue #259); authority moved to /spec in issue #854 |
| worktrees-layout | A | 2026-09-01 03:02 | PASS | issue #872 |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
