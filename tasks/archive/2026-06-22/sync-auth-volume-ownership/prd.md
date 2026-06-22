# PRD — Sync Auth Volume Ownership

## Introduction

Open Harness persists agent and GitHub authentication state in Docker named volumes under `/home/sandbox`. The devcontainer entrypoint currently repairs those mounts before reconciling the sandbox user's UID/GID to the bind-mounted checkout owner, which can leave auth volumes owned by the wrong numeric identity on hosts where UID 1000 is remapped.

## Goals

- Ensure persisted auth/config mounts are owned by the final sandbox UID/GID after any host UID/GID reconciliation.
- Preserve idempotent behavior for default UID=1000 hosts and restarts.
- Add regression coverage that pins the ordering and numeric-owner contract.

## Non-Goals

- Changing Docker volume names or compose mount topology.
- Changing GitHub token, SSH key, or agent-auth login behavior.
- Removing Docker socket access, sudo behavior, or other broader sandbox trust-boundary choices.

## User Stories

### US-001 — Repair auth mount ownership after UID sync

As a sandbox operator on a host with a non-default checkout UID/GID, I want auth/config mounts repaired after UID reconciliation so persisted credentials remain readable by the sandbox user.

Acceptance criteria:
- `.devcontainer/entrypoint.sh` centralizes the auth/config mount ownership repair in one idempotent helper.
- The helper repairs the mounted auth/config directories listed in compose (`.claude`, `.codex`, `.pi`, `.local/share/opencode`, `.grok`, `.deepagents`, `.cloudflared`, `.config/gh`) plus `/home/sandbox/.hermes` legacy home state and `.ssh` state when present.
- The helper never recursively chowns the bind-mounted checkout or `$HERMES_HOME` when it points inside `/home/sandbox/harness`; Hermes project-local runtime ownership remains governed by the existing post-sync Hermes block.
- The helper preserves the existing non-recursive parent repairs for `/home/sandbox/.local`, `/home/sandbox/.local/share`, and `/home/sandbox/.config` so sibling directory creation keeps working.
- The helper chowns to the sandbox user's current numeric `uid:gid`, not a possibly stale group name, and resolves that numeric owner inside the helper on each invocation.
- The helper runs once before UID sync for default-host compatibility and once after UID sync for remapped-host correctness, logging each ownership repair pass.
- Repair semantics are non-destructive: existing paths only, no deletion/renames, no chmod except the existing `.ssh` mode hardening, and no symlink traversal outside the repaired roots.

### US-002 — Pin the UID-remap regression test

As a maintainer, I want a script-level regression test so future entrypoint edits cannot move auth-volume repair back before UID sync only.

Acceptance criteria:
- A Vitest test asserts `.devcontainer/entrypoint.sh` computes numeric sandbox ownership from `id -u sandbox` and `id -g sandbox` inside the repair helper.
- A Vitest test asserts the repair helper is invoked before and after the host UID reconciliation block, forcing owner recomputation after UID/GID changes.
- Existing entrypoint tests remain green.

### US-003 — Document the runtime invariant

As a future agent, I want the runtime invariant discoverable in the changelog/wiki so the repair ordering is not re-derived during later boot-path work.

Acceptance criteria:
- `CHANGELOG.md` records the fix under `## [Unreleased]` → `### Fixed` with issue #220.
- `wiki/sandbox-auth-volumes.md` explains the auth volume ownership invariant with schema-valid frontmatter, `sources:`, `## Relevant Source Files`, line-cited claims, system relationship notes, operator symptoms, verification, and recovery guidance.
- `wiki/README.md` is refreshed so the new wiki entry is indexed.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/sandbox-auth-volumes.md` to create; refresh `wiki/README.md`.
- **Spec alignment**: The wiki entry must describe why auth/config named volumes are repaired both before and after UID sync, why numeric `uid:gid` ownership matters when the sandbox user's primary group is remapped to an existing host GID, what symptoms indicate ownership drift, how to verify numeric ownership, and how to recover manually if auth still fails.
- **DeepWiki comparison**: No task-specific DeepWiki page found for auth-volume ownership; match DeepWiki style by listing relevant source files, source-backed claims, and runtime relationships.
- **Acceptance criteria**: US-003 must create/update the wiki entry and run `bash evals/probes/wiki-readme-index.sh`.

## Open Questions

None.
