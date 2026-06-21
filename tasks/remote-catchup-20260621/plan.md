# Remote Catch-Up — Verified Asymmetric-Commit Report (2026-06-21)

> Spec-plan artifact for the bidirectional `upstream` ⇄ `origin` reconciliation.
> Canonical workflow: `select → spec-plan ⇄ spec-critique → spec-execute → human merge`.

## Topology

| Remote | Repo | Role |
|---|---|---|
| `upstream` | `mifunedev/openharness` | PUBLIC CANONICAL |
| `origin` | `ryaneggz/openharness` | PRIVATE / ACTIVE FORK |

- Branch under comparison: `development` (both sides).
- Merge-base: `9cce12e` "feat: add pi autoresearch package support" (2026-06-17).
- Divergence at analysis time: origin ahead by 25, upstream ahead by 92.
- Scope: commits dated **since 2026-06-19** (the "last 2 days" window).

## Methodology

`git cherry`/patch-id is **unreliable** across this fork boundary: origin re-squashes
sanitized content, so logically-equivalent changes show distinct patch-ids (every commit
came back `+` in both directions — zero false negatives, many false positives). Equivalence
was therefore established by a **title-grep + content-presence oracle** on each branch
(`git log --grep`, `git cat-file -e <ref>:<path>`), run as top-level commands (the zsh
git-in-loop trap silently reports false "ABSENT" for every item). Two independent read-only
classification agents (one per direction) produced the verdicts below.

Decisive structural fact: origin's `#255`/`#256` (`task/sync-upstream-2026061{8,9}`) already
pulled all **pre-06-19** upstream content into origin. So upstream commits older than 06-19
are ALREADY-PRESENT in origin despite patch-id divergence.

---

## Direction A — origin → upstream (commits the PUBLIC canonical needs)

### PORTABLE (ship in the upstream catch-up PR)

| Order | SHA | Title | Adaptation |
|---|---|---|---|
| 1 | `cda11e3` | #260 workflow-consolidation — `AGENTS.md § The Workflow` + `workflow-boundaries.sh` probe | foundation; must precede 2–3 |
| 2 | `7b1f99d` | #266 split `/ship-spec` into the spec-* family (4 skills + `spec-family-contract.sh`) | depends on #1 |
| 3 | `a1686d3` | #271 complete removal of `/orchestrate` + `context/rules/loop.md` | depends on #2 (spec-* is the replacement) |
| 4 | `0cc5c06` | #258 codify advisor-monitored ralph loop variant + tier-A probe | clean |
| 5 | `0a08570` | #268 clarify oh.mifune.dev copy (harness=repo, agent=CLI) | docs only |
| 6 | `229230c` | #272 fold eval-weekly + cleanup-tasks crons into a date-gated heartbeat | adapt TZ gate `America/Denver`→`America/Los_Angeles` (upstream default) |
| 7 | `4bbbccd` | #290 preserve pi-messenger-bridge runtime trust grants across reboots | **fixes a LIVE upstream bug** — upstream `entrypoint.sh` still `cp`-clobbers `~/.pi/msg-bridge.json` every boot |

### PORTABLE-but-DEFERRED (documented; not in this PR)

