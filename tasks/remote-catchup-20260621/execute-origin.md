# Execution Summary — Direction B (upstream → origin)

Branch: `task/291-catchup-from-upstream` (off `origin/development`) · Target: `ryaneggz/openharness:development` · Issue: ryaneggz #291.

## Commits cherry-picked (`-x` provenance preserved)

| # | Source SHA (upstream) | Change | Adaptation |
|---|---|---|---|
| 1 | `77ee23d` | validate autopilot cap config (#490) | clean |
| 2 | `69b9608` | keep compose dry-runs non-mutating (#471) | CHANGELOG/wiki-README `--ours`; `wiki/compose-wrapper.md` added |
| 3 | `8505db3` | cover live cron worktree pruning (#467) | test-only; RESULTS `--ours` |
| 4 | `8f824cb` | align prd output path contract (#484) | edited `.mifune/skills/prd/SKILL.md` — git applied the patch **through** origin's `.claude/skills`→`.mifune/skills` symlink automatically |
| 5 | `e870bb4` | lock memory log appends (#477) | applied to `.mifune/skills/{context-audit,health-check}/SKILL.md` via the symlink |
| 6 | `0d11195` | dedupe merged autopilot refs (#469) | applied to `.mifune/skills/autopilot/SKILL.md`; `wiki/autopilot.md` added |
| 7 | `08c87ce` | scaffold sandbox boot health task | clean (task artifacts) |
| 8 | `dba7f01` | exercise sandbox boot health (smoke script + workflow step) | clean |
| 9 | `b6d56a2` | guard sandbox boot smoke workflow (yml + probe) | clean |

Plus one finalization commit: `evals/RESULTS.md` 3 new probe rows (hand-inserted), `wiki/README.md` 2 new entry rows (regenerated to match frontmatter), CHANGELOG `[Unreleased]` entries, spec-evidence artifacts.

## Key finding (refutes a critique prediction)
- The critique predicted `.claude/skills/*` cherry-picks would hard-fail on origin's symlink. In practice **git applied each patch through the symlink** and staged the real `.mifune/skills/*` file directly — no manual retarget needed. Verified the index contains only the symlink blob (mode 120000), no shadowing regular file.

## Mitigations applied (from `critique.md`)
- **H6** RESULTS.md: reverted full-regen churn, hand-inserted only the 3 new probe rows (`prd-output-path-contract`, `memory-log-locked-append`, `autopilot-merged-pr-reference-dedupe`).
- wiki/README.md regenerated to add `compose-wrapper` + `autopilot` rows (the `wiki-readme-index` drift guard is green).

## Deferred (documented; NOT in this PR)
- `751f7ed` preserve dirty stale worktrees — its probe + cron-body change assume upstream's separate `crons/cleanup-tasks.md`; origin folded the sweep into `crons/heartbeat.md`, so the probe needs retargeting + a manual `rm -rf`→preservation-gate rewrite of `heartbeat.md` → focused cron-layout follow-up.
- `5497b80` lock cron liveness appends — same cron-layout entanglement: its modified `locked-append-critical-path.sh` probe hardcodes the two crons origin removed → would regress origin's eval suite. Runtime slice deferred to the same follow-up.
- `c4f4920` repo context map — 909-line feature entangled with origin's divergent capability suite (CB-002 retarget vs CB-004) + AGENTS.md git-section divergence + `.claude/.pi`→`.mifune` REPO_MAP rewrites → its own focused PR.

## Skipped (ALREADY-PRESENT / instance)
- `5d85204` (cron reload file paths ≈ origin #275), `97bd8d1` (bridge — origin ported #288/#290), `ccafbea` (Slack tokens out of argv — origin's bridge entrypoint already uses the mode-600 runtime-env pattern), `5f2c8ad` (eval benchmark refresh — origin regenerates its own).

## Verification
- All 3 new probes pass on origin; the modified `autopilot-open-pr-reference-dedupe` + `sandbox-boot-guard-ci` probes pass.
- Full suite: `bash .claude/skills/eval/run.sh` → aggregate exit 0, 0 regressions; `wiki-readme-index` green.
- No auto-merge — stops at human merge gate.
