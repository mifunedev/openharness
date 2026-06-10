# PRD — Autopilot Loop

> Scaffolded by `/ship-spec` from `.claude/plans/wake-up-every-hour-generic-rocket.md`.
> Prefix: `feat`. Slug: `autopilot-loop`.
> Critic-gated: 7 HIGH findings resolved in-place (see `## Critic-gate mitigations` + `critique.md`).

## Introduction

The orchestrator already owns every primitive of a self-improvement loop — the `pm` agent (`.claude/agents/pm.md`, invoked via the `Agent` tool with `subagent_type: pm`), `/ship-spec` (scaffold issue + branch + prd.json + draft PR), `/delegate` (wave execution), `/harness-audit` (rank findings), `/ci-status` (CI gate), and a cron runtime (`scripts/cron-runtime.ts`) that auto-discovers `crons/*.md`. What is missing is the **closure**: nothing chains these into an unattended Research → Plan → Implement → Audit → Improve cycle that lands a PR. `/ship-spec` v1 deliberately stops at a *draft* PR; the heartbeat cron only checks in.

**Autopilot Loop** adds that closure: an `/autopilot` skill + an hourly `crons/autopilot.md` cron that, each pulse, selects the next harness-infra improvement, builds it through the full pipeline, and finalizes a **ready-for-review** PR with green CI — so the maintainer wakes up to completed work to review.

## Goals

1. An hourly cron (`crons/autopilot.md`) that fires the `/autopilot` skill, reusing the existing runtime with no `cron-runtime.ts` changes.
2. An `/autopilot` skill encoding the full loop: guardrail pre-check → select item → `pm` decompose → `/ship-spec` → `/delegate` → finalize ready PR → memory log.
3. **Hybrid selection**: build the top unchecked item from a curated `crons/autopilot-backlog.md`; if empty, rank live `/harness-audit` output; dedupe against open issues/PRs via a deterministic slug so in-flight work never repeats.
4. **Safe unattended operation**: cap of 2 open `autopilot`-labeled PRs (anti-flood), never auto-merge, harness-infra scope only, and a clean idle path when there is nothing to build.
5. The loop is observable (memory log + `crons/.cron.log` liveness line every run, including skips/halts) and pausable (documented kill switch + emergency stop).

## Non-Goals

- **Auto-merge.** The loop finalizes a *ready* PR; a human reviews and merges.
- **Semantic-correctness guarantee.** CI green (lint/type/test) is the **only** automated quality gate — it does not catch logic/semantic errors. Every ready PR requires human review before merge. Autopilot output is review-grade, not merge-grade.
- **Marking a PR ready when CI is red or `/ci-status` times out.** In that case the PR stays **draft** with an explanatory comment — never ready.
- **Mid-run auto-abort.** Setting `enabled: false` stops the *next* fire; it does not interrupt an in-flight run. Emergency stop is a documented manual procedure (see Technical Notes).
- **Sandbox application code.** Autopilot only ever touches harness infra (skills/rules/docs/scripts/crons/wiki), per the CLAUDE.md orchestrator boundary.
- **Changing `scripts/cron-runtime.ts`** or touching `crons/heartbeat.md`.
- **Building the Drift Sentinel feature** — it is the seeded first backlog *item* the loop will select and build, not part of this PRD's deliverable.
- **Auto-launching the Ralph tmux loop** (`scripts/ralph.sh`) — work is driven via `/delegate`, run to completion in-process.

## User Stories

### US-001 — Seed the curated backlog
**As** the maintainer, **I want** a curated `crons/autopilot-backlog.md` checklist **so that** I can steer what autopilot builds without touching code.
**Acceptance criteria**
- `crons/autopilot-backlog.md` exists as plain markdown with (a) a prominent top comment stating it is a **reference file, not a cron definition** (the runtime must never schedule it), (b) a short format/usage header, and (c) an `## Active items` checklist.
- The file contains **no `schedule:` field**; `grep -c '^---$' crons/autopilot-backlog.md` returns `0`. (Safety mechanism: `cron-runtime.ts` `parseCronFile()` returns null when there is no `schedule:` — the absence of frontmatter is belt-and-suspenders.)
- Each item carries an explicit deterministic `slug:` token used for dedupe (e.g. `- [ ] drift-sentinel — /drift-check skill + heartbeat integration ...`).
- Seeded first item: the Drift Sentinel work (slug `drift-sentinel`), with `(source: memory/MEMORY.md 2026-06-10)`.
- `grep '- \[ \]' crons/autopilot-backlog.md` returns the Drift Sentinel line.

