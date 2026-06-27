# Ralph iteration — oh-devcontainer-restructure

You are one iteration of a Ralph loop implementing the `oh-devcontainer-restructure` task
(RFC #531 Phase 2 slice 2 — relocate the harness build assets to `.oh/devcontainer/`). The
full plan is `tasks/oh-devcontainer-restructure/prd.md`; the structured task list is
`tasks/oh-devcontainer-restructure/prd.json`; the critic findings are
`tasks/oh-devcontainer-restructure/critique.md`. The loop calls you again until `progress.txt`
contains a line `STATUS: COMPLETE`.

## Execution model: Advisor-managed `/delegate` (REQUIRED)

**You are the Advisor for this iteration. Execute the work by fanning out `/delegate`, not by
editing files yourself.**

The **five** user stories own **disjoint files** (verified by the critique — re-read `prd.json`
for the exact owned-file list at the end of each story):

- **US-001** → `.oh/devcontainer/**` (the six moved files) + `.dockerignore`
- **US-002** → `.oh/scripts/{docker-compose.sh,gateway.sh,install.sh,check-pnpm-pin.sh,maintenance/restart-openharness-tmux.sh}`
  + new `.oh/scripts/sync-devcontainer.sh` + root `.devcontainer/devcontainer.json`
- **US-003** → `.oh/scripts/__tests__/{entrypoint,entrypoint-pnpm-install,gateway,compose-args,docs-compose-overlays}.test.ts`
  + `docs/intro.md` + `docs/installation.md` (the docs the docs-compose-overlays test asserts on)
- **US-004** → `.github/workflows/{ci-harness,sandbox-boot-guard,release}.yml` + `.hadolint.yaml`
  + `evals/probes/{boot-lint-glob,sandbox-boot-guard-ci,cron-watchdog}.sh` + `.claude/protected-paths.txt`
  + new `evals/probes/oh-devcontainer-restructure.sh`
- **US-005** → `evals/RESULTS.md` + `CHANGELOG.md` + `.oh/README.md` + root `AGENTS.md` +
  `docs/integrations/{slack,debugmcp}.md` + `crons/README.md` + two `.mifune/skills/...` docs + `.pi/{UPSTREAM.md,bridge-recovery/index.ts}`

Because the file sets are disjoint they run safely as **one parallel wave**. CRITICAL coupling
(coordinated by the pinned paths, no barrier needed): US-003's test expectations and US-005's
RESULTS row reference paths that US-001/US-002/US-004 produce — all PINNED to `.oh/devcontainer/`
in `prd.json`, so workers write them independently and the Advisor's post-integration gates prove
they agree.

Each iteration:

1. **Read context**: `prd.json` (the acceptance criteria are the contract — honor every path
   edit EXACTLY as written), `prd.md` (the wiring table), `critique.md` (must-fix amendments —
   honor every one), and the most recent `progress.txt` entries.
2. **Invoke `/delegate`** to run the `passes:false` stories as one parallel wave of **EDIT-only**
   workers — one worker per story, scoped to that story's owned files. Workers do filesystem
   edits and (for US-001) a filesystem **`mv`** (NOT `git mv` — they must not touch git);
   workers static-verify their own files (shellcheck their scripts; `jq .` their JSON;
   `hadolint` the Dockerfile if available) but do **not** run the full suite, do **not** stage or
   commit, and do **not** touch git. Hand each worker the exact acceptance criteria from its
   story. US-001 must preserve executable bits on the moved `.sh` files.
3. As the Advisor, **integrate** the workers' output, then run the gates yourself (all must pass):
   - `bash .oh/scripts/docker-compose.sh config --quiet` (base) AND with `HERMES_DASHBOARD=true`
     — proves the compose relative-path repoint + wrapper are correct.
   - `hadolint .oh/devcontainer/Dockerfile` (if hadolint present) and
     `shellcheck -S warning .oh/devcontainer/*.sh .oh/scripts/*.sh` — clean.
   - `bash .oh/scripts/sync-devcontainer.sh --check` — exits 0 (committed root devcontainer.json
     matches generator output); `jq . .devcontainer/devcontainer.json` parses.
   - `bash evals/probes/oh-devcontainer-restructure.sh`, `bash evals/probes/boot-lint-glob.sh`,
     `bash evals/probes/sandbox-boot-guard-ci.sh` — each exits 0 (PASS).
   - Run the FULL eval suite if a runner exists (`bash evals/run.sh` or the probe loop) — no
     green→red regressions.
   - **Grep sweep** (AC-H): no remaining reference to a MOVED asset under `.devcontainer/`
     outside historical CHANGELOG lines: `grep -rIn -- '.devcontainer/Dockerfile\|.devcontainer/docker-compose\|.devcontainer/entrypoint.sh\|.devcontainer/client-slack-supervise.sh\|.devcontainer/seed-msg-bridge.sh' . --exclude-dir=.git` returns only acceptable hits (in-image `/.devcontainer/devcontainer.json` is fine; the kept `.devcontainer/**` CI path filters and `.devcontainer/.env`/`.harness.yaml.env` are fine).
   - If `docker` is available, attempt the real oracle locally:
     `docker build -f .oh/devcontainer/Dockerfile -t sandbox-restructure-smoke .` — a clean build
     is the strongest proof. If docker is unavailable or too slow, note it and rely on CI's
     sandbox boot-guard (the canonical gate).
   - Fix any failure (delegate a follow-up or patch directly).
4. **Stage with git yourself** (`git add -A` so renames are detected) and **commit per story**
   in priority order with the message format below; mark each `passes: true` in `prd.json` and
   append a `progress.txt` entry per story.
5. When **all** stories pass and every gate above is green, append `STATUS: COMPLETE`.

If `/delegate` is unavailable, fall back to implementing the stories directly in `priority`
order — but `/delegate` is the intended path.

## Commit format (per `.claude/skills/git/SKILL.md`)

```
<type>: US-<NNN> — <story title>

Submitted-by: Claude
```

`<type>` = `task` for the move/repoint/docs stories, `feat` only if net-new user-facing behavior
(none here — this is a relocation). Stage only the files owned by that story. The `Submitted-by:`
trailer is mandatory (name the active harness identity, e.g. `Claude`).

## progress.txt entry format (append, never replace)

```markdown
## US-<NNN> — <YYYY-MM-DD HH:MM UTC>

**Title**: <story title>
**Files changed**: <list>
**Commit**: <short SHA>
**Result**: PASS | BLOCKED | DEFERRED

### What I did
<2-4 sentences>

### Learnings for future iterations
<patterns, gotchas>

---
```

## Critical rules

- **Pure relocation — NO behavior change.** Do not change the image, the boot sequence, the
  runtime path (`/home/sandbox/harness` stays), or any env semantics. Path repoints only.
- **Honor the Non-Goals** in `prd.md` — no `oh init`/`.oh/templates/` changes, no runtime-path
  change, no `.oh/install/` move.
- **The env files stay at root `.devcontainer/`** — `.env`, `.example.env`, `.harness.yaml.env`.
  Only the six build assets move. Repointing an env path is a BUG.
- **Never push** to `development`/`main`. Branch is `feat/531-oh-devcontainer-restructure`.
- **Never skip pre-commit hooks** (`--no-verify`). **Never** `git clone`/`git init`.
- **Confine writes** to repo-tracked paths under this worktree. Do not write to `~/`.
- **CHANGELOG discipline** — the user-visible relocation gets one `[Unreleased]` entry (US-004).
- **Don't modify completed stories** unless the current story explicitly requires it.

## Stop condition

After all four stories have `passes: true` in `prd.json` and every gate is green, append a line
on its own to `progress.txt`:

```
STATUS: COMPLETE
```

This terminates the loop. Also print `STATUS: COMPLETE` as the sole content of your final line
**only** when you have just written it to `progress.txt` (the completion marker); never print
that bare line for any other reason.

## Reference

- PRD: `tasks/oh-devcontainer-restructure/prd.md`
- Stories: `tasks/oh-devcontainer-restructure/prd.json`
- Critique: `tasks/oh-devcontainer-restructure/critique.md`
- Branch: `feat/531-oh-devcontainer-restructure`
- Issue: https://github.com/mifunedev/openharness/issues/531
