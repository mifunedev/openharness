# PRD: DeepAgents CLI Support

## Introduction

Add DeepAgents CLI as a supported Open Harness agent runtime. Open Harness
currently documents and preinstalls Claude Code, Codex, OpenCode, and Pi;
DeepAgents is a terminal coding agent with interactive and non-interactive
modes that fits the same sandbox model if installation, state persistence,
Ralph invocation, and onboarding docs are wired consistently.

The implementation should make DeepAgents available in the base sandbox image,
preserve its user configuration under `~/.deepagents`, and allow Ralph task
loops to intentionally select it with `scripts/ralph.sh --harness=deepagents`.
This is base-image support rather than a harness pack because DeepAgents is a
single general-purpose terminal CLI, depends on `uv` which is already in the
base image, and needs Ralph harness integration in `scripts/ralph.sh`; it is not
an opinionated multi-service workflow like a pack.

## Goals

- Install `deepagents-cli` in the base sandbox image using the existing `uv`
  runtime.
- Persist DeepAgents configuration, provider keys, memory, skills, and sessions
  across rebuilds with a sandbox-scoped named volume.
- Provide an optional host bind-mount overlay for trusted workflows that want
  to reuse host DeepAgents state.
- Add DeepAgents as an explicit Ralph harness choice without changing the
  existing Claude to Pi to Codex fallback behavior.
- Update onboarding, repair, architecture, and agent docs so users can verify,
  authenticate, and run DeepAgents in tmux.

## User Stories

### US-001: Install DeepAgents in the sandbox image

**Description:** As a sandbox user, I want `deepagents` available on PATH after
provisioning so that I can launch it without manual installation.

**Acceptance Criteria:**

- [ ] `.devcontainer/Dockerfile` installs `deepagents-cli` with `uv tool install`
      after `uv` is installed.
- [ ] The install uses image-level tool locations, such as
      `UV_TOOL_DIR=/opt/uv/tools` and `UV_TOOL_BIN_DIR=/usr/local/bin`, so the
      `deepagents` executable is available to the `sandbox` user.
- [ ] `docker build -f .devcontainer/Dockerfile .` reaches the DeepAgents
      install layer without requiring interactive input.
- [ ] `deepagents -v` runs successfully inside a rebuilt sandbox.
- [ ] Existing `claude`, `codex`, and `pi` installs remain unchanged.
- [ ] Tests pass.

### US-002: Persist DeepAgents state

**Description:** As a sandbox user, I want DeepAgents state to persist across
container rebuilds so that provider keys, model configuration, memory, skills,
and sessions are not lost.

**Acceptance Criteria:**

- [ ] `.devcontainer/docker-compose.yml` mounts a named volume at
      `/home/sandbox/.deepagents`.
- [ ] The compose volume is named consistently with existing agent auth volumes,
      for example `deepagents-auth`.
- [ ] `.devcontainer/entrypoint.sh` includes `.deepagents` in the mounted
      directory ownership pass.
- [ ] The ownership pass skips `.deepagents` when a host bind-mount overlay sets
      `DEEPAGENTS_HOST_BIND_MOUNT=1`.
- [ ] Documentation states that v1 persists only `/home/sandbox/.deepagents`;
      repo-local `.deepagents/` is project data and must follow normal git
      review and ignore rules.
- [ ] `docker exec -u sandbox openharness test -w ~/.deepagents` succeeds after
      provisioning.
- [ ] Existing auth volumes for Claude, Codex, and Pi remain unchanged.
- [ ] Tests pass.

### US-003: Add a DeepAgents host-state overlay

**Description:** As a trusted local user, I want an opt-in compose overlay that
binds my host `~/.deepagents` into the sandbox so that I can reuse existing
DeepAgents provider configuration and memory.

**Acceptance Criteria:**

- [ ] Add `.devcontainer/docker-compose.deepagents-host.yml` following the style
      and warning level of the existing Claude, Codex, and Pi host overlays.
- [ ] The overlay bind-mounts `${HOST_DEEPAGENTS_DIR:-~/.deepagents}` to
      `/home/sandbox/.deepagents`.
