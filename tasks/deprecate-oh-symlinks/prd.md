# PRD: Deprecate Root Symlinks `install` and `scripts`

## Summary

When issue #321 moved the harness install and scripts trees under `.oh/`, two git-tracked back-compat symlinks were kept at the repo root (`install -> .oh/install`, `scripts -> .oh/scripts`) to avoid immediately breaking every scattered consumer. Those symlinks have served their transitional purpose and now carry maintenance cost: they mask stale path references in CI, eval probes, skills, and docs, and they create a misleading dual-path surface that confuses new contributors. This task completes the migration by repointing every functional consumer directly to the canonical `.oh/` paths and then removing the symlinks with `git rm`, leaving the real `.oh/install/` and `.oh/scripts/` directories untouched.

The authoritative consumer inventory is `tasks/deprecate-oh-symlinks/blast-radius.md` (Categories A–G + FORBIDDEN list + verification steps). Workers MUST read it first.

## Goals

- Remove both git-tracked symlinks (`install`, `scripts`) from the repo root permanently.
- Repoint every functional consumer — build config, devcontainer boot, CI workflows, eval probes, skills, crons, and user-facing docs — to the real `.oh/` paths before the symlinks are removed.
- Keep `vitest` green, all `evals/probes/*.sh` non-REGRESSION, CI passing, and `bash .oh/scripts/docker-compose.sh config --quiet` valid throughout.

## Non-Goals

- Rewriting or removing CHANGELOG history entries; only a new `[Unreleased]` entry is added.
- Editing `crons/heartbeat.md` (operator-disabled; forbidden).
- Editing any file under `.mifune/skills/wiki/corpus/**` (gitignored corpus; forbidden).
- Editing any file under `.pi/prompts/**` (forbidden).
- Touching `${CLAUDE_SKILL_DIR}/scripts/...` references — those are each skill's own local `scripts/` subdirectory, not the root symlink.
- Removing or restructuring the real `.oh/install/` or `.oh/scripts/` directories.

## Functional Requirements

**FR-A — Build and test config:** `Makefile` `COMPOSE` (L9), `SANDBOX_NAME_YAML` invocation (L13), `config` target body (L53) reference `.oh/scripts/docker-compose.sh` / `.oh/scripts/harness-config.sh`. `vitest.config.ts` include (L6) → `".oh/scripts/__tests__/**/*.test.ts"`. `npx vitest run` passes.

**FR-B — Devcontainer runtime boot path:** `.devcontainer/entrypoint.sh` banner comment (L190), `grep -q` pattern (L194), echo heredoc (L195) → `.oh/install/banner.sh`; cron-runtime guard (L320) + tmux launch (L337) → `.oh/scripts/cron-runtime.ts`. `.devcontainer/docker-compose.yml` healthcheck CMD (L64) → `…/harness/.oh/scripts/sandbox-healthcheck.sh`; comment (L14) updated. All edited shell passes `bash -n`.

**FR-C — CI workflows:** `ci-harness.yml` shellcheck glob (L126) + pnpm-pin (L136) → `.oh/...`; drop legacy `"install/**"`/`"scripts/**"` filters (L27, L49). `release.yml` pnpm-pin (L65) + shellcheck (L81) → `.oh/...`. `sandbox-boot-guard.yml` compose calls (L66, L71) + boot-smoke (L136) → `.oh/scripts/...`; path filters (L12–17, L26–31) repointed to `.oh/scripts/...`/`.oh/install/...`.

**FR-D — Eval probes (atomic with FR-C):** `boot-lint-glob.sh` dir list (L31) + PASS msg (L51) → `.devcontainer/ .oh/install/ .oh/scripts/`. `sandbox-boot-guard-ci.sh` assertions (L26, L37, L43) → new `.oh/...` strings/filters. Every `evals/probes/*.sh` returns non-REGRESSION.

**FR-E — Skills/crons exec'ing root paths:** Repoint bare `scripts/...`, `$HARNESS/scripts/...`, `$REPO_ROOT/scripts/...`, `$ROOT/scripts/...` exec/source forms to `.oh/scripts/...` in: `.mifune/skills/autopilot/SKILL.md`, `autopilot-caps.sh`, `context-audit/SKILL.md`, `eval/run.sh`, `health-check/SKILL.md`, `retro/SKILL.md`, `crons/autopilot.md`, `crons/prompt-miner.md`. NOT `${CLAUDE_SKILL_DIR}/scripts/...`. NOT `crons/heartbeat.md`.

**FR-F — User-facing docs:** `README.md` (L40, L48), `docs/installation.md` (L25, L39, L54, L150), `docs/quickstart.md` (L30): `bash scripts/install.sh` → `bash .oh/scripts/install.sh`; `harness/scripts/sandbox-healthcheck.sh` → `.oh/scripts/...`.

**FR-G — Misc references:** `.claude/protected-paths.txt` (L45–46) → `.oh/install/...`. Prose machinery-path mentions in `context/SOUL.md`, `context/TOOLS.md`, `context/REPO_MAP.md`, `AGENTS.md` → `.oh/...` (or drop removed-symlink note). Issue templates area lists optional.

## User Stories / Tasks

Tasks T-A..T-G run as a PARALLEL wave (non-overlapping file ownership). T-REMOVE is SERIAL and depends on all of them.

### T-A: Repoint build and test config
**Owns:** `Makefile`, `vitest.config.ts`
**Work:** Makefile L9/L13/L53 → `.oh/scripts/docker-compose.sh` / `.oh/scripts/harness-config.sh`; vitest.config.ts L6 → `.oh/scripts/__tests__/...`.
**AC:** `grep -n 'scripts/' Makefile` shows only `.oh/scripts/`; `grep -n '"scripts/' vitest.config.ts` empty; `npx vitest run` exits 0.
**Depends on:** none

