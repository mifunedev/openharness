# Repo Layout Consolidation — PRD

## Introduction

The repository's self-description has drifted across multiple files since the
v0.7 convergence (which removed `packages/sandbox/`, `workspace/heartbeats/`,
the gateway overlay, and the `/provision` skill). Three independent directory
trees (`docs/architecture/container-runtime.md:80-124`, `AGENTS.md:151-164`,
`README.md:78-85`) describe paths that no longer exist; phantom heartbeat env
vars (`HEARTBEAT_ACTIVE_START`, `HEARTBEAT_ACTIVE_END`, `HEARTBEAT_AGENT`,
`HEARTBEAT_INTERVAL`) appear in both `docs/architecture/container-runtime.md`
and `.devcontainer/.example.env` (the file `install.sh` propagates to every
new installer); `README.md:6` links the croner runtime to a moved spec file
(`.claude/specs/structure-spec-v0.7.md` → actually at
`.claude/specs/archive/`).

This PRD scopes the doc-only audit pass that fixes residual drift, establishes
`docs/architecture/container-runtime.md#repo-layout` as the single canonical
home for the directory tree, and adds a `.claude/rules/repo-layout-source.md`
guard to prevent the next round.

> **Process note**: This PRD was distilled from
> `.claude/plans/we-can-focus-on-cuddly-harp.md`, which captured the output of
> a 2-PM (PRD draft) + 3-critic (completeness / correctness / scope-and-
> maintainability) review cycle. The plan file remains the canonical
> implementation reference; this document is the issue/PR-tracking surface.

## Goals

1. Single canonical repository-tree source: `docs/architecture/container-runtime.md` with a stable `{#repo-layout}` anchor.
2. All other layout-carrying files (`AGENTS.md`, `README.md`, `docs/architecture/overview.md`) reduce to a one-line pointer (or a 3-line prose orientation block in the case of `AGENTS.md`, to preserve agent ambient context).
3. Phantom heartbeat env vars purged from live docs and from the user-facing `.devcontainer/.example.env` template.
4. Broken `README.md:6` croner-runtime link replaced with a stub link to the forthcoming `docs/architecture/crons-and-heartbeats.md` (PR-B target — stub created here so PR-A is internally consistent).
5. New `.claude/rules/repo-layout-source.md` auto-loaded rule documenting the single-source convention so the next contributor doesn't reintroduce a tree.

## Non-goals

- Behavioural changes to `scripts/cron-runtime.ts`, `crons/*.md` bodies, or `.devcontainer/entrypoint.sh` semantics.
- Behavioural `.devcontainer/` edits — the parallel session owns `Dockerfile`, `entrypoint.sh`, compose service definitions. The single doc-layer edit to `.devcontainer/.example.env` (comment block only) is in scope; coordinate merge order if same-line conflicts arise.
- Resurrecting the deleted `docs/heartbeats/{overview,scheduling,examples}.md` three-page set.
- `tasks/archive/` (write-once historical record) and `.worktrees/` (gitignored).
- `blog/archive/2026-04-28-byoh.md` stale references — historical post; deferred to follow-up.
- `context/` content audit (SOUL.md / IDENTITY.md / etc. inline documentation) — the canonical tree adds `context/` as an entry, but the file-by-file audit is a separate task.
- The crons & heartbeats documentation (PR-B / a separate task stacked on this branch).

## Scope — file-by-file

### US-001 — Rewrite the canonical tree in `docs/architecture/container-runtime.md`

- Remove rows for `HEARTBEAT_ACTIVE_START`, `HEARTBEAT_ACTIVE_END`, `HEARTBEAT_AGENT` from the env-vars table at lines 74-75.
- Replace the tree block (lines 80-124) with the canonical tree from the plan file (full content listed there). The new tree:
  - Adds `.codex/`, `.husky/`, `blog/`, `context/`, `tasks/` (top-level dirs the prior tree omitted).
  - Annotates `pnpm-workspace.yaml` correctly: declares `apps/docs` (not glob `apps/*`).
  - References `apps/`, `Makefile`, `.openharness/`, the `.claude/` subtrees, and `scripts/` accurately.
