# Blast radius — deprecating the `install` and `scripts` root symlinks

**Goal:** Remove the two git-tracked back-compat symlinks at the repo root
(`install -> .oh/install`, `scripts -> .oh/scripts`) and repoint every
**functional** consumer to the real `.oh/` path, so the harness boots, tests,
and CI all pass with the symlinks gone.

These symlinks were kept deliberately in #321 because many scattered consumers
pinned the old literals. This task completes the clean end-state: direct `.oh/`
references, symlinks removed.

## Tracked symlinks to remove (LAST, after all repoints)
- `install` (120000 → `.oh/install`)
- `scripts` (120000 → `.oh/scripts`)

Remove with `git rm install scripts` (removes the symlink entries; the real
`.oh/install` and `.oh/scripts` dirs are untouched).

## Category A — Build / test config (HARD functional)
| File | Lines | Change |
|---|---|---|
| `Makefile` | 9, 13, 53 | `scripts/docker-compose.sh` → `.oh/scripts/docker-compose.sh`; `scripts/harness-config.sh` → `.oh/scripts/harness-config.sh` |
| `vitest.config.ts` | 6 | `"scripts/__tests__/**/*.test.ts"` → `".oh/scripts/__tests__/**/*.test.ts"` |

## Category B — Devcontainer runtime (HARD functional; boot path)
| File | Lines | Change |
|---|---|---|
| `.devcontainer/entrypoint.sh` | 190, 194, 195 | banner source path `install/banner.sh` / `/home/sandbox/harness/install/banner.sh` → `.oh/install/banner.sh` |
| `.devcontainer/entrypoint.sh` | 320, 337 | `scripts/cron-runtime.ts` → `.oh/scripts/cron-runtime.ts` (the `[ -f "$HARNESS/scripts/cron-runtime.ts" ]` guard and the `node … scripts/cron-runtime.ts` launch) |
| `.devcontainer/docker-compose.yml` | 64 | healthcheck `…/harness/scripts/sandbox-healthcheck.sh` → `…/harness/.oh/scripts/sandbox-healthcheck.sh` |

NOTE: `.devcontainer/Dockerfile` already copies from `.oh/install/` — no change.
NOTE: the comment at `docker-compose.yml:14` ("`scripts/install.sh`") is prose; update for accuracy.

## Category C — CI workflows (HARD functional)
| File | Lines | Change |
|---|---|---|
| `.github/workflows/ci-harness.yml` | 126 | shellcheck glob `install/*.sh scripts/*.sh` → `.oh/install/*.sh .oh/scripts/*.sh` |
| `.github/workflows/ci-harness.yml` | 136 | `bash scripts/check-pnpm-pin.sh` → `bash .oh/scripts/check-pnpm-pin.sh` |
| `.github/workflows/ci-harness.yml` | 27, 49 (`install/**`), + any `scripts/**` | path filters: drop the legacy `install/**`/`scripts/**` filters (real files now live under `.oh/**`, which is already a trigger). Keep `.oh/**`. |
| `.github/workflows/release.yml` | 65 | `bash scripts/check-pnpm-pin.sh` → `bash .oh/scripts/check-pnpm-pin.sh` |
| `.github/workflows/release.yml` | 81 | shellcheck `install/*.sh scripts/*.sh` → `.oh/install/*.sh .oh/scripts/*.sh` |
| `.github/workflows/sandbox-boot-guard.yml` | 66, 71 | `bash scripts/docker-compose.sh config` → `bash .oh/scripts/docker-compose.sh config` |
| `.github/workflows/sandbox-boot-guard.yml` | 136 | `bash scripts/sandbox-boot-smoke.sh` → `bash .oh/scripts/sandbox-boot-smoke.sh` |
| `.github/workflows/sandbox-boot-guard.yml` | 12, 26 (`install/**`), + `scripts/...` paths | path filters: drop legacy `install/**` and the `scripts/sandbox-boot-smoke.sh`/`scripts/docker-compose.sh`/`scripts/harness-config.sh` path entries (now under `.oh/**`). Keep `.oh/**`. |

