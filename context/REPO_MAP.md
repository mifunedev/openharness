# Repository context map

At session start, prefer Git's tracked file list over raw filesystem scans, then use the descriptions below to choose the first narrow search target.

## Source-map command

```bash
repo=$(git rev-parse --show-toplevel)
git -C "$repo" ls-files -- \
  ':!:.oh/tasks/*/progress.txt' \
  ':!:.mifune/skills/wiki/corpus/raw/*' \
  ':!:.oh/evals/datasets/**/oracle/**' \
  ':!:.oh/evals/datasets/**/diff.patch' \
  ':!:.oh/evals/datasets/**/changed-files.txt'
```

Why: anchoring at `git rev-parse --show-toplevel` prevents subdirectory launches from silently mapping only a subtree. `git ls-files` requires no extra tooling and excludes vendor, generated, ignored, and runtime state by default while preserving hidden source dirs such as `.claude/`, `.pi/`, `.github/`, and `.devcontainer/`.

## Session-start use

1. Read this file after `context/TOOLS.md`.
2. Use the source-map command only when orientation is needed; do not paste a raw filesystem tree into context.
3. Pick one row from the search routing guide before running broad `rg`.
4. When a routed directory has `README.md`, read that first.
5. Disregard the folders in the skip table by default; open them only for listed exception cases.
6. Prefer curated `.mifune/skills/wiki/corpus/*.md` and `.oh/memory/MEMORY.md` over raw logs/snapshots.

## Performance caveat and acceptance metric

Caveat: this file is a structural optimization, not benchmark proof by itself. It adds startup context; savings happen only when agents use it to avoid raw filesystem scans, vendor/generated reads, or broad repo search.

Acceptance metric: compare at least 5 common orientation tasks with and without this file loaded. Track total input tokens, tool calls before the first relevant file, time to correct path, and accidental reads under disregard paths. Count the change successful only if median time/tool calls drop and total token spend breaks even or improves.

## Context-file loading model

Different harnesses load `AGENTS.md`/`CLAUDE.md` differently. For Open Harness work, treat discovered global/user, parent-directory, and current-directory context files as cumulative context, then resolve conflicts by target-path specificity. Do not rely on automatic nearest-file-wins semantics.

Operational rule:

- Launch cwd matters: starting an agent at repo root may load repo-level guidance, not deeper package/workspace guidance.
- Before editing a subdirectory, check for local `AGENTS.md`/`CLAUDE.md` files in that path and its ancestors below repo root.
- Treat more local files as more specific for their subtree when instructions conflict.
- Within the same directory, `AGENTS.md` is canonical; `CLAUDE.md` is a provider-compatibility alias. If both are real files and conflict, stop and call out the conflict.
- If a local context file changes mid-session, use the harness's documented reload command when available, restart from the intended cwd, or explicitly read the changed file before relying on it.
- The helper below is repo-local only; also account for provider-global/user context files shown by the startup header or provider docs.

Repo-local ancestor check helper:

```bash
target=${1:-.}
case "$target" in /*) path=$target ;; *) path=$PWD/$target ;; esac

# Resolve nearest existing ancestor so new files/dirs are safe.
dir=$path
[ -d "$dir" ] || dir=$(dirname "$dir")
while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
  dir=$(dirname "$dir")
done

dir=$(cd -P "$dir" && pwd) || exit 1
repo=$(git -C "$dir" rev-parse --show-toplevel) || exit 1
repo=$(cd -P "$repo" && pwd) || exit 1

seen=""
while :; do
  for f in AGENTS.md CLAUDE.md; do
    p="$dir/$f"
    [ -f "$p" ] || continue
    real=$(readlink -f "$p" 2>/dev/null || printf '%s' "$p")
    case " $seen " in *" $real "*) continue ;; esac
    seen="$seen $real"
    case "$p" in "$repo"/*) printf '%s\n' "${p#$repo/}" ;; *) printf '%s\n' "$p" ;; esac
  done
  [ "$dir" = "$repo" ] && break
  [ "$dir" = "/" ] && break
  dir=$(dirname "$dir")
done
```


## Mifune ingress and ownership

Mifune source lives in `ryaneggz/mifune` and enters Open Harness as the pinned `.mifune/` submodule. Use `git clone --recurse-submodules`, or repair a plain clone with `bash .oh/scripts/ensure-mifune.sh --init` then `--check`. Change Mifune upstream first, then bump the Open Harness pin. `.pi/` remains a provider surface, not the v1 Mifune mount.