- Add `{#repo-layout}` anchor on the section heading.
- For the `crons/` annotation, mark `# markdown-frontmatter cron defs — see crons doc (PR-B)`. PR-B replaces the `(PR-B)` parenthetical with a real link.

**AC**:
- `git grep -nE 'HEARTBEAT_ACTIVE_START|HEARTBEAT_ACTIVE_END|HEARTBEAT_AGENT|HEARTBEAT_INTERVAL' docs/architecture/container-runtime.md` returns zero hits.
- `git grep -nE 'exposures\.json|Caddyfile|docker-compose\.gateway|packages/sandbox' docs/architecture/container-runtime.md` returns zero hits.
- `grep -n '{#repo-layout}\|repo-layout' docs/architecture/container-runtime.md` returns ≥1 hit.
- For each of `.claude .codex .devcontainer .github .husky .openharness apps blog context crons docs install scripts tasks workspace`, `grep -q "$d" docs/architecture/container-runtime.md` succeeds.

### US-002 — Reduce `AGENTS.md` Project Structure to orientation + pointer

- Replace the fenced tree block at lines 151-164 with a 3-line prose orientation block + canonical pointer + an HTML guard comment marking the canonical source. Exact replacement text in plan file §"AGENTS.md lines 151-164".
- `CLAUDE.md` is a symlink → `AGENTS.md` (verified inodes); editing `AGENTS.md` once is sufficient.

**AC**:
- `awk '/## Project Structure/,/^## [^#]/' AGENTS.md | grep -c '\`\`\`'` returns 0 (no fenced block).
- `grep -q 'CANONICAL LAYOUT SOURCE' AGENTS.md` succeeds.
- `[ -L CLAUDE.md ] && readlink CLAUDE.md` returns `AGENTS.md` (regression check).

### US-003 — Reduce `README.md` Project layout to a pointer + fix broken spec link

- Replace `## Project layout` fenced tree block (lines 78-85) with a one-line pointer to the canonical anchor.
- Change line 6's broken spec link target from `.claude/specs/structure-spec-v0.7.md` (file is at `.claude/specs/archive/structure-spec-v0.7.md`) to `docs/architecture/crons-and-heartbeats.md`. Since PR-A ships before PR-B, create the link target as a one-line stub file with placeholder text "Coming in PR-B" so PR-A is internally consistent. PR-B replaces the stub.

**AC**:
- `awk '/## Project layout/,/^##[^#]/' README.md | grep -c '\`\`\`'` returns 0.
- `git grep -n 'specs/structure-spec-v0.7' README.md` returns zero hits.
- `test -s docs/architecture/crons-and-heartbeats.md` succeeds (stub exists).

### US-004 — Add forward link to the canonical anchor in `docs/architecture/overview.md`

- Append one prose line at the end of the topology section: "For the repository file tree, see [Repo Layout](container-runtime.md#repo-layout)."
- No tree changes; topology diagram untouched.

**AC**:
- `grep -q 'container-runtime.md#repo-layout' docs/architecture/overview.md` succeeds.

### US-005 — Update `.devcontainer/.example.env` comment block

- Replace lines 43-51 (current comments referencing `workspace/heartbeats/`, `HEARTBEAT_AGENT`, `HEARTBEAT_INTERVAL`) with a comment that points at the live `crons/` model and to PR-B's forthcoming `docs/architecture/crons-and-heartbeats.md`.
- Remove the phantom env vars from the example.

**AC**:
- `git grep -nE 'HEARTBEAT_AGENT|HEARTBEAT_INTERVAL|workspace/heartbeats' .devcontainer/.example.env` returns zero hits.

### US-006 — Verify `.gitignore:22` orphan glob and remove if confirmed orphaned

