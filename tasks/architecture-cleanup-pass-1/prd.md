# PRD: Architecture Cleanup Pass 1

## Introduction

First architectural cleanup pass after the v0.7 convergence (PR #212). Targets verified slop and stale artifacts mapped during planning at `.claude/plans/i-want-to-improve-delightful-honey.md`. The recurring measurement substrate (`/harness-audit`, `/skill-lint`, `/prd`, `/ralph`) was restored from regression in commit `392ce76`; this pass acts on the concrete findings that prompted the planning conversation.

Tracks GitHub issue [#213](https://github.com/ryaneggz/open-harness/issues/213). Branch: `audit/213-architecture-cleanup-pass-1`. PRs target `development`.

## Goals

- Delete obsolete on-disk artifacts that consume space or clutter directory listings
- Resolve empty workspace packages and their dangling references
- Remove dead install scripts the Dockerfile no longer wires
- Reclaim ~370 MB of `.worktrees/` host disk; codify a stale-worktree policy
- Critic-gate destructive cross-team actions (remote branch prune, stale PR decisions)
- End each story with `passes: true` in `prd.json` and a `progress.txt` entry; final line of `progress.txt` is `STATUS: COMPLETE`

## User Stories

### US-001: Delete obsolete spec v0.6 from disk + fix call-graph claim

**Description:** As a maintainer, I want `.claude/specs/structure-spec-v0.6.md` removed from disk and the spec v0.7 self-contained so anyone exploring `.claude/specs/` sees only canonical content, and I want the factually-wrong call-graph claim in `docs/architecture/container-runtime.md` corrected.

**Acceptance Criteria:**

- [ ] `rm /home/sandbox/harness/.claude/specs/structure-spec-v0.6.md` (untracked; `.gitignore:49-51` allowlist confirms only v0.7 + install-prereq-detection are tracked)
- [ ] Edit `.claude/specs/structure-spec-v0.7.md:6` — replace `**Builds on:** [structure-spec-v0.6.md](structure-spec-v0.6.md)` with a one-paragraph self-contained summary of what v0.6 established (so v0.7 stands alone)
- [ ] Edit `docs/architecture/container-runtime.md:26` — remove the false claim that `.devcontainer/entrypoint.sh` "calls `install/entrypoint.sh`"; describe the actual call graph: Dockerfile `ENTRYPOINT ["entrypoint.sh"]` → `.devcontainer/entrypoint.sh` (which sources `install/banner.sh` for shell prompt only)
- [ ] `git ls-files | xargs grep -l 'structure-spec-v0\.6'` returns no hits
- [ ] CHANGELOG `### Removed` and `### Fixed` entries under `[Unreleased]`
- [ ] Lint passes
- [ ] Tests pass

### US-002: Resolve packages/web-ui + packages/slack + dangling references

**Description:** As a maintainer, I want the empty `packages/web-ui` and `packages/slack` directories removed (both have zero tracked files), the `pnpm-workspace.yaml` slack entry dropped, and the half-dozen dangling references across `install/`, `.github/ISSUE_TEMPLATE/`, and similar files cleaned up so `pnpm install` and `docker compose config` reflect reality.

**Acceptance Criteria:**

- [ ] `rm -rf packages/web-ui packages/slack` (both fully untracked — `git ls-files packages/` returns empty)
- [ ] `rmdir packages` if it ends up empty
- [ ] `pnpm-workspace.yaml`: remove the `- packages/slack` line; if no packages remain, drop the `packages` key (only `apps/docs` survives)
- [ ] `install/entrypoint.sh:68`: delete the SLACK_PKG block (build-and-link `packages/slack` flow). Note: US-003 deletes this file entirely, so this AC is moot if US-003 lands first
- [ ] `.github/ISSUE_TEMPLATE/feat.md:20`: remove `packages/sandbox, packages/slack` from the "Which area" hint; reflect actual current areas (`.devcontainer/`, `install/`, `docs/`, `workspace/` template, `scripts/`, `crons/`)
- [ ] `pnpm install` exits 0 at root
- [ ] `docker compose -f .devcontainer/docker-compose.yml config` validates (no unknown package references)
- [ ] CHANGELOG `### Removed` entry
- [ ] Lint passes
- [ ] Tests pass

### US-003: Delete dead install scripts (critic-gated)

**Description:** As a maintainer, I want `install/setup.sh` and `install/entrypoint.sh` removed because the Dockerfile (`COPY .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh; ENTRYPOINT ["entrypoint.sh"]`) wires `.devcontainer/entrypoint.sh` directly. Grep confirms zero live references outside `.worktrees/` and CHANGELOG history. Critic must review before deletion (destructive, file-removal scope warrants adversarial review per `.claude/rules/advisor-model.md`).

**Acceptance Criteria:**

- [ ] Spawn `.claude/agents/critic.md` via the Task tool with the proposed deletion list (`install/setup.sh`, `install/entrypoint.sh`, optionally `install/tmux-agent.sh`) and the grep evidence; capture Risk Assessment in the commit body
- [ ] `git rm install/setup.sh install/entrypoint.sh`
- [ ] Investigate `install/tmux-agent.sh` (358 bytes) the same way; `git rm` if no live references found, otherwise document its caller in `AGENTS.md`
- [ ] Update `AGENTS.md:140` (project structure block) — remove the `entrypoint.sh, setup.sh` references; describe what actually lives in `install/` post-cleanup (`banner.sh`, `cloudflared-tunnel.sh`, `.tmux.conf`, `.zshrc`, plus `tmux-agent.sh` if kept)
- [ ] `git ls-files | xargs grep -l 'install/setup\.sh\|install/entrypoint\.sh'` returns no hits
- [ ] `docker compose -f .devcontainer/docker-compose.yml config` validates (entrypoint resolves to `.devcontainer/entrypoint.sh` only)
- [ ] CHANGELOG `### Removed` entry
- [ ] Lint passes
- [ ] Tests pass

### US-004: .worktrees/ cleanup + policy

**Description:** As a maintainer, I want stale worktrees pruned (current footprint: ~470 MB across 6 directories) and a stale-worktree policy codified in `.claude/rules/git.md` so future maintainers know when worktrees may be removed. The corrupted `.worktrees/agent/uat-tester/` (no `.git` symlink) is the highest-priority single cleanup.

**Acceptance Criteria:**

- [ ] `git worktree prune --verbose`
- [ ] For each `.worktrees/<name>` whose `git worktree list` entry is broken or whose branch HEAD is >30 days old AND has no associated open PR: `git worktree remove --force` (recoverable) or `rm -rf` (corrupted)
- [ ] Specifically: `.worktrees/agent/uat-tester/` has no `.git` symlink — `rm -rf` it
- [ ] After cleanup, `du -sh .worktrees/` ≤ 100 MB
- [ ] Add a one-paragraph "Stale worktree policy" section to `.claude/rules/git.md` after the existing § Worktrees block: "worktrees older than 30 days without a corresponding open PR may be removed via `git worktree remove`; the `/harness-audit` skill flags candidates"
- [ ] CHANGELOG `### Removed` entry (count, not list)
- [ ] Lint passes
- [ ] Tests pass

### US-005: Stale remote branch prune (critic-gated)

**Description:** As a maintainer, I want stale remote branches (10+ candidates >30 days old, no associated open PR) pruned after critic review so the remote stays uncluttered. Critic gate is mandatory because `git push origin --delete` is destructive and cross-machine.

**Acceptance Criteria:**

- [ ] Generate candidate list: `git for-each-ref --sort=committerdate refs/remotes/origin --format='%(committerdate:relative)|%(refname:short)|%(authorname)' | awk -F'|' '$1 ~ /(months|year)/ || ($1 ~ /weeks/ && $1 !~ /^[0-9] weeks/)'`
- [ ] For each candidate, check `gh pr list --head <branch>`; mark for deletion only if no open PR AND committerdate > 60 days
- [ ] Spawn `.claude/agents/critic.md` with the full candidate list; require Risk Assessment with no high-severity findings (or explicit mitigation note in commit body) before any `git push origin --delete`
- [ ] Verify `backup/development-before-main-sync-2026-03-30` has no unique commits (`git log development..origin/backup/development-before-main-sync-2026-03-30` returns empty) before pruning
- [ ] After prune: `git remote prune origin && git fetch --prune`
- [ ] CHANGELOG `### Removed` entry (count only, not branch list — names rot in the changelog)
- [ ] Lint passes
- [ ] Tests pass

### US-006: Decide stale open PRs #131 and #69 (critic-gated)

**Description:** As a maintainer, I want PR #131 (deepagents-cli) and PR #69 (web-UI) decided — close-with-comment or label `v0.8` for explicit deferral — because both contradict the v1 ICP framing in `.claude/ICP.md` (single working developer, one project). Critic-gated because closing other contributors' PRs is cross-team.

**Acceptance Criteria:**

- [ ] `gh issue view 130` (deepagents-cli) and `gh issue view 66` (web-UI) read for context
- [ ] Spawn `.claude/agents/critic.md` with each PR's diff and `.claude/ICP.md` content; capture decision rationale
- [ ] Per PR: either `gh pr close --comment` (with v0.7 framing rationale + link to `.claude/ICP.md` and SPEC v0.7 §"Harness Packs"), or `gh pr edit --add-label "v0.8"` (defer)
- [ ] Both PRs receive a comment linking `tasks/architecture-cleanup-pass-1/prd.json` US-006
- [ ] No CHANGELOG entry (PR housekeeping is pure chore per `.claude/rules/git.md:65`)
- [ ] Lint passes
- [ ] Tests pass

### US-007: Dogfood /harness-audit against the cleaned codebase

**Description:** As a maintainer, I want to validate the recurring measurement substrate end-to-end by running `/harness-audit` against the just-cleaned codebase and confirming most catalog items score 0-1; any remaining ≥ 2 items are documented for the next pass.

**Acceptance Criteria:**

- [ ] Run `/harness-audit` (the skill restored in commit `392ce76`); capture findings in a comment on issue #213
- [ ] Optionally run `/skill-lint` to score skills for staleness; comment results on #213
- [ ] Expected: most findings score 0-1 because US-001..US-006 just shipped; any score ≥ 2 surfaces future work
- [ ] Run `/prd` against any actionable findings to scaffold a `tasks/<future-pass>/prd.md` (do not commit; dry-run validation only)
- [ ] Confirm `crons/cleanup-tasks.md` (Sunday 23:00) will archive `tasks/architecture-cleanup-pass-1/` next Sunday after `progress.txt` ends with `STATUS: COMPLETE` — no code change needed; existing cron handles it
- [ ] Append `STATUS: COMPLETE` as the final line of `tasks/architecture-cleanup-pass-1/progress.txt` after this story passes (terminates the Ralph loop)
- [ ] Lint passes
- [ ] Tests pass

## Functional Requirements

- FR-1: Each US-NNN story must end with `passes: true` in `prd.json` and a `progress.txt` entry per the format in `tasks/openharness-v07-convergence/prompt.md`
- FR-2: All deletions must be verified-dead via `git ls-files | xargs grep` before staging
- FR-3: Destructive cross-team actions (US-005, US-006) must spawn the critic sub-agent before execution
- FR-4: All commits must follow `<type>: US-<NNN> — <title>` per `.claude/rules/git.md` and the convergence pattern
- FR-5: CHANGELOG entries land in the same commit as the change, under `## [Unreleased]`, in the appropriate `### Removed` / `### Fixed` / `### Changed` subsection
- FR-6: One PR (`audit/213-architecture-cleanup-pass-1` → `development`) collects all stories; no per-story PRs
- FR-7: After every push during this task, invoke `/ci-status` per `.claude/rules/git.md:151`
- FR-8: Final line of `progress.txt` is `STATUS: COMPLETE` only when all 7 stories have `passes: true`

## Non-Goals

- **No new skills.** The `/audit` skill we originally planned is now satisfied by `/harness-audit` (restored in `392ce76`); no orchestrator skill is added in this pass
- **No new cron.** The user explicitly chose on-demand workflow over scheduled audit
- **No new sub-agent.** `.claude/agents/critic.md` covers adversarial review; do not add an "auditor" persona
- **No spec v0.8 bump.** Spec amendments are not part of this pass
- **No deletion of `.devcontainer/docker-compose.cloudflared.yml`, `docker-compose.git.yml`, `docker-compose.gateway.yml`, or any of the 9 overlays** — all have 3-6 live references; none are orphaned
- **No deletion of `install/cloudflared-tunnel.sh` or `install/banner.sh`** — banner is sourced into `~/.bashrc` by `.devcontainer/entrypoint.sh:62` on every container boot; cloudflared-tunnel is the documented one-time named-tunnel setup path
- **No collapse of `.devcontainer/entrypoint.sh` into the Dockerfile** — runtime GID reconciliation must run at container start
- **No deletion of `.claude/plans/`** — gitignored session artifacts (~360 KB); their gitignore entry is correct
- **No manual archive of `tasks/openharness-v07-convergence/`** — `STATUS: COMPLETE` is already there; the existing `crons/cleanup-tasks.md` (Sunday 23:00) handles archival

## Technical Considerations

- **Branch & PR pattern**: one issue (`#213`), one branch (`audit/213-architecture-cleanup-pass-1`), one PR to `development`, one commit per US-NNN story (per the v0.7 convergence pattern at `tasks/openharness-v07-convergence/prd.json`)
- **Pre-commit hook**: `.husky/pre-commit` runs `pnpm run lint && pnpm run test`; CI also runs the same per `.github/workflows/ci-harness.yml`
- **Critic invocation**: per `.claude/rules/advisor-model.md` 3-step variant — call critic via the Task tool with `subagent_type: critic`; include the deletion list, grep evidence, and Risk Assessment scoring rubric in the prompt
- **Ralph runner**: `scripts/ralph.sh architecture-cleanup-pass-1` launches the loop in a tmux session named `architecture-cleanup-pass-1`; idempotent (re-invoking attaches)
- **Story sizing**: each US-NNN must complete in one Ralph iteration (one fresh Claude context); the largest story is US-005 (branch prune) which still fits per the convergence's 17-story precedent

## Success Metrics

- All 7 stories pass; CI green on `audit/213-architecture-cleanup-pass-1` after each push
- `du -sh .worktrees/` drops from ~470 MB to ≤ 100 MB
- `git ls-remote origin | wc -l` decreases by the prune count from US-005
- `/harness-audit` against the post-cleanup codebase scores 0-1 across catalog items it can measure
- One PR merged to `development`; the existing weekly cleanup cron archives `tasks/architecture-cleanup-pass-1/` to `tasks/archive/<date>/` the following Sunday

## Open Questions

- US-006: should #131 (deepagents-cli) and #69 (web-UI) be closed or labeled `v0.8`? Critic decides per `.claude/ICP.md` content during the iteration
- US-005: critic may flag specific branches as "preserve" — those stay; commit body documents the carve-out
- US-003: `install/tmux-agent.sh` (358 bytes) — keep or delete? Critic-driven decision based on grep evidence during the iteration