IMPORTANT: CI path-filter edits must stay consistent with the probes in Category D
(`sandbox-boot-guard-ci.sh`, `boot-lint-glob.sh`) — change both together.

## Category D — Eval probes (HARD functional; gate must stay green)
Each probe must be re-read and updated so it PASSES against the post-migration tree.
| File | What it checks | Change |
|---|---|---|
| `evals/probes/boot-lint-glob.sh` | asserts boot-lint globs cover `.devcontainer/ install/ scripts/` (lines 31, 51) | update to `.devcontainer/ .oh/install/ .oh/scripts/` to match the new shellcheck glob |
| `evals/probes/sandbox-boot-guard-ci.sh` | asserts workflow text incl. `"install/**"` filter (26), `bash scripts/docker-compose.sh` (37), `bash scripts/sandbox-boot-smoke.sh` (43) | update assertions to the new `.oh/…` paths / filters |
| other probes referencing `scripts/` | grep skills/files for `scripts/locked-append.sh` etc. | if a probe asserts a path string that this task changes (e.g. in a skill), update the probe's expected string to `.oh/scripts/...` |

Run EVERY probe after edits: `for p in evals/probes/*.sh; do bash "$p"; echo "$p -> $?"; done`
(probes self-skip when their target isn't present; a FAIL/REGRESSION must be fixed).

## Category E — Skills + crons that EXEC the root path at runtime (functional inside sandbox)
ONLY the bare root-relative / `$HARNESS` / `$ROOT` forms below. **Do NOT touch
`${CLAUDE_SKILL_DIR}/scripts/...`** — those are each skill's own `scripts/` subdir,
not the root symlink.
| File | Refs to repoint to `.oh/scripts/...` |
|---|---|
| `.mifune/skills/autopilot/SKILL.md` | `scripts/locked-append.sh` (119, 528), `scripts/ralph.sh` (multiple) — repoint exec forms; prose mentions may stay but prefer consistency |
| `.mifune/skills/autopilot/autopilot-caps.sh` | `$REPO_ROOT/scripts/cron-runtime.ts` root-find (44), `scripts/locked-append.sh` (131) → `.oh/scripts/...` |
| `.mifune/skills/context-audit/SKILL.md` | `$HARNESS/scripts/ablate.sh` (258), `scripts/locked-append.sh` (324) |
| `.mifune/skills/eval/run.sh` | `$ROOT/scripts/ablate.sh` (62) |
| `.mifune/skills/health-check/SKILL.md` | `scripts/locked-append.sh` (141) |
| `.mifune/skills/retro/SKILL.md` | `scripts/locked-append.sh` (239) — the bare form only |
| `crons/autopilot.md` | `scripts/ralph.sh` (37) |
| `crons/prompt-miner.md` | `$ROOT/scripts/locked-append.sh` (102) |

FORBIDDEN — do NOT edit: `crons/heartbeat.md` (operator-disabled), any
`.mifune/skills/wiki/corpus/**` (gitignored corpus).

## Category F — User-facing docs (functional for self-host clone path)
`bash scripts/install.sh` won't resolve after removal. Repoint to `bash .oh/scripts/install.sh`.
| File | Lines |
|---|---|
| `README.md` | 40, 48 |
| `docs/installation.md` | 25, 39, 54, 150 (`…/harness/scripts/sandbox-healthcheck.sh`) |
| `docs/quickstart.md` | 30 |

## Category G — Misc references (non-breaking; update for correctness)
| File | Note |
|---|---|
| `.claude/protected-paths.txt` | 45-46 `install/banner.sh`, `install/cloudflared-tunnel.sh` → `.oh/install/...` |
| `context/SOUL.md`, `context/TOOLS.md`, `context/REPO_MAP.md`, `AGENTS.md` | prose path mentions; update `scripts/`,`install/` → `.oh/scripts/`,`.oh/install/` where they name machinery, OR drop the now-removed symlink note. Lower priority but in scope for accuracy. |
| `.github/ISSUE_TEMPLATE/feat.md`, `skill.md` | prose area list; optional |

## DO NOT
- Do NOT rewrite CHANGELOG history entries (add one new `[Unreleased]` entry only).
- Do NOT edit `crons/heartbeat.md`, `.mifune/skills/wiki/corpus/**`, `.pi/prompts/**`.
- Do NOT touch `${CLAUDE_SKILL_DIR}/scripts/...` references.
- Do NOT remove the `.oh/` real files.

## Categories discovered DURING execution (not in the original inventory)

The original A–G inventory only caught path-literal consumers. Running `vitest`
and auditing the machinery surfaced deeper consumers that resolved root through
the symlink's *depth*, not its name:

### Category H — machinery self-location (BOOT-CRITICAL) — fixed by orchestrator
Scripts that derive repo-root as `SCRIPT_DIR/..` (one level up) only landed on
root because the `scripts/` symlink made `pwd` report the 2-level path. At the
real `.oh/scripts/` depth, `..` = `.oh/`. Fixed `..` → `../..`:
- `.oh/scripts/docker-compose.sh:8` (`REPO_DIR`)
- `.oh/scripts/sandbox-boot-smoke.sh:7` (`REPO_ROOT`) + L8 `$REPO_ROOT/scripts/docker-compose.sh` → `.oh/scripts/...` + L14 `/home/sandbox/harness/scripts/sandbox-healthcheck.sh` → `.oh/...`
- `.oh/scripts/check-pnpm-pin.sh:16` (`REPO_ROOT`)
- `.oh/scripts/ablate.sh:20` (`_ablate_root`)
- `.oh/scripts/install.sh:209` (`REPO_CANDIDATE` `../..`) + L211 `$REPO_CANDIDATE/scripts/install.sh` → `.oh/...` + L436 `$REPO_DIR/scripts/docker-compose.sh` → `.oh/...` + usage text
- `.oh/scripts/sandbox-healthcheck.sh:63` (`$HARNESS/scripts/cron-runtime.ts` → `.oh/...`)
- `.oh/scripts/maintenance/restart-openharness-tmux.sh:50,192,195` (`scripts/cron-runtime.ts`, `$HARNESS/scripts/locked-append.sh`)
NOTE: `ralph.sh` (cwd/env-based `REPO_ROOT`), `harness-config.sh` (arg/cwd), and
`cron-runtime.ts` (`CRONS_DIR` cwd-relative) need NO root-derivation fix.

### Category I — test suite (`.oh/scripts/__tests__/*.test.ts`) — US-009
16 files compute root as `../..` (assumed symlink depth) → must be `../../..`;
machinery refs `join(ROOT,"scripts",…)` → `join(ROOT,".oh","scripts",…)`; plus
content assertions updated to the new `.oh/` strings (compose-args, entrypoint,
sandbox-healthcheck) and `cron-runtime.test.ts:919` cwd-relative path.

### Category D-ext — additional eval probes — US-008
7 more probes reference `$ROOT/scripts/…` (where `$ROOT` already = true root, so
ONLY insert `.oh/`): autopilot-pi-agent, autopilot-preflight-gate,
cron-claude-codex-fallback, heartbeat-logging-contract, locked-append-critical-path,
ralph-fallback-order, repo-map-contract — plus
`.mifune/skills/prompt-miner/scripts/render-log-entry.sh:50`.

## Verification (run before commit)
1. `git grep -nE "(^|[^.a-zA-Z/])(install|scripts)/" -- ':!CHANGELOG.md' ':!*.oh*'` — review remaining root-literal refs; each should be intentional prose, not a functional path.
2. `bash -n .devcontainer/entrypoint.sh` and `bash -n` each edited `.sh`.
3. `npx vitest run` (or the repo's test cmd) — `.oh/scripts/__tests__` suite resolves.
4. `for p in evals/probes/*.sh; do bash "$p"; echo "$p -> $?"; done` — no REGRESSION.
5. `bash .oh/scripts/docker-compose.sh config --quiet` — compose still validates.
6. Confirm `ls install scripts` → "No such file" (symlinks gone).