## Search routing quick guide

Use these routes before broad repo-wide search. If `Start here` names a directory and that directory has `README.md`, read the README first.

| Intent | Start here | Why |
|---|---|---|
| Session role, permissions, startup load | `AGENTS.md`, `context/README.md`, `context/` | Defines orchestrator role, voice, session-start reads, and rules. |
| Sandbox lifecycle, Docker, provisioning | `Makefile`, `.devcontainer/`, `harness.yaml`, `.oh/scripts/README.md`, `.oh/scripts/docker-compose.sh` | Owns container image, compose overlays, generated env, and lifecycle commands. |
| Git/GitHub workflow, PRs, releases | `.pi/skills/git/`, `.pi/skills/pr-audit/`, `.pi/skills/ci-status/`, `.github/workflows/` | Canonical branch/PR/release conventions and CI gates. |
| Cron/autopilot behavior | `.oh/crons/README.md`, `.oh/crons/`, `.oh/scripts/cron-runtime.ts`, `.pi/skills/autopilot/`, `.mifune/skills/autopilot/autopilot-caps.sh` | Scheduled prompts, runtime supervision, caps, and watchdog. |
| Eval/probe regressions | `.oh/evals/README.md`, `.oh/evals/probes/`, `.pi/skills/eval/` | Tier-A regression probes and eval runner contract. |
| Task/spec implementation state | `.oh/tasks/README.md`, `.oh/tasks/<active-task>/` | PRD, critique, Ralph JSON, prompt, and task-specific artifacts. |
| Docs | `README.md`, `.oh/docs/README.md`, `.oh/docs/` | GitHub-readable markdown; site/blog lives in `mifunedev/openharness-web`. |
| CLI code | `.oh/README.md`, `.oh/cli/` | The standalone `oh` CLI package; read `.oh/README.md` first. |
| Pi extensions and integration code | `.pi/extensions/`, `.pi/install/`, `.pi/settings.json` | Project-local Pi provider extensions, manifests, and runtime config; `.pi/` is not the v1 Mifune mount. |
| Skill behavior | `.mifune/skills/`, `.pi/skills/`, `.claude/skills/` | Source of truth is the initialized `.mifune/` submodule from `ryaneggz/mifune`; provider paths are symlinks into it. |
| Durable knowledge | `.mifune/skills/wiki/corpus/README.md`, `.mifune/skills/wiki/corpus/*.md`, `.oh/memory/MEMORY.md` | Curated wiki pages and long-term lessons; prefer these before raw logs. |
| Agent workspace seed files | `workspace/AGENTS.md`, `workspace/CLAUDE.md` | Template files bind-mounted into the sandbox workspace. |

## Disregard by default

Ignore these unless the task explicitly targets them:

| Path pattern | Why to skip first | Read only when |
|---|---|---|
| `.git/` | Git object database and refs; use `git` commands instead. | Debugging repository corruption. |
| `.worktrees/`, `.claude/worktrees/` | Isolated branch checkouts that duplicate repo context. | Managing/removing worktrees or inspecting a specific branch. |
| `node_modules/`, `.pnpm/`, `.pi/npm/node_modules/`, `.hermes/lsp/node_modules/` | Vendor dependencies; huge and low-signal. | Debugging dependency installation or package resolution. |
| `.oh/cli/dist/` | Generated build output. | Verifying generated CLI artifacts. |
| `.oh/cli/node_modules/` | Package-local vendor dependencies. | Debugging package-local dependency state. |
| `.oh/memory/YYYY-MM-DD/`, `.oh/memory/*/log.md` | High-churn session logs. | Loading today's required startup log or investigating a dated event. |
| `.oh/memory/*/wiki-drafts/` | Draft knowledge proposals, not canonical wiki. | Promoting a draft via `/wiki ingest --from-draft`. |
| `.mifune/skills/wiki/corpus/raw/` | Immutable provenance snapshots; often verbose. | Verifying source provenance behind a curated `.mifune/skills/wiki/corpus/*.md` entry. |
| `workspace/.slack/`, `workspace/.pi/`, `workspace/.ralph/`, `workspace/startup.sh` | Runtime state and local/sensitive sandbox artifacts. | Debugging Slack/Pi/Ralph runtime state or startup generation. |
| `.oh/tasks/*/progress.txt` | Runtime progress sentinel; terse and stale-prone. | Checking a specific Ralph run status; prefer `tail` over full read. |
| `.oh/evals/datasets/**/oracle/`, `.oh/evals/datasets/**/diff.patch`, `.oh/evals/datasets/**/changed-files.txt` | Expected-output fixtures, not implementation guidance. | Updating/verifying a dataset oracle. |

