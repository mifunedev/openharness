# Critique — deepagents-cli-support

Generated 2026-05-04; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A -- IMPLEMENTER LENS

[SEVERITY: H] [STORY: US-004] [Default DeepAgents Ralph flags risk unrestricted destructive shell execution against protected paths.] | [EVIDENCE: AC text: `deepagents -y --shell-allow-list all -n "$task" -q --no-stream`; .claude/protected-paths.txt] | [RECOMMENDATION: Make `all` explicit opt-in via `RALPH_DEEPAGENTS_FLAGS`; default to a narrow/recommended allow list and require the Ralph prompt to restate protected-path must-not-delete rules.]

[SEVERITY: M] [STORY: US-004] [No per-invocation turn/time cap is required, so one DeepAgents call can hang inside a Ralph iteration despite `RALPH_MAX_ITERATIONS`.] | [EVIDENCE: US-004 AC omits `--max-turns`; scripts/ralph.sh has only loop-level `RALPH_MAX_ITERATIONS`] | [RECOMMENDATION: Add a default `--max-turns` value and `RALPH_DEEPAGENTS_MAX_TURNS` or require operators to set one.]

[SEVERITY: M] [STORY: US-003] [Host-overlay install behavior is underspecified for non-UID-1000 hosts; `scripts/install.sh` filters `*-host.yml` overlays and warning text/manual fallback must be updated or the new overlay may be silently disabled/confusing.] | [EVIDENCE: scripts/install.sh UID guard; US-003 AC only says pre-create `~/.deepagents`] | [RECOMMENDATION: Add AC to update UID guard comments, warnings, fallback overlay list, and expected behavior for `.devcontainer/docker-compose.deepagents-host.yml`.]

[SEVERITY: M] [STORY: US-005] [`install/banner.sh` status is vague: `~/.deepagents` will exist due named volume/precreation, but that does not prove provider credentials or usable configuration exist.] | [EVIDENCE: US-005 AC: "reports DeepAgents status based on `~/.deepagents` state"] | [RECOMMENDATION: Define exact status semantics, e.g. installed via `command -v deepagents`, configured via `~/.deepagents/.env` or `config.toml`, and avoid labeling an empty mounted directory as authenticated.]

[SEVERITY: M] [STORY: US-005] [Docs scope is too broad to verify consistently.] | [EVIDENCE: US-005 AC: "Update installation, onboarding, repair, permissions, configuration, and architecture docs where they enumerate..."] | [RECOMMENDATION: Replace with an explicit file checklist from the current repo: README.md, docs/quickstart.md, docs/onboarding.md, docs/installation.md, docs/operations/provision.md, docs/operations/destroy.md, docs/guide/overlays.md, docs/guide/permissions.md, docs/architecture/container-runtime.md, docs/architecture/overview.md, docs/agents/overview.md.]

[SEVERITY: M] [STORY: *] [The PRD omits the required user-visible CHANGELOG entry.] | [EVIDENCE: .claude/rules/git.md Changelog section; feature changes Docker image, compose volumes, installer, Ralph, and docs] | [RECOMMENDATION: Add AC requiring a `CHANGELOG.md` entry under `## [Unreleased]` in the same commit as the implementation.]

### Rerun

CRITIC_A -- IMPLEMENTER LENS -- RERUN

[L] [STORY: US-004] [FINDING] | [EVIDENCE: US-004 AC requires `deepagents -y --shell-allow-list recommended -n "$task" -q --no-stream`, `RALPH_DEEPAGENTS_FLAGS` override for `--shell-allow-list all`, and `RALPH_DEEPAGENTS_MAX_TURNS`; FR-7/FR-8 repeat those constraints] | [RECOMMENDATION: No blocking issue remains. The previous high finding is mitigated because unrestricted shell execution is no longer the default and `all` requires an explicit operator override.]

[L] [STORY: *] [FINDING] | [EVIDENCE: Technical Considerations names protected files `.devcontainer/Dockerfile`, `.devcontainer/entrypoint.sh`, `install/banner.sh`, and `scripts/ralph.sh`; `.claude/protected-paths.txt` marks these must-not-delete; no story asks to delete or deprecate protected entries] | [RECOMMENDATION: Proceed; keep implementation additive/conservative and do not delete protected paths without an explicit override.]

## Critic B — User lens

CRITIC_B -- USER LENS

[SEVERITY: H] [STORY: US-004] [DeepAgents Ralph default would grant unrestricted non-interactive shell execution, which is a large trust escalation for an explicitly selected new runtime.] | [EVIDENCE: PRD US-004; PRD Technical Considerations; scripts/ralph.sh] | [RECOMMENDATION: Require an explicit opt-in env var or operator-provided `RALPH_DEEPAGENTS_FLAGS` for shell allowance; do not default to `--shell-allow-list all`, or document the default as intentionally equivalent to full shell access.]

