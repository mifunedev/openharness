# PRD: Fix Agent Issue Template Make Commands

## Introduction

The `[AGENT]` GitHub issue template (`.github/ISSUE_TEMPLATE/agent.md`) is the documented entry point for provisioning a new agent — `CLAUDE.md` §Lifecycle/Setup step 1 names it as the very first step. However, every command in its "Workspace Setup" flow is broken against the real `Makefile` and on-disk layout: it references `make quickstart`, `make list`, and a `NAME=` variable that do not exist, and a verify checklist that asserts files live in `workspace/` when they live in `context/` and `memory/`. A first-time orchestrator or contributor who follows the template copy-pastes commands that immediately error, then hits a verify checklist that can never pass. This PRD corrects the template to match what exists today — a pure documentation-correctness fix to a single file.

## Goals

- Replace every nonexistent `make` target/variable in `agent.md` with the real Makefile command.
- Correct the provisioning description to reflect what `make sandbox` actually does.
- Fix the verify checklist so its commands run and its assertions are true.
- Leave the Identity / Context / Metadata sections and the YAML frontmatter byte-for-byte unchanged.

## User Stories

### US-001: Correct the provisioning and enter-sandbox commands

**Description:** As an orchestrator following the `[AGENT]` template, I want the provisioning commands to be real Makefile targets so that copy-pasting them works instead of erroring.

**Acceptance Criteria:**

- [ ] In `### 1. Provision the agent`, the command `make NAME=<agent-name> quickstart` is replaced with `make sandbox`.
- [ ] The "This will:" bullet list following that command accurately describes what `make sandbox` does — it runs `docker compose up -d --build` to build and start the sandbox container — and no longer claims a `make` target auto-creates a worktree or branch.
- [ ] The provisioning narrative does NOT orphan the Metadata block: it notes that the per-agent branch (`agent/<agent-name>`) and worktree (`worktree_path` from the Metadata block) are created manually via `git worktree add` per `context/rules/git.md` §Worktrees — `make sandbox` builds/starts the container, the worktree+branch are a separate manual step. (This keeps the preserved Metadata fields coherent rather than referencing a flow no command performs.)
- [ ] In `### 2. Enter the sandbox`, the command `make NAME=<agent-name> shell` is replaced with `make shell <agent-name>` (positional container-argument form, per `Makefile` lines 34–40), where `<agent-name>` is the same placeholder defined in the Metadata block. A short parenthetical notes the positional argument is the container name (defaults to `openharness` / `harness.yaml` `sandbox.name`) and that `SHELL_USER=<user>` may be appended if the target has no `sandbox` user — matching CLAUDE.md §Lifecycle prose.
- [ ] No reference to a `quickstart` target or a `NAME=` make variable remains anywhere in the file.
- [ ] Run from the repo root, `grep -nE 'quickstart|NAME=' .github/ISSUE_TEMPLATE/agent.md` returns no matches.

### US-002: Correct the verify checklist

**Description:** As an orchestrator validating a freshly-provisioned sandbox, I want the verify checklist to use real commands and true assertions so that a healthy sandbox actually passes the checklist.

**Acceptance Criteria:**

- [ ] In `### 3. Verify`, `make list` is replaced with `make ps`.
- [ ] The workspace-contents check no longer asserts `SOUL.md and MEMORY.md are present` under `workspace/`; instead it reflects the real layout — `SOUL.md` lives in `context/`, `MEMORY.md` lives in `memory/`. The workspace-presence assertion is narrowed to the minimum viable check (`workspace/AGENTS.md` is present), with a non-exhaustive note that `workspace/` also holds `startup.sh` and `.claude/` (so the list does not read as exhaustive and falsely pass a partially-scaffolded workspace).
- [ ] The Verify checklist makes the execution context explicit: container-interior steps (e.g. `ls ~/harness/workspace`) are labeled as run inside the sandbox (after `make shell`), consistent with CLAUDE.md §Validate; host-side steps (`make ps`) are distinguished from them.
- [ ] Every command shown in the Verify checklist corresponds to a real Makefile target or a path that exists in its stated execution context (host or in-sandbox).
- [ ] Run from the repo root, `grep -nE 'make list' .github/ISSUE_TEMPLATE/agent.md` returns no matches.