| SHA | Title | Why deferred |
|---|---|---|
| `bafe2fb` + `f55c2e4` | prompt-miner skill/engine/cron (#254/#277) | skill is public-safe, but the cron is origin-scoped (`repo: ryaneggz/openharness`, "never upstream"); needs a focused port that neutralizes the cron. Known `mine-traces.mjs` symlink-guard bug ([[prompt-miner-engine-symlink-guard-bug]]) should be fixed in the same follow-up. |
| `6a61bbc`,`021e032`,`5a173fc`,`8974f3a`,`15a0743` | pi-fff integration (#261) | public-safe Pi package, but an optional integration unit better shipped as its own focused PR (5-surface Pi-package pattern). |
| `edef961` | #286 relocate shared skill source to `.mifune/skills` | large repo-wide structural refactor that **changes the very layout** the spec-* ports land in; both critics flag bundling as unsafe → separate structural PR. |
| `be271ba` | bypass path-guard prompts in pi tui | weakens a protective bash-confirm guard in TUI mode; needs maintainer **security review**, not an unattended catch-up. |

### SKIP

| Category | SHAs |
|---|---|
| SYNC-SKIP (content originated upstream) | `6b2c56a` #255, `356ebe5` #256 |
| EQUIVALENT-SKIP (already settled in upstream) | `658f3e2` #270 (session-name reverted; superseded by #482 `client-slack`), `e797b91` #276 (cron filePath fix already present upstream ≈ #473), `8449cc9` #288 (origin-side port of upstream #482) |
| INSTANCE-SKIP (private/host-specific) | `b9bad8e` #252 (private memory + origin-only "never upstream" policy), `db3367b` #274 (one-shot dated tmux-restart for this host), `c02d000` (personal pi thinking=xhigh) |

---

## Direction B — upstream → origin (commits the FORK needs)

### PORTABLE (ship in the origin catch-up PR)

| Order | SHA | Title | Adaptation |
|---|---|---|---|
| 1 | `c4f4920` | feat: add repo context map | adapt AGENTS.md wording (`.claude/.pi` mirror → origin's `.mifune` source) |
| 2 | `8505db3` | #467 cover live cron worktree pruning | test-only; passes against origin's impl |
| 3 | `08c87ce` | scaffold sandbox boot health task | cluster scaffold (artifacts) |
| 4 | `dba7f01` | exercise sandbox boot health (smoke script + workflow step) | cluster; depends on #3 |
| 5 | `b6d56a2` | guard sandbox boot smoke workflow (yml path filters + probe) | cluster; depends on #4 |
| 6 | `77ee23d` | #490 validate autopilot cap config | clean (script + test) |
| 7 | `8f824cb` | #484 align prd output path contract | adapt skill path `.claude`→`.mifune` |
| 8 | `e870bb4` | #477 lock memory log appends | adapt skill paths `.claude`→`.mifune` |
| 9 | `69b9608` | #471 keep compose dry-runs non-mutating | clean (`scripts/docker-compose.sh`) |
| 10 | `0d11195` | #469 dedupe merged autopilot refs (queue-check phase) | adapt skill+probe path `.claude`→`.mifune` |
| 11 | `5497b80` | #475 lock cron liveness appends | **runtime slice only** — drop the `crons/cleanup-tasks.md`+`crons/eval-weekly.md` hunks (origin lacks both crons) |
| 12 | `751f7ed` | #479 preserve dirty stale worktrees | retarget the cron-body change + probe to `crons/heartbeat.md` (origin folded the sweep there) |

### SKIP

| Category | SHAs |
|---|---|
| ALREADY-PRESENT (in origin via sync or own port) | `5d85204` (cron reload file paths ≈ origin e797b91/#275), `97bd8d1` (bridge — origin ported via #288/#290), `ccafbea` (Slack tokens out of tmux argv — origin's bridge entrypoint already uses the mode-600 runtime-env-file pattern) |
| INSTANCE-ARTIFACT-SKIP | `5f2c8ad` (refresh evals benchmark — RESULTS.md churn; origin regenerates its own via `/eval`) |

### Key adaptation gotchas (Direction B)
- **`.claude`→`.mifune` path relocation** (origin #284/#286): `.claude/skills/` is a *symlink* in origin; cherry-picks editing `.claude/skills/<name>/SKILL.md` collide with the symlink and must be retargeted to `.mifune/skills/<name>/SKILL.md`. Affects `8f824cb`, `e870bb4`, `0d11195`.
- **Cron-layout divergence** (origin #278): origin removed `crons/cleanup-tasks.md` + `crons/eval-weekly.md`. `5497b80`'s cron-body hunks are dropped; `751f7ed`'s cron change retargets to `crons/heartbeat.md`.
- **Sandbox-boot-health cluster** (`08c87ce`→`dba7f01`→`b6d56a2`) ports as an ordered unit; the cluster's RESULTS.md refresh (`5f2c8ad`) is skipped in favor of a local regen.

---

## Verification plan
- `git range-diff` each catch-up branch vs. its source commit range.
- `git cherry`/`git log --grep` re-check after build.
- Run the eval probe suite (`evals/probes/*.sh` via `evals/run.sh`) in each worktree where probes were touched.
- `gh pr view` + `gh pr checks` after push.
- **No auto-merge** — both PRs stop at the human merge gate.