[SEVERITY: M] [STORY: US-005] [Docs scope risks drifting into multi-agent comparison/stacking, which conflicts with the v1 ICP's "one developer, one project, one harness" posture.] | [EVIDENCE: .claude/ICP.md; PRD US-005; docs/agents/overview.md] | [RECOMMENDATION: Frame DeepAgents as an optional supported runtime, keep Claude as the default path, and avoid copy that promotes racing or stacking multiple CLIs as the product surface.]

[SEVERITY: M] [STORY: US-002] [State persistence is underspecified because DeepAgents can use both `~/.deepagents/` and repo-local `.deepagents/`, creating unclear expectations about what survives rebuilds versus what is versioned in the project.] | [EVIDENCE: PRD US-002; PRD Technical Considerations] | [RECOMMENDATION: State explicitly that v1 persists only `/home/sandbox/.deepagents`; repo-local `.deepagents/` is project data and must follow normal gitignore/review rules.]

[SEVERITY: M] [STORY: US-003] [The host-state overlay lacks a user escape hatch in the PRD: users need clear disable, rollback, and cleanup instructions if host credentials or memory bleed into the sandbox unexpectedly.] | [EVIDENCE: PRD US-003; existing .devcontainer/docker-compose.*-host.yml comments; scripts/install.sh host overlay handling] | [RECOMMENDATION: Add acceptance criteria for disabling the overlay, returning to the named volume, and removing/resetting the `deepagents-auth` volume without touching host `~/.deepagents`.]

[SEVERITY: L] [STORY: *] [Protected paths are acknowledged, and the PRD does not propose deleting protected entries, but it touches several load-bearing files.] | [EVIDENCE: .claude/protected-paths.txt; PRD Technical Considerations] | [RECOMMENDATION: Keep changes additive and conservative for `.devcontainer/Dockerfile`, `.devcontainer/entrypoint.sh`, `install/banner.sh`, and `scripts/ralph.sh`; do not delete or deprecate protected paths without an explicit override.]

### Rerun

CRITIC_B -- USER LENS -- RERUN

[SEVERITY: M] [STORY: US-001] [Core-image scope still needs justification against v1 ICP pack-first guidance] | [EVIDENCE: .claude/ICP.md "Extension via packs, not core changes"; PRD Non-Goals "Do not implement a DeepAgents harness pack"] | [RECOMMENDATION: Add a short rationale explaining why DeepAgents belongs in the base image despite the pack-first ICP, or narrow the story to a pack/overlay if first-class core support is not intentional.]

[SEVERITY: M] [STORY: US-004] [Previous high finding around unrestricted shell access is mitigated for defaults, but operator override docs need an explicit danger boundary] | [EVIDENCE: US-004 default `--shell-allow-list recommended`; `RALPH_DEEPAGENTS_FLAGS` can choose `--shell-allow-list all`; docs/guide/permissions.md says agents can run arbitrary shell and Docker socket is enabled by default] | [RECOMMENDATION: Require docs and inline comments to state that `--shell-allow-list all` plus Docker socket access can affect sibling containers/host Docker, and should only be used for trusted tasks.]

[SEVERITY: L] [STORY: US-005] [Supported-agent inventory is stale/ambiguous before implementation] | [EVIDENCE: PRD Introduction says Claude Code, Codex, and Pi; docs/agents/overview.md currently lists Claude Code, Codex, OpenCode, and Pi] | [RECOMMENDATION: Update PRD wording or acceptance criteria so DeepAgents is added alongside the actual current supported set without omitting or regressing OpenCode.]

[SEVERITY: L] [STORY: US-002] [Repo-local `.deepagents/` expectations are only partially bounded] | [EVIDENCE: US-002 says repo-local `.deepagents/` is project data and must follow normal git review and ignore rules; Technical Considerations says DeepAgents can load project-specific memory and skills from repo root] | [RECOMMENDATION: Require docs to warn that repo-local `.deepagents/` may be read by the agent and can be committed, so secrets/provider keys belong only in `~/.deepagents` or ignored local files.]

[SEVERITY: L] [STORY: *] [No blocking protected-path violation remains] | [EVIDENCE: Technical Considerations names `.devcontainer/Dockerfile`, `.devcontainer/entrypoint.sh`, `install/banner.sh`, and `scripts/ralph.sh` as protected paths to modify conservatively and not delete; .claude/protected-paths.txt marks these must-not-delete] | [RECOMMENDATION: Proceed after addressing or explicitly accepting the medium findings.]

## Synthesis

- **High-severity findings**: 0 remaining after PRD revision.
- **Medium-severity findings**: 0 unmitigated; the rerun medium findings from Critic B were absorbed into the PRD before proceeding.
- **Recommendation**: PROCEED

The original high-severity shell-risk finding changed the implementation plan:
DeepAgents Ralph defaults now use `--shell-allow-list recommended`, unrestricted
`all` requires explicit `RALPH_DEEPAGENTS_FLAGS`, and each DeepAgents call gets a
max-turn cap. The PRD also now defines host-overlay rollback, UID-guard updates,
banner status semantics, repo-local `.deepagents/` secret boundaries, a core-image
rationale, and required CHANGELOG coverage.