### US-003: Preserve unchanged sections and template validity

**Description:** As a maintainer, I want the non-broken parts of the template untouched and the file still valid so that the change is minimal and GitHub still renders the issue template.

**Acceptance Criteria:**

- [ ] All content above `### 1. Provision the agent` — the YAML frontmatter (lines 1–7), `## Identity`, `## Context`, and `## Workspace Setup` → `### Metadata` sections — is byte-for-byte unchanged. The Metadata block's `branch: "agent/<agent-name>"` and `worktree_path: ".worktrees/<agent-name>"` are intentionally preserved: they are real conventions (`CLAUDE.md` persistent `agent/<agent-name>` branches; `context/rules/git.md` §Worktrees) that US-001's revised narrative now references as a manual step, so they are coherent, not stale.
- [ ] The YAML frontmatter still opens and closes with `---` and retains its top-level keys (`name`, `about`, `title`, `labels`, `assignees`). Verify structurally: `head -n 7 .github/ISSUE_TEMPLATE/agent.md | grep -c '^---$'` returns `2`.
- [ ] Only `.github/ISSUE_TEMPLATE/agent.md` is modified — no other issue template, skill, `Makefile`, `CLAUDE.md`, or workspace file is touched (`git diff --name-only` lists exactly that one path).

## Functional Requirements

- FR-1: The system (template) must instruct `make sandbox` as the provisioning command, with an accurate description of its effect.
- FR-2: The template must instruct `make shell <agent-name>` (positional argument) to enter the sandbox.
- FR-3: The Verify checklist must use `make ps` to confirm the container is running.
- FR-4: The Verify checklist must reference correct on-disk paths for `SOUL.md` (`context/`), `MEMORY.md` (`memory/`), and `workspace/` contents (`AGENTS.md`).
- FR-5: The frontmatter and all sections above `### 1. Provision the agent` must remain unchanged.

## Non-Goals

- Adding new Makefile targets (`quickstart`, `list`) or `NAME=` variable handling.
- Building the per-agent worktree-based provisioning flow the old template described (the worktree+branch remain a documented manual `git worktree add` step, not new automation).
- Reconciling the template preamble's "persistent, isolated workspace" framing with the reality that `make sandbox` starts a single shared sandbox container — this fix corrects commands/paths only; a future story may intentionally reframe the agent-isolation narrative.
- Modifying any other issue template, skill, `CLAUDE.md`, `Makefile`, or workspace file.
- Changing the Identity / Context / Metadata structure of the template.

## Technical Considerations

- Real `Makefile` targets: `sandbox, shell, destroy, stop, logs, ps, restart, config, help`. The `shell` target accepts a positional container name (`make shell <container>`), parsed via Makefile lines 34–40; it does not accept `NAME=`.
- On-disk layout: `SOUL.md` → `context/`, `MEMORY.md` → `memory/`, `workspace/` → `AGENTS.md` + `startup.sh` + `.claude/`.
- `make sandbox` runs `$(COMPOSE) up -d --build`, i.e. `docker compose ... up -d --build`.
- The file is a GitHub issue template; the YAML frontmatter must remain parseable for GitHub to render it.

## Success Metrics

- Every command in `agent.md` maps to a real Makefile target or an existing on-disk path.
- A reader following the template end-to-end encounters no `make: *** No rule to make target` error and no false verify assertion.

## Open Questions

- None blocking — scope is fully specified as documentation-correctness against the current Makefile and layout.

## Rollback

This change touches only a GitHub issue template (no migrations, data, or downstream config references the old commands). A plain `git revert` of the commit fully and safely restores the prior template.

## Critic review

Two critics (implementer + user lens) reviewed the original PRD. One high-severity finding (US-001 `make shell` placeholder clarity) was mitigated at the AC level by adding the container-name/`SHELL_USER` parenthetical and the placeholder note. Six medium-severity findings — worktree/framing coherence (×3), verify-checklist enumeration (×2), and host/container execution context (×1) — were all incorporated into the revised acceptance criteria above. No protected-path violations (the template is not on `.claude/protected-paths.txt`; the Makefile is explicitly out of scope). Recommendation: **PROCEED**. See `critique.md` for the full review.