- [ ] The overlay sets `DEEPAGENTS_HOST_BIND_MOUNT=1`.
- [ ] Overlay comments document the credential blast radius, host write
      behavior, UID 1000 assumption, and the need for the host directory to
      pre-exist.
- [ ] `scripts/install.sh` pre-creates `~/.deepagents` with the other host auth
      directories.
- [ ] `scripts/install.sh` UID guard comments, warnings, and fallback overlay
      list include the DeepAgents host overlay so non-UID-1000 hosts do not get
      confusing credential failures.
- [ ] Host-overlay docs mention the DeepAgents overlay, its trust tradeoffs, how
      to disable it, how to return to the named volume, and how to reset the
      `deepagents-auth` volume without deleting host `~/.deepagents`.
- [ ] Tests pass.

### US-004: Add DeepAgents to Ralph harness selection

**Description:** As a Ralph operator, I want to run task loops with DeepAgents
when I choose it explicitly so that DeepAgents can execute the same four-file
task contract as the existing harnesses.

**Acceptance Criteria:**

- [ ] `scripts/ralph.sh --harness=deepagents <task>` is accepted by argument
      validation.
- [ ] `RALPH_HARNESS=deepagents scripts/ralph.sh <task>` is accepted.
- [ ] `scripts/ralph.sh` requires `deepagents` on PATH when DeepAgents is the
      active harness.
- [ ] DeepAgents Ralph execution uses non-interactive mode, clean output, and a
      constrained default shell allowance:
      `deepagents -y --shell-allow-list recommended -n "$task" -q --no-stream`.
- [ ] Add `RALPH_DEEPAGENTS_FLAGS` so operators can override the default
      DeepAgents flags, including explicitly choosing `--shell-allow-list all`
      when they accept unrestricted shell execution risk.
- [ ] Inline comments and docs state that `--shell-allow-list all` combined with
      the mounted Docker socket can affect sibling containers or host Docker and
      should only be used for trusted tasks.
- [ ] Add `RALPH_DEEPAGENTS_MAX_TURNS` with a default positive value and pass it
      to DeepAgents as `--max-turns` so one Ralph iteration cannot hang
      indefinitely inside a single DeepAgents call.
- [ ] The generated Ralph prompt restates that protected paths in
      `.claude/protected-paths.txt` must not be deleted or deprecated without an
      explicit override.
- [ ] Existing Claude, Pi, and Codex execution and fallback behavior remain
      unchanged.
- [ ] Tests pass.

### US-005: Document DeepAgents support

**Description:** As a new Open Harness user, I want DeepAgents documented with
the other supported agents so that I can install, authenticate, verify, and run
it correctly.

**Acceptance Criteria:**

- [ ] `docs/agents/overview.md` lists DeepAgents in the supported agents table
      and verification commands.
- [ ] Add `docs/agents/deepagents.md` with purpose, install verification,
      provider-key setup, common interactive and non-interactive usage, tmux
      usage, Ralph usage, and upstream documentation links.
- [ ] Update these docs where they enumerate supported agent CLIs, auth/state
      volumes, overlays, permissions, or Ralph harness options: `README.md`,
      `docs/quickstart.md`, `docs/onboarding.md`, `docs/installation.md`,
      `docs/operations/provision.md`, `docs/operations/destroy.md`,
      `docs/operations/repair.md`, `docs/guide/overlays.md`,
      `docs/guide/permissions.md`, `docs/guide/configuration.md`,
      `docs/architecture/container-runtime.md`,
      `docs/architecture/overview.md`, and `docs/agents/overview.md`.
- [ ] `install/banner.sh` reports DeepAgents status without treating an empty
      mounted directory as authenticated: installed status comes from
      `command -v deepagents`; configured status comes from
      `~/.deepagents/.env` or `~/.deepagents/config.toml`.
- [ ] Docs frame DeepAgents as an optional supported runtime and keep Claude as
      the default path; they do not promote multi-agent racing as the product
      surface.
- [ ] Documentation states that DeepAgents non-interactive shell execution is
      disabled unless a shell allow list is configured.
