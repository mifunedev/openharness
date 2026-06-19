# PRD — Repo Layout Sandbox Tree Support

## Introduction

Add first-class support for the Unix `tree` directory visualizer in Open Harness as a concise, descriptive repository premap tool. The operator already has `tree` installed in the current local environment (`tree v2.1.0` at `/usr/bin/tree`); this work makes the next sandbox image build install the same class of tool and adds a Claude skill that produces concise, descriptive maps for agent handoff before exact file reads.

## Goals

- Ensure future sandbox image builds include the Debian `tree` package with no manual post-build install.
- Add a self-contained `.claude/skills/repo-layout/` skill that runs `tree` through a skill-local script and produces concise, descriptive premap output with optional raw pass-through.
- Document the tool/skill relationship in the wiki and changelog so future agents understand why `tree` is part of the sandbox toolchain.
- Verify the skill and sandbox package declaration with deterministic local checks.

## Non-Goals

- Do not replace `find`, `rg`, or existing file-read workflows; `/repo-layout` is optional layout visualization only and must not supersede required search/read conventions.
- Do not add a Node/Python wrapper around `tree`; the Debian package and a small shell wrapper are sufficient.
- Do not require rebuilding or destroying the currently running sandbox during this task; acceptance is that the next image build installs `tree`.
- Do not commit or alter `memory/` artifacts.

## Current Evidence

- `command -v tree` returns `/usr/bin/tree` in the current environment.
- `tree --version` returns `tree v2.1.0 (c) 1996 - 2022 by Steve Baker, Thomas Moore, Francesc Rocher, Florian Sesser, Kyosuke Tokoro`.
- `.devcontainer/Dockerfile` currently installs base packages in its first `apt-get install -y --no-install-recommends` block but does not include `tree`.

## User Stories

### US-001 — Install tree in the sandbox image

As a harness operator, I want the sandbox Docker image to install `tree` during image build so that future sandboxes can inspect directory layouts without manual package installation.

Acceptance criteria:

- **Protected-path override**: `.devcontainer/Dockerfile` is listed in `.claude/protected-paths.txt`; this story is explicitly authorized to make the bounded edit of adding the Debian `tree` package to the existing system package install list and nothing else in that file.
- `.devcontainer/Dockerfile` includes `tree` in the system package install list.
- The package is installed with the existing `apt-get install -y --no-install-recommends` pattern.
- Verification proves next-build support by running `grep -E 'apt-get install .*tree|^[[:space:]]*.*tree' .devcontainer/Dockerfile` and either a Debian package availability check (`apt-cache policy tree` or equivalent in a bookworm context) or a documented Docker build-path check.
- `hadolint .devcontainer/Dockerfile` passes when available; otherwise the PR's Boot Path Lint CI check must pass.

### US-002 — Add a tree Claude skill

As an agent, I want a `/repo-layout` skill that creates concise, descriptive directory premaps so layout summaries are optimized for handoff before exact file reads.

Acceptance criteria:

- `.claude/skills/repo-layout/SKILL.md` exists with `name: repo-layout`, front-loaded triggers, an accurate `argument-hint`, and concise imperative instructions.
- `.claude/skills/repo-layout/scripts/run.sh` exists, is executable, verifies `tree` is installed before use, and supports concise premap options and explicit `--raw` pass-through to the `tree` binary.
- Running the script with no args executes a concise default equivalent to `tree -L 1 --dirsfirst --filelimit 40 -a -I '<noisy dirs>' .`, followed by short `Key areas` and `Good next reads` sections.
- Running the script with `--depth 2` or `-L 2` adjusts premap depth; running with `--raw -L 1 .claude/skills` succeeds and is documented as intentional native `tree` pass-through.
- The skill-builder checklist from `.worktrees/task/457-preserve-dirty-workspace/.claude/skills/skill-builder/SKILL.md` is satisfied: lowercase-kebab name, front-loaded triggers, description under the listing budget, body under 500 lines, bundled deterministic logic, and wired `$ARGUMENTS`.

### US-003 — Document tree support

As a future agent, I want source-backed documentation for tree support so that I know the sandbox image owns the binary and the skill owns the invocation pattern.

Acceptance criteria:

- `CHANGELOG.md` adds an Unreleased entry for sandbox `tree` support and the `/repo-layout` skill.
- `wiki/repo-layout-skill.md` explains the relationship between `.devcontainer/Dockerfile`, `.claude/skills/repo-layout/SKILL.md`, and `.claude/skills/repo-layout/scripts/run.sh` with source-file references.
- `wiki/raw/<actual-utc-date>-repo-layout-skill.md` captures the local/DeepWiki source notes used to create the entry.

### US-004 — Index and verify the wiki entry

As a maintainer, I want the wiki index to stay fresh after adding tree support so `/wiki-query` can find it later.

Acceptance criteria:

- `wiki/README.md` is regenerated or otherwise updated so the new wiki entry is indexed.
- `bash evals/probes/wiki-readme-index.sh` passes.
- `bash evals/probes/repo-layout-skill.sh` passes.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/repo-layout-skill.md` and raw snapshot `wiki/raw/2026-06-19-repo-layout-skill.md`.
- **Spec alignment**: The wiki entry must teach that the sandbox image provides the `tree` binary for next builds while the `/repo-layout` skill provides the concise, descriptive agent-facing premap. It should cite the Dockerfile package block, the skill frontmatter/body, and the wrapper script.
- **DeepWiki comparison**: Checked `https://deepwiki.com/mifunedev/openharness` on 2026-06-19. The root page frames the sandbox as a Docker container defined by `.devcontainer/docker-compose.yml` and lifecycle-managed by `Makefile`, and frames the skills system as capabilities under `.claude/skills/`; no dedicated `tree` page was found. This task should follow that DeepWiki-style source-first shape and connect the new tool to those two existing subsystems.
- **Acceptance criteria**: US-003 requires the local wiki entry and DeepWiki-style source relationships; US-004 requires `wiki/README.md` freshness via `bash evals/probes/wiki-readme-index.sh`.

## Verification Plan

- Run the local current-version smoke check: `command -v tree && tree --version`.
- Run `.claude/skills/repo-layout/scripts/run.sh` with no args and with `--depth 1 .claude/skills` and raw mode with `--raw -L 1 .claude/skills`.
- Run shell syntax checks for the new script.
- Verify `tree` appears in `.devcontainer/Dockerfile` and can be installed from Debian bookworm; if a full Docker image rebuild is skipped for cost/time, record that and rely on PR CI Boot Path Lint plus package availability evidence.
- Parse `tasks/tree-sandbox-skill/prd.json` after `/ralph` conversion.
- Run `bash evals/probes/wiki-readme-index.sh`.
- Run `bash evals/probes/repo-layout-skill.sh`.
- Run `pnpm run test:scripts` and `/eval` before final PR readiness.

## Critique Resolution

Critics initially flagged the `.devcontainer/Dockerfile` protected-path edit, vague verification language, ambiguous `/repo-layout` output bounds, missing skill-builder checklist provenance, combined docs/indexing scope, shallow DeepWiki citation, and optional-tool framing. The PRD now includes a bounded protected-path override for adding only the Debian `tree` package, explicit default `tree` options, pass-through guardrails, a cited skill-builder checklist source, split documentation/indexing stories, an exact DeepWiki URL check, and a non-goal that `/repo-layout` must not replace required search/read workflows. Recheck found no blocking findings; proceed.