### US-002 — Hourly cron definition
**As** the runtime, **I want** a `crons/autopilot.md` cron **so that** the loop fires every hour automatically.
**Acceptance criteria**
- Frontmatter: `id: autopilot`, `schedule: "5 * * * *"` (offset 5 min from heartbeat's `0 * * * *` to avoid a concurrent-fire write race on the memory log), `timezone: America/Denver`, `enabled: true`, `overlap: false`, `catchup: false`, one-line `description`.
- Body is thin: invokes the `/autopilot` skill plus a one-line guardrail reminder (cap-2, no auto-merge, harness-infra only). It does **not** replicate the skill's procedure.
- `awk '/^---$/{f=!f; next} f{print}' crons/autopilot.md` emits all required fields.
- `crons/heartbeat.md` is unchanged (`git diff --quiet crons/heartbeat.md`).

### US-003 — The `/autopilot` loop skill
**As** the orchestrator, **I want** a `.claude/skills/autopilot/SKILL.md` **so that** the loop procedure is version-controlled, testable on demand, and reusable.
**Acceptance criteria**
- File exists with valid frontmatter (`grep -c '^---$'` == 2) including `name`, `description`, and `argument-hint: [--dry-run]`.
- **`--dry-run` mode**: prints the selected item + the open-`autopilot`-PR count, then exits without calling `/ship-spec` or `/delegate` (the test path that opens no PR).
- Six numbered sections, in order:
  1. **Guardrail pre-check** — exit early if `gh pr list --label autopilot --state open` returns ≥2 (log `SKIPPED-CAP2` + liveness, do **not** run `/harness-audit`); require a clean working tree and current branch `development`.
  2. **Select item** — backlog top-unchecked → else `/harness-audit` fallback (throttled: skip the audit if a `memory/<today>/log.md` autopilot-audit entry is <6h old). Map the chosen item to a deterministic kebab `slug`. **Dedupe**: skip (log `SKIPPED-DEDUPE`) if an open issue/PR title or branch already contains that slug. If **both sources are exhausted / fully deduped**, log `NOTHING-TO-BUILD`, append liveness, and exit 0 without touching git or GitHub.
  3. **pm decompose** — `Agent` tool, `subagent_type: pm`, briefing the selected item (advisor-model 5-field format).
  4. **`/ship-spec`** — scaffold issue + branch + draft PR; add the `autopilot` label to the PR.
  5. **`/delegate`** — execute the prd.json stories **to completion in-process** (do NOT use `run_in_background` for autopilot waves; await all workers before finalize, so `overlap:false` remains a sufficient concurrency guard).
  6. **Finalize** — push; mark ready (`gh pr ready`) **only if** `/ci-status` is green; if CI is red or `/ci-status` times out, leave the PR **draft** + comment. Then **restore branch**: `git checkout development` so the next fire passes the guardrail.
- **Failure compensation**: if `/ship-spec` opened an issue but a later stage (`/delegate`) fails, the skill comments on the issue/PR that autopilot aborted mid-run and leaves it draft (non-destructive); it does not close GitHub state automatically.
- **Halt visibility**: a `/ship-spec` critic-gate HALT writes a distinct `Result: HALT-CRITIC-GATE` memory entry + a `HALT-CRITIC-GATE` liveness line (so an unattended halt is not mistaken for a crash or silent no-op).
- Ensures the `autopilot` GitHub label exists (idempotent create-if-missing) before the cap-2 query.
- Memory-log block (mirrors `skill-lint` shape) AND the mandatory `crons/.cron.log` liveness line — **copy the `printf` FORMAT from `crons/heartbeat.md`** (timestamp + id + status) with autopilot-specific status tokens: `OK`, `SKIPPED-CAP2`, `SKIPPED-DEDUPE`, `NOTHING-TO-BUILD`, `PR-READY`, `PR-DRAFT-CI-RED`, `HALT-CRITIC-GATE`, `DELEGATE-FAIL`.
- States the scope guard "harness-infra only — never sandbox application code" explicitly. No auto-merge instruction anywhere.
- Typecheck passes.

### US-004 — Register the skill in CLAUDE.md
**As** a reader of CLAUDE.md, **I want** an `/autopilot` row in the Skills table.
**Acceptance criteria**
- Exactly one new row in the CLAUDE.md Skills table; the "When" cell is the **first sentence** of the SKILL.md `description` (matching existing rows).
- `git diff CLAUDE.md` shows a single added row and no other changed hunks.

### US-005 — Document the cron + backlog
**As** a reader of `crons/README.md`, **I want** the autopilot cron and backlog documented.
**Acceptance criteria**
- The Scheduled-jobs table gains a row for `autopilot.md` (schedule `5 * * * *`, description, kill-switch note `enabled: false`).
- `autopilot-backlog.md` is documented in prose as a **reference file (curated backlog), explicitly NOT a scheduled job** — it must not appear in the Scheduled-jobs table.
- Both filenames appear (`grep -c 'autopilot' crons/README.md` ≥ 2).

### US-006 — Changelog entry
**As** the release process, **I want** a `[Unreleased]` changelog entry.
**Acceptance criteria**
- One imperative bullet under `## [Unreleased]` → `### Added`, linking the issue/PR.
- No versioned section modified.

## Critic-gate mitigations (HIGH findings → resolution)

| # | HIGH finding | Resolution (AC) |
|---|---|---|
| 1 | Audit-fallback dedupe undefined (no stable slug) → PR flood | US-001 items carry `slug:`; US-003 §2 maps any selection to a deterministic slug and dedupes on it vs open issue/PR titles+branches |
| 2 | cap-2 self-block / no stale recovery, silent skip | US-003 §1 logs `SKIPPED-CAP2` (human-readable) + skips the audit; stale-PR recovery is the human's review (non-destructive by design) |
| 3 | Dangling issue if `/delegate` fails after `/ship-spec` | US-003 failure-compensation: comment + leave draft, log `DELEGATE-FAIL` |
| 4 | `run_in_background` defeats `overlap:false` → concurrent commits | US-003 §5 forbids background waves; delegate runs to completion in-process |
| 5 | Kill switch can't abort a mid-run wave | Non-Goals state no mid-run auto-abort; Technical Notes document the emergency stop |
| 6 | Both-sources-exhausted branch undefined | US-003 §2 explicit `NOTHING-TO-BUILD` → log + exit 0 |
| 7 | Overnight PR quality unbounded | Non-Goals: CI-green is the only automated gate; human review required; ready≠merge |

Refuted: "pm is not a callable" — `.claude/agents/pm.md` exists and is invoked via `Agent subagent_type: pm`.

## Technical Notes

- **Throttle**: `overlap: false` + in-process delegate + cap-2 serialize and bound volume; the `/harness-audit` fallback is throttled to ≤ once / 6h and skipped entirely when capped.
- **Activation** (post-merge, manual): restart the cron runtime (`system-cron` tmux session / `scripts/cron-runtime.ts`) to discover the new cron; create the `autopilot` label.
- **Kill switch**: set `enabled: false` in `crons/autopilot.md` (stops the next fire).
- **Emergency stop (mid-run)**: `tmux kill-session -t system-cron` halts the runtime now; discard an in-flight PR with `gh pr close --delete-branch <N>`.
- **Precedents**: `.claude/skills/health-check/SKILL.md`, `.claude/skills/skill-lint/SKILL.md` (skill shape); `crons/heartbeat.md` (cron shape + closing liveness line).

## Rollout

The first fire **selects** the seeded `drift-sentinel` backlog item and runs the loop on it — scaffolding and shipping it as the loop's first ready PR, proving the cycle end-to-end. (Drift Sentinel is the loop's *output*, not part of this PRD.) Subsequent fires self-select via backlog → throttled `/harness-audit` fallback.
