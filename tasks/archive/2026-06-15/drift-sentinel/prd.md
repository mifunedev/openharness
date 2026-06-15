# PRD: drift-sentinel — `/drift-check` skill + heartbeat integration

## Introduction

The harness runs from a **fork** (`origin` = `ryaneggz/openharness`) while the canonical framework lives **upstream** (`mifunedev/openharness`). Three classes of "drift" recur and each has already cost a session this month, because nothing surfaces them proactively:

1. **Framework drift** — `upstream/development` advances ahead of `origin/development`, so framework fixes silently miss the fork until noticed by accident.
2. **Branch-behind / append-file drift** — a concurrent session commits append-only files (`memory/MEMORY.md`, `memory/<date>/log.md`) on the shared checkout and leaves HEAD on an unexpected branch (the concurrent-checkout trap).
3. **Host/state drift** — a newly-merged cron stays inert until `scripts/cron-runtime.ts` is restarted on a checkout containing it (the cron boot-load gap).

This feature adds a read-only `/drift-check` skill that detects and **reports** all three (never auto-remediates), plus a heartbeat step so the hourly pulse surfaces drift automatically.

## Goals

- Provide a single `/drift-check` skill that reports all three drift classes with a recommended (never executed) remediation command for each.
- Make every check **non-destructive**: no commit, push, reset, merge, working-tree-mutating checkout, or host mutation. (Read-only is defined precisely in Technical Considerations — `git fetch` of remote-tracking refs is permitted as non-destructive.)
- Wire `/drift-check` into the hourly heartbeat so drift surfaces as `DRIFT: <summary>` without violating the heartbeat's step-2.5 permitted-checks allowlist and without bloating clean pulses.
- Register the skill in the root Skills table, add it to `protected-paths.txt`, and record the change in the changelog.

## User Stories

### US-001: Author the `/drift-check` skill

**Description:** As the orchestrator, I want a `/drift-check` skill that detects framework, branch-behind, and cron-staleness drift so I can catch silent divergence before it costs a session.

**Acceptance Criteria:**

- [ ] `.claude/skills/drift-check/SKILL.md` exists with YAML frontmatter: `name: drift-check` and a `description:` block whose final line is a `TRIGGER when:` clause, following the canonical shape of `.claude/skills/ci-status/SKILL.md`.
- [ ] The `## Instructions` section contains three clearly labeled subsections; `grep -cE '^### \((A|B|C)\)' .claude/skills/drift-check/SKILL.md` returns `3`: **(A) Framework drift (origin↔upstream)**, **(B) Branch-behind / append-file drift**, **(C) Host/state drift (cron-staleness)**.
- [ ] **Section (A)**: preflight `git remote get-url upstream` — if it exits non-zero, surface `DRIFT-CHECK: upstream remote not configured — framework drift cannot be checked` and skip the rest of (A). Otherwise wrap the fetch in a timeout (`timeout 15s git fetch upstream` or equivalent); on fetch failure/timeout surface `DRIFT-CHECK: upstream fetch failed (offline/timeout) — framework drift unknown`. On success run `git rev-list --left-right --count origin/development...upstream/development`, report "N behind upstream", derive the changed paths with `git diff --name-only origin/development...upstream/development`, and print the remediation `git checkout upstream/development -- <those-paths>` (as a recommendation, never executed). The skill must NOT recommend a pathless `git checkout upstream/development --`.
- [ ] **Section (B)**: uses `git branch --show-current`, `git fetch origin` (timeout-wrapped, offline-safe like (A)), `git rev-list --left-right --count HEAD...origin/<branch>`, and `git status --porcelain`; reports behind/ahead counts, a dirty-tree warning, and an unexpected-branch warning. The **expected branch is `development`**; any other branch is flagged as unexpected UNLESS it matches `^(feat|fix|task|audit|skill|agent)/` (a legitimate work branch).
- [ ] **Section (C)**: determines the running `system-cron` runtime start time, preferring the PID in `crons/.pid` via `/proc/<pid>/stat` (field 22 + `/proc/stat` btime); if `/proc/<pid>/stat` is inaccessible (PID namespace / non-Linux), FALL BACK to the `system-cron` tmux session creation time (`tmux display-message -p '#{session_created}'`), and if neither is available surface `DRIFT-CHECK: cron runtime start time unavailable — restart runtime if a cron was recently merged` and skip the comparison. When a start time is obtained, report any `crons/*.md` with mtime strictly after it as "inert until runtime restart" and recommend restarting the `system-cron` runtime. Section (C) defers deep host (memory/disk) triage to `/health-check` with an explicit cross-reference.
- [ ] **Read-only guarantee**: the file contains no `git commit`, `git push`, `git pull`, `git reset`, `git merge`, `git rebase`, or working-tree-mutating `git checkout`/`git restore`, and no host-mutating command; `git fetch` (remote-tracking-ref update only) is the sole permitted write and is non-destructive. The skill states explicitly that it never mutates local branches, the working tree, committed history, or host state.
- [ ] **Output contract**: the skill prints a one-line-per-class summary; when a class is clean it prints a single `OK` token for that class (no multi-line block), so a clean run is compact.
- [ ] Pre-commit hook (lint + tests) passes.