- [ ] Documentation warns that repo-local `.deepagents/` may be read by the
      agent and can be committed; secrets and provider keys belong only in
      `~/.deepagents` or ignored local files.
- [ ] `pnpm docs:build` passes.

### US-006: Add release note

**Description:** As a release reviewer, I want a changelog entry for DeepAgents
support so that the user-visible sandbox and Ralph changes are captured.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]` describing DeepAgents
      CLI support.
- [ ] The entry mentions the sandbox image, state volume or host overlay, Ralph
      harness selection, and docs/onboarding updates.
- [ ] If an `### Added` section already exists under `[Unreleased]`, append to
      it instead of creating a duplicate heading.
- [ ] Tests pass.

## Functional Requirements

- FR-1: The base Docker image must include a working `deepagents` executable.
- FR-2: DeepAgents state must persist under `/home/sandbox/.deepagents`.
- FR-3: A trusted host user must be able to opt into binding host
  `~/.deepagents` into the sandbox.
- FR-4: Ralph must accept `deepagents` as an explicit harness value.
- FR-5: Ralph must pass task text to DeepAgents in non-interactive mode.
- FR-6: Ralph must not silently fall back to DeepAgents from Claude, Pi, or
  Codex.
- FR-7: Ralph's DeepAgents default must use `--shell-allow-list recommended`;
  unrestricted shell access must require an explicit operator override through
  `RALPH_DEEPAGENTS_FLAGS`.
- FR-8: Ralph's DeepAgents invocation must include a per-call max-turn cap.
- FR-9: Existing supported harness behavior must remain backward compatible.
- FR-10: User-facing docs must describe installation, authentication, tmux usage,
  state persistence, and Ralph invocation for DeepAgents.

## Non-Goals

- Do not implement a DeepAgents harness pack; this feature adds first-class base
  support because the CLI is a single general-purpose runtime and Ralph needs a
  built-in harness selector.
- Do not configure remote DeepAgents sandbox providers such as Daytona.
- Do not select a default DeepAgents model or store provider keys in tracked
  files.
- Do not make DeepAgents the default Ralph harness.
- Do not change Claude, Pi, or Codex fallback order.
- Do not launch the Ralph loop automatically as part of the spec PR.

## Technical Considerations

- DeepAgents CLI is distributed as the Python package `deepagents-cli` and its
  documented installer uses `uv tool install`.
- DeepAgents stores global configuration under `~/.deepagents/`, with
  project-specific memory and skills optionally loaded from `.deepagents/` in a
  repository root.
- DeepAgents supports non-interactive execution with `-n`; clean buffered output
  can use `-q --no-stream`.
- DeepAgents disables shell execution in non-interactive mode unless
  `-S`/`--shell-allow-list` or `DEEPAGENTS_CLI_SHELL_ALLOW_LIST` is configured;
  Open Harness should default to `recommended`, not `all`.
- The Dockerfile should avoid user-home installs that leave executables only in
  `/root/.local/bin` or `/home/sandbox/.local/bin`.
- Existing protected paths touched by this work include `.devcontainer/Dockerfile`,
  `.devcontainer/entrypoint.sh`, `install/banner.sh`, and `scripts/ralph.sh`;
  these files must be modified conservatively and not deleted.

## Success Metrics

- A freshly built sandbox can run `deepagents -v` as the `sandbox` user.
- A rebuilt sandbox preserves files under `~/.deepagents`.
- `scripts/ralph.sh --harness=deepagents <task>` launches a tmux loop for a
  valid four-file task.
- Existing `scripts/ralph.sh --harness=claude|pi|codex` flows still work.
- Harness docs build successfully.

## Open Questions

- None for v1. The implementation should use the defaults above.

## References

- DeepAgents CLI overview: https://docs.langchain.com/oss/python/deepagents/cli/overview
- DeepAgents configuration: https://docs.langchain.com/oss/python/deepagents/cli/configuration
- DeepAgents CLI source: https://github.com/langchain-ai/deepagents/tree/main/libs/cli