### T-B: Repoint devcontainer runtime boot path
**Owns:** `.devcontainer/entrypoint.sh`, `.devcontainer/docker-compose.yml`
**Work:** entrypoint L190/L194/L195 → `.oh/install/banner.sh`; L320/L337 → `.oh/scripts/cron-runtime.ts`; compose L64 → `.oh/scripts/sandbox-healthcheck.sh`; L14 comment.
**AC:** `bash -n .devcontainer/entrypoint.sh` exits 0; `grep -n 'harness/scripts/\|harness/install/' .devcontainer/entrypoint.sh` empty; `grep -n '/home/sandbox/harness/scripts/' .devcontainer/docker-compose.yml` empty.
**Depends on:** none

### T-CD: Repoint CI workflows + update eval probes atomically
**Owns:** `.github/workflows/ci-harness.yml`, `.github/workflows/release.yml`, `.github/workflows/sandbox-boot-guard.yml`, `evals/probes/boot-lint-glob.sh`, `evals/probes/sandbox-boot-guard-ci.sh`
**Work:** Per FR-C then FR-D — update workflow strings/filters first, then make the two probes assert the new strings. Re-read each workflow to confirm exact filter lines before editing.
**AC:** `grep -n '"install/\*\*"' .github/workflows/ci-harness.yml .github/workflows/sandbox-boot-guard.yml` empty; `grep -n 'bash scripts/' .github/workflows/*.yml` empty; `bash evals/probes/boot-lint-glob.sh` and `bash evals/probes/sandbox-boot-guard-ci.sh` exit 0; full probe sweep no REGRESSION.
**Depends on:** none

### T-E: Repoint skills and crons that exec root paths
**Owns:** `.mifune/skills/autopilot/SKILL.md`, `.mifune/skills/autopilot/autopilot-caps.sh`, `.mifune/skills/context-audit/SKILL.md`, `.mifune/skills/eval/run.sh`, `.mifune/skills/health-check/SKILL.md`, `.mifune/skills/retro/SKILL.md`, `crons/autopilot.md`, `crons/prompt-miner.md`
**Work:** Per FR-E. Leave `${CLAUDE_SKILL_DIR}/scripts/...` untouched. Leave `crons/heartbeat.md` untouched.
**AC:** exec/source forms of `scripts/...` gone (only `.oh/scripts/...` or intentional prose remain); `bash -n .mifune/skills/autopilot/autopilot-caps.sh` and `bash -n .mifune/skills/eval/run.sh` exit 0; `git diff --quiet crons/heartbeat.md` (unmodified).
**Depends on:** none

### T-F: Repoint user-facing docs
**Owns:** `README.md`, `docs/installation.md`, `docs/quickstart.md`
**Work:** Per FR-F.
**AC:** `grep -n 'bash scripts/' README.md docs/installation.md docs/quickstart.md` empty; `grep -n 'harness/scripts/' docs/installation.md` empty.
**Depends on:** none

### T-G: Update misc references
**Owns:** `.claude/protected-paths.txt`, `context/SOUL.md`, `context/TOOLS.md`, `context/REPO_MAP.md`, `AGENTS.md`, `.github/ISSUE_TEMPLATE/feat.md`, `.github/ISSUE_TEMPLATE/skill.md`
**Work:** Per FR-G.
**AC:** `grep -n '^install/' .claude/protected-paths.txt` empty; machinery-path mentions in the context files/AGENTS.md are `.oh/`-prefixed; no files outside owned list modified.
**Depends on:** none

### T-REMOVE: Symlink removal, CHANGELOG entry, final verification
**SERIAL — starts only after T-A..T-G complete.**
**Owns:** `install` (symlink, removed), `scripts` (symlink, removed), `CHANGELOG.md` (new `[Unreleased]` entry only)
**Work:** Run full verification; add CHANGELOG `[Unreleased]` entry; `git rm install scripts`; confirm `ls install scripts` errors; re-run verification with symlinks absent.
**AC:** all Global ACs pass; `git status` shows `install`/`scripts` deleted; exactly one new CHANGELOG entry, no history altered.
**Depends on:** T-A, T-B, T-CD, T-E, T-F, T-G

## Global Acceptance Criteria
1. `ls install scripts` exits non-zero (both gone).
2. `npx vitest run` exits 0.
3. `for p in evals/probes/*.sh; do bash "$p"; echo "$p -> $?"; done` — no exit 1 (REGRESSION/FAIL).
4. `bash .oh/scripts/docker-compose.sh config --quiet` exits 0.
5. `bash -n .devcontainer/entrypoint.sh` and each edited `.sh` exit 0.
6. `git grep -nE "(^|[^.a-zA-Z/])(install|scripts)/" -- ':!CHANGELOG.md' ':!*.md'` — every match is `.oh/`-prefixed or intentional non-path prose (`node_modules`, `npm install`, `apt-get install`), not a functional bare path.

## Risk / Rollback
- **Boot regression:** entrypoint/compose are on the live boot path → wrong path fails healthcheck. Mitigation: `bash -n` + sandbox-boot-guard CI.
- **CI trigger gap:** trimming filters before files move could drop triggers. Mitigation: `.oh/**` already present; only redundant legacy filters removed.
- **Probe false-pass:** updating probe before workflow → green probe, broken workflow. Mitigation: T-CD owns both, workflow-first.
- **Rollback:** symlinks are tracked objects; `git revert` the removal commit restores them instantly. Each repoint task is independently revertible.
- **Skill exec risk:** bare `scripts/...` in skills fails silently at runtime (not CI-caught). Mitigation: T-E + post-merge `git grep` sweep.