### US-002: Register `/drift-check` in the Skills table and protected-paths

**Description:** As the orchestrator, I want `/drift-check` listed in the root Skills table and protected from accidental deletion, since the heartbeat now depends on it.

**Acceptance Criteria:**

- [ ] The root Skills table (in the project-instructions file the root `CLAUDE.md` resolves to — `AGENTS.md`) gains exactly one new row for `/drift-check` with a trigger description of ≤15 words; `grep -c '`/drift-check`' AGENTS.md` returns `1` (matches the table-row backtick syntax, not incidental prose).
- [ ] Existing table rows are unchanged and Markdown pipe-alignment / table validity is preserved (AGENTS.md is session-load-bearing — a malformed table would corrupt skill discovery for every future session).
- [ ] `.claude/protected-paths.txt` gains a bare `drift-check` entry under the `# --- Orchestrator skills` section (per the file header: ship a new orchestrator-load-bearing skill → add it here in the same PR).
- [ ] Pre-commit hook (lint + tests) passes.

### US-003: Integrate `/drift-check` into the heartbeat

**Description:** As the orchestrator, I want the hourly heartbeat to run `/drift-check` and surface findings so drift is caught automatically without me remembering to check.

**Acceptance Criteria:**

- [ ] `crons/heartbeat.md` gains a new task step **numbered 2.7 (inserted after step 2.5 and before step 3)** that invokes `/drift-check` and instructs the heartbeat to surface any findings in the log entry and in the reply as `DRIFT: <summary>`. When `/drift-check` reports all classes clean, the heartbeat appends **nothing extra** — the existing `HEARTBEAT_OK` reply is unchanged (no per-pulse drift block on clean runs).
- [ ] The `### Permitted validation checks (step 2.5 must use only these)` block in `crons/heartbeat.md` is byte-identical to its pre-edit content (the new step is distinct from the step-2.5 Active-items allowlist and adds no shell commands to it).
- [ ] The new step references `/drift-check` by name and does not duplicate the skill's command logic inline.
- [ ] **Additive-only change note** (protected path): `crons/heartbeat.md` is a protected path, but this story only APPENDS a step and preserves all existing content (no deletion/deprecation); rollback is a plain `git revert` of the heartbeat commit. No content is removed.
- [ ] Pre-commit hook (lint + tests) passes.

### US-004: Record the change in the changelog

**Description:** As the orchestrator, I want the changelog to note the new skill so the release notes capture it.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` gains one entry under `## [Unreleased] → ### Added` describing the `/drift-check` skill + heartbeat integration, in imperative mood, including a valid `([#N](url))` link to the tracking issue or PR (no placeholder text — this story runs after the issue number is known).
- [ ] No duplicate changelog entry is introduced; the `### Added` subheading is created under `[Unreleased]` only if it does not already exist.
- [ ] Pre-commit hook (lint + tests) passes.

## Functional Requirements

- FR-1: The system must provide a `/drift-check` skill at `.claude/skills/drift-check/SKILL.md`.
- FR-2: The skill must report framework drift via `git rev-list --left-right --count origin/development...upstream/development` after a guarded, timeout-wrapped, offline-safe `git fetch upstream` (preceded by an `upstream`-remote existence check).
- FR-3: The skill must report branch-behind/append-file drift (behind/ahead counts, dirty tree, unexpected branch relative to `development`/work-branch patterns) using read-only git plumbing.
- FR-4: The skill must report cron-staleness drift by comparing `crons/*.md` mtimes against the running `system-cron` runtime start time, with a tmux-session-time fallback and a graceful "unavailable" message when neither source resolves.
- FR-5: The skill must, for every detected drift, print a recommended remediation command WITHOUT executing it, and must never emit a destructive command (e.g. pathless `git checkout upstream/development --`).
- FR-6: The skill must contain no history-, working-tree-, or host-mutating command; `git fetch` (remote-tracking refs only) is the sole permitted write and is non-destructive.
- FR-7: The heartbeat (`crons/heartbeat.md`) must invoke `/drift-check` in new step 2.7 and surface findings as `DRIFT: <summary>`, append nothing on a clean run, and leave the step-2.5 permitted-checks block byte-identical.
- FR-8: The skill must be registered once in the root Skills table.
- FR-9: A `CHANGELOG.md` `[Unreleased] → ### Added` entry must record the change with a valid issue/PR link.
- FR-10: `.claude/protected-paths.txt` must list `drift-check` under the orchestrator-skills section.

