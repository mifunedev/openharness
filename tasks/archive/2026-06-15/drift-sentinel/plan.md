# Plan — drift-sentinel (`/drift-check` skill + heartbeat integration)

## Feature description

Add `/drift-check` skill detecting framework (origin↔upstream), branch-behind/append-file, and cron-staleness drift, with heartbeat integration. Read-only / detect-and-report only — never mutates git or host state.

## Context / motivation (instance-specific)

This repo is a **fork layout**: `origin` = `ryaneggz/openharness` (the working checkout skills run from), `upstream` = `mifunedev/openharness` (canonical). Three drift classes recur and each cost a session this month:

- **Framework drift (origin↔upstream)** — `upstream/development` advances ahead of `origin/development`; framework fixes need forward-sync via `git checkout upstream/development -- <paths>`. Currently noticed only by accident.
- **Branch-behind / append-file drift** — a concurrent session can commit append-only files (`memory/MEMORY.md`, `memory/<date>/log.md`) on the shared checkout and leave HEAD on an unexpected branch (the concurrent-checkout trap). Detection primitives proven: `git branch --show-current`, `git fetch`, `git rev-list --left-right --count`, `git merge-base --is-ancestor`.
- **Host/state drift** — a newly-merged cron stays inert until `scripts/cron-runtime.ts` is restarted on a checkout containing it (the cron boot-load gap). The novel, high-value check: detect `crons/*.md` files newer than the running `system-cron` runtime start time.

## Scope guard

Harness-infra ONLY (skills/rules/docs/scripts/crons/wiki). No sandbox application code. Detect-and-report ONLY — no auto-sync, no auto-pull, no auto-commit, no host mutation.

## Acceptance criteria (implementation plan)

- **AC1 — Skill file exists.** `.claude/skills/drift-check/SKILL.md` exists with YAML frontmatter (`name: drift-check`, `description:` block ending in a `TRIGGER when:` line) and a `## Instructions` section, following the canonical shape of `.claude/skills/ci-status/SKILL.md`.
- **AC2 — Three labeled drift checks.** `## Instructions` contains three clearly labeled sections: **(A) Framework drift (origin↔upstream)**, **(B) Branch-behind / append-file drift**, **(C) Host/state drift (cron-staleness)**. Each section states what it checks, the exact read-only command(s), and the recommended remediation command (printed, never executed).
- **AC3 — Read-only / non-destructive.** Every command in the skill is read-only: no `git pull`, no `git commit`, no `git checkout` that mutates the working tree, no host-mutating commands. Remediation is surfaced as a recommended command string only. The skill explicitly states it never mutates git or host state.
- **AC4 — Framework + host check specifics.** (A) uses `git fetch upstream` then `git rev-list --left-right --count origin/development...upstream/development` and reports "N behind upstream" with the `git checkout upstream/development -- <paths>` remediation. (C) detects `crons/*.md` modified more recently than the `system-cron` runtime start time (via the runtime PID start time from `/proc/<pid>/stat` or the tmux `system-cron` session start) and recommends restarting the runtime. (C) defers deep host (memory/disk) triage to `/health-check` with an explicit cross-reference rather than duplicating it.
- **AC5 — Skills table registration.** The root Skills table (`CLAUDE.md` → `AGENTS.md`) gains exactly one new row for `/drift-check` with a ≤15-word trigger description; table pipe-alignment stays intact.
- **AC6 — Heartbeat integration without violating the allowlist.** `crons/heartbeat.md` gains a new numbered task step that invokes `/drift-check` and surfaces any findings in the log entry and reply as `DRIFT: <summary>`. The `### Permitted validation checks (step 2.5 must use only these)` block stays byte-identical — the new step is distinct from the step-2.5 Active-items allowlist and does not add shell commands to it.
- **AC7 — Changelog.** `CHANGELOG.md` gains one entry under `## [Unreleased] → ### Added` linking the issue/PR, imperative mood, no duplicate.

## Out of scope (Non-Goals)

- Standalone executable detection scripts — the SKILL.md `## Instructions` IS the procedure; no separate `.sh` file.
- Auto-remediation of any drift class (the skill only reports + recommends).
- Modifying `scripts/cron-runtime.ts`.
- Adding entries to the heartbeat `### Permitted validation checks` allowlist.
- A wiki entry for drift-check (possible follow-on, not this PR).
- PRD JSON generation / branch / git ops handled by /ship-spec + /delegate downstream, not authored here.
