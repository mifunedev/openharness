# Critique + Approval — Remote Catch-Up (2026-06-21)

Two adversarial critics (implementer-lens + risk/maintainer-lens) reviewed `plan.md`
before any branch construction. Both returned `VERDICT: proceed with mitigations`; the
risk critic named three HIGH blockers that must be resolved before anything reaches the
public upstream. Synthesis below; **scope was reduced to the clean/low-risk set** and the
surgery-heavy commits deferred to documented phase-2 follow-ups.

## HIGH findings → resolution

| # | Finding (critic) | Resolution |
|---|---|---|
| H1 | CHANGELOG entries in every Direction-A commit link to PRIVATE `ryaneggz/openharness/issues/<N>` — dead links + fork-name leak in the public repo (risk) | **Sanitize**: author fresh `[Unreleased]` entries from the upstream perspective; bare `(#NN)` or upstream issue refs only. No `ryaneggz` links. (memory `fork-public-sync-reconciliation`.) |
| H2 | `a1686d3` (remove /orchestrate) leaves upstream `benchmark/SKILL.md` with 11 dangling `loop.md` refs; needs `protected-paths.txt` + 4-probe + benchmark cleanup (risk) | **DEFER** `a1686d3` to a focused upstream teardown PR. Shipping the spec-* *addition* (cda11e3+7b1f99d) without the removal is safe — loop.md still exists, so no dangling refs. |
| H3 | `229230c` (fold weekly crons) — upstream's `eval-weekly.md`=Denver, `cleanup-tasks.md`=LA (different TZs); needs 2-file delete + `protected-paths.txt` edit + multi-surface TZ rewrite (both) | **DEFER** `229230c` to a focused upstream cron-consolidation PR; too semantically tricky for an unattended catch-up on the public repo. |
| H4 | Direction-B: origin `.claude/skills` is a symlink; cherry-picks editing `.claude/skills/*` (`0d11195`,`8f824cb`,`e870bb4`) collide (impl) | Use `git cherry-pick -n`, then retarget edits to `.mifune/skills/<name>/SKILL.md` and `git add` the correct path before committing. |
| H5 | Direction-B: `751f7ed` probe regresses unless `crons/heartbeat.md` `rm -rf "$path"`→`rmdir`/preservation-gate is hand-edited; probe context also expects upstream's `cleanup-tasks.md` (impl, BLOCK) | **DEFER** `751f7ed` to a focused origin PR with the manual heartbeat.md preservation-gate rewrite. |
| H6 | Direction-B: 4 commits carry a wholesale `evals/RESULTS.md` regen → conflict on each (impl/risk) | Hand-insert ONLY the new probe row per commit; discard the regen (memory `eval-results-new-probe-row`). |

## MED/LOW findings carried into execution
- CHANGELOG/`wiki/README.md` union conflicts on each Direction-B pick → resolve per memory `shared-append-file-rebase-conflicts` (regen README via the probe's logic; union CHANGELOG).
- `c4f4920` `context/REPO_MAP.md` + `AGENTS.md` carry `.claude/.pi` path refs → retarget to `.mifune/` after pick.
- `cda11e3` carries origin-scoped `tasks/workflow-consolidation/` scaffold (`branchName: feat/259-…`) → drop the task scaffold from the upstream pick; keep AGENTS.md + probe.
- `7b1f99d` adds `.claude/protected-paths.txt` spec-* entries → verify context applies on upstream.
- `4bbbccd` adds `.devcontainer/seed-msg-bridge.sh` → run `shellcheck` before the upstream push (boot-lint CI).
- `e797b91`≈`5d85204` not byte-identical (origin's fix is broader) but SKIP verdict stands.
- GitHub issue-first (`git.md`): create a tracking issue in each target repo before cutting the branch.
- Work in clean isolated worktrees (main checkout is dirty: `crons/autopilot.md`, `evals/RESULTS.md`).
- Run the eval suite in the TARGET worktree before undrafting each PR.

## APPROVED SCOPE

**Direction A — origin → upstream PR** (clean/high-value/self-contained):
`cda11e3` → `7b1f99d` (spec-* workflow addition) · `0cc5c06` (advisor-monitored loop) · `0a08570` (docs clarify) · `4bbbccd` (trust-grants live bugfix).
Deferred (documented): `a1686d3`, `229230c`, prompt-miner, pi-fff, `edef961`, `be271ba`.

**Direction B — upstream → origin PR** (clean + manageable adaptation):
`77ee23d` (cap config) · `69b9608` (compose dry-run) · `8505db3` (worktree-pruning test) · `c4f4920` (repo context map, adapt paths) · `8f824cb` (prd path, retarget) · `e870bb4` (memory-log lock, retarget) · `0d11195` (autopilot dedupe, retarget) · `5497b80` (cron-liveness lock, runtime slice only). Sandbox-boot-health cluster (`08c87ce`/`dba7f01`/`b6d56a2`) included if it applies cleanly during build.
Deferred (documented): `751f7ed`, `5f2c8ad` (skip), ALREADY-PRESENT set.

## GATE

**VERDICT: APPROVED** — proceed to spec-execute with H1–H6 mitigations enforced and the surgery-heavy commits deferred to documented phase-2 follow-ups. No auto-merge; both PRs stop at the human merge gate.