## On-demand search targets

Do not load all of these at once. Pick the row that matches the task, read README files first when present, then search narrowly.

| Path pattern | Contents | Best first use |
|---|---|---|
| `AGENTS.md` | Orchestrator identity, permissions, lifecycle, git workflow, skill map. | Confirm what this agent may do and required startup reads. |
| `README.md` | User-facing project overview and quick orientation. | Understand product positioning or public claims. |
| `Makefile` | Common lifecycle targets around sandbox creation, shell, ps, destroy. | Find operator commands and compose entry points. |
| `package.json` | Root scripts for build/test/typecheck/docs/security audit. | Pick verification commands. |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Root pnpm marker and pinned dependency graph. | Debug dependency drift; avoid lockfile reads unless dependency state matters. |
| `harness.yaml` | Harness runtime defaults such as autopilot caps and configured services. | Inspect operator-configurable behavior. |
| `.oh/` | OpenHarness runtime machinery grouped as one unit: the `oh` CLI (`.oh/cli/`), installer/lifecycle scripts (`.oh/scripts/`), container-install inputs (`.oh/install/`), deploy config (`.oh/config.json`). The docs site moved to `mifunedev/openharness-web`. | Read `.oh/README.md` first; find harness tooling addressed as a namespace. |
| `context/` | Voice, identity, tools, repo map, user collaboration, and rules. | Load operating principles and process constraints. |
| `.oh/crons/` | Scheduled agent prompts and heartbeat/autopilot jobs. | Understand recurring automation; read `.oh/crons/README.md` first. |
| `.oh/scripts/` | Shell/TypeScript automation for install, cron runtime, health checks, Ralph, caps. | Find executable implementation behind docs/skills; read `.oh/scripts/README.md` first. |
| `.oh/scripts/__tests__/` | Vitest coverage for harness scripts. | Locate targeted tests for script changes. |
| `.oh/evals/probes/` | Regression probes used by `/eval` and CI. | Add or inspect behavior guards. |
| `.oh/evals/capability/` | Capability benchmark specs/results vs regression probes. | Evaluate progress-ceiling tasks. |
| `.oh/evals/datasets/` | Verifiable issue-to-PR trajectory datasets. | Inspect prompts/manifests before oracle fixtures. |
| `.oh/cli/src/` | Standalone `oh` CLI source code. | Change CLI behavior; read `.oh/README.md` first. |
| `.oh/cli/package.json` | CLI package-local scripts and dependencies. | Run package-specific build/typecheck. |
| `.oh/docs/` | GitHub-readable product docs. | Update product docs; start at `.oh/docs/README.md`. |
| `.mifune/skills/wiki/corpus/*.md` | Curated internal knowledge pages. | Reuse durable research before reading raw sources; read `.mifune/skills/wiki/corpus/README.md` for index. |
| `.oh/tasks/<active-task>/` | `prd.md`, `prd.json`, `critique.md`, `prompt.md`; `progress.txt` only for Ralph run status. | Verify task graph or implementation scope before reading runtime progress. |
| `.github/workflows/` | CI, docs, release workflow definitions. | Debug/check GitHub Actions behavior. |
| `.devcontainer/` | Sandbox Dockerfile, compose, devcontainer config, entrypoint. | Change sandbox image/runtime provisioning. |
| `.pi/extensions/` | In-tree Pi extension source, especially Slack bridge. | Modify Pi integration behavior. |
| `.pi/skills/`, `.claude/skills/` | Skill contracts for Pi and Claude providers. | Update slash-skill behavior; sync both copies when mirrored. |
| `workspace/AGENTS.md` | Seed instructions copied into the agent workspace. | Change new sandbox agent identity/scaffold. |

Rule: tracked source first; generated/vendor/runtime/history-heavy folders are context poison unless debugging that exact subsystem.