## Non-Goals (Out of Scope)

- Standalone executable detection scripts — the SKILL.md `## Instructions` IS the procedure; no separate `.sh` file is created.
- Auto-remediation of any drift class (the skill only reports + recommends commands).
- Modifying `scripts/cron-runtime.ts`.
- Adding entries to the heartbeat `### Permitted validation checks` allowlist.
- Cross-platform (non-Linux) support: cron-staleness detection targets the Linux sandbox (`/proc` + tmux); a non-Linux host gets a graceful "unavailable" message, not a working check.
- Machine-readable (JSON) output mode — v1 surfaces a human-readable summary only.
- A wiki entry for drift-check (possible follow-on, not this PR).
- Any change to sandbox application code (Python modules, APIs, business logic).

## Technical Considerations

- **"Read-only" definition**: for this skill, read-only means **no mutation of local branches, the working tree, committed history, the remote, or host state** — i.e. none of `commit/push/pull/reset/merge/rebase`, no working-tree-mutating `checkout`/`restore`, no host writes. `git fetch` updates only remote-tracking refs (`refs/remotes/*`) + `FETCH_HEAD` and is treated as non-destructive; it is the single permitted write and is guarded (existence check), timeout-wrapped, and offline-safe.
- **Fork layout**: `origin` = `ryaneggz/openharness`, `upstream` = `mifunedev/openharness`. The `upstream` remote currently exists, but Section (A) preflights it rather than assuming.
- **Canonical skill shape**: mirror `.claude/skills/ci-status/SKILL.md` for frontmatter + `## Instructions` structure.
- **Cron runtime**: `scripts/cron-runtime.ts` runs in the `system-cron` tmux session and `loadCrons()` once at boot, so a merged cron is inert until restart. The staleness check compares file mtime against the runtime process start time (`crons/.pid` → `/proc/<pid>/stat`), with a `tmux '#{session_created}'` fallback for PID-namespace/non-Linux cases. NOTE: after US-003 edits `crons/heartbeat.md`, the staleness check will (correctly) report the heartbeat cron as inert-until-restart — this is the exact boot-load drift the skill exists to surface, cleared by restarting the runtime.
- **Heartbeat allowlist**: `crons/heartbeat.md` step 2.5 restricts Active-items resolution to an enumerated `gh`/date allowlist. The `/drift-check` invocation is a separate step (2.7) so it does not appear to extend that allowlist.
- **Timing budget**: the heartbeat runs `overlap:false`; the upstream/origin fetches are timeout-wrapped so a slow/stalled fetch cannot block the next hourly tick.
- **Symlink**: the root `CLAUDE.md` resolves to `AGENTS.md`; edit the canonical file to update the Skills table.

## Success Metrics

- Running `/drift-check` on a deliberately-behind checkout reports the correct behind count and remediation command (with real paths, not a placeholder).
- A heartbeat pulse surfaces `DRIFT:` when drift exists and leaves `HEARTBEAT_OK` unchanged when clean.
- No history-/working-tree-/host-mutating command appears anywhere in `.claude/skills/drift-check/SKILL.md`.
- Running the skill offline (no network) produces a graceful "framework drift unknown" message rather than an error.

## Open Questions

- Whether `/drift-check` should eventually gain a machine-readable (JSON) output mode for programmatic heartbeat consumption — deferred; v1 surfaces a human-readable `DRIFT: <summary>` line.

## Critique Resolution

Two critics (implementer + user lens) reviewed the pre-revision PRD; see `critique.md`. Six high-severity findings were raised: five distinct issues (expected-branch definition, `git fetch` read-only semantics + offline/timeout safety, cron-PID namespace fallback, and the heartbeat zero-drift output contract) were mitigated in-place by tightening the acceptance criteria above; the sixth (a `[PROTECTED-PATH]` flag on `crons/heartbeat.md`) was determined a **false positive** — the protected-paths policy scopes protection to *deletion or deprecation*, and US-003 is additive-only and preserves the protected step-2.5 block byte-identical (an explicit additive-only + `git revert` rollback note was added to US-003 for transparency). All medium/low findings were mitigated or explicitly acknowledged (notably, the heartbeat self-trip on the cron-staleness check is correct-by-design drift). The critique additionally surfaced a real scope gap — per the `protected-paths.txt` header, a new orchestrator-load-bearing skill must be added to that file in the same PR — now captured as US-002 / FR-10. **Recommendation: PROCEED** (no unmitigated high-severity finding remains).