- Confirm `**/heartbeat.log` is no longer needed (the runtime writes `crons/cron.log`, already covered by other patterns and/or by the broader `crons/*.log` if that exists).
- If orphaned: remove the line.
- If still load-bearing: leave with a comment explaining why.

**AC**:
- Either `git grep -n 'heartbeat\.log' .gitignore` returns zero hits OR a clarifying comment explains why the line was kept.

### US-007 — Drift cleanup in workspace docs

- `docs/guide/workspace.md` line 22: remove `heartbeats/` entry from the workspace template description (it no longer exists in `workspace/`).
- `docs/guide/uat-testing.md` line 166: remove the `heartbeats/uat-report.md` path reference, replacing with the current artifact path or dropping the line.

**AC**:
- `git grep -nE '(^|[^a-z])heartbeats/' -- 'docs/guide/workspace.md' 'docs/guide/uat-testing.md'` returns zero hits.

### US-008 — Add `.claude/rules/repo-layout-source.md`

- New file with the contents specified in the plan file §"New rule: .claude/rules/repo-layout-source.md".
- Auto-loaded per `CLAUDE.md:14` mentioning that `.claude/rules/*.md` files load automatically. Same shape as the existing `.claude/rules/git.md` and `.claude/rules/sandbox-processes.md`.

**AC**:
- `test -s .claude/rules/repo-layout-source.md` succeeds.
- The rule file mentions: the canonical anchor path, the do-not list (no trees in AGENTS.md / CLAUDE.md / README.md / docs / etc.), and the rationale (three drifted copies before this rule).

### US-009 — CHANGELOG entry

- Add `### Changed` block under `## [Unreleased]` per the wording in the plan file §"PR-A CHANGELOG entry".

**AC**:
- `awk '/## \[Unreleased\]/,/^## \[/' CHANGELOG.md | grep -q 'Consolidate repository layout'` succeeds.

## Critique synthesis

The plan from which this PRD was distilled went through a 3-critic review cycle (completeness / correctness / scope-and-maintainability). High-severity findings from those critics are already folded into the user stories above:

- **Completeness (Critic-1)**: bare `heartbeats/` (not just `workspace/heartbeats`) prefix; `.devcontainer/.example.env` was missed by the original PM-1 scope; phantom env-var rows in container-runtime.md; missing top-level dirs (`.codex/`, `.husky/`, `blog/`).
- **Correctness (Critic-2)**: `pnpm-workspace.yaml` declares only `apps/docs` (not glob); README spec link is broken (file is in `archive/`); `CLAUDE.md` → `AGENTS.md` symlink confirmed by inode check.
- **Scope/maintainability (Critic-3)**: `AGENTS.md` reduction to pure pointer harms agent ambient context — keep a 3-line prose orientation block instead; pull `README.md` into PR-A scope (it's a third tree copy and high-visibility); add `.claude/rules/repo-layout-source.md` to prevent re-drift.

No `[PROTECTED-PATH]` violations. No high-severity findings remain unmitigated. **Recommendation: PROCEED.**

## Risks

- **Parallel `.devcontainer/` session**: another session is editing `.devcontainer/` files. Coordinate merge order; this PR touches only `.devcontainer/.example.env` (a comment block). If same-line conflicts arise, merge after the other session lands.
- **Stub link in PR-A**: `docs/architecture/crons-and-heartbeats.md` ships as a one-line placeholder; PR-B replaces it. If PR-B is delayed, the stub remains and the README link points at a placeholder doc. Acceptable interim; tracked in the issue body.
- **Auto-load rule not enforced**: `.claude/rules/*.md` loads in Claude Code sessions but not in human PR review. A CI grep check enforcing single-source layout is a follow-up, not in this PR.
- **`AGENTS.md` 3-line orientation drifts independently**: the orientation summary mentions `scripts/`, `crons/`, `.devcontainer/`, `workspace/` by name; if those are renamed, the summary becomes wrong. Mitigation: keep summary structural, not detailed; canonical tree carries the detail.
