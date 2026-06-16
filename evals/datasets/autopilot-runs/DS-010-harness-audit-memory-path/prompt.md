# Trajectory input

## fix: correct harness-audit memory path

## Finding

`/harness-audit` tails `MEMORY.md` at the repo root, but the long-term memory file lives at `memory/MEMORY.md`. Empty-queue autopilot research therefore misses the most durable lessons and can select work without the intended historical context.

## First-principles rationale

Autopilot selection depends on `/harness-audit` when the issue queue is empty. Its context snapshot is supposed to load recent long-term memory before auditors rank findings. A broken path quietly removes that signal, degrading every research-mode run. The fix is small, harness-infra-only, and directly improves the loop's selection quality.

## Plan sketch

- Update `.claude/skills/harness-audit/SKILL.md` to read/tail `memory/MEMORY.md` instead of root `MEMORY.md`.
- Check for any other stale root-memory references in the harness-audit skill and align them to the tracked layout.
- Add or update an eval probe that fails if harness-audit points at the nonexistent root `MEMORY.md` path.
- Run the probe suite or the targeted eval check to verify the guard is green.
- Add a CHANGELOG entry under `## [Unreleased]` describing the harness-audit memory-path fix.

## Research evidence

- PM auditor finding: `[MEMORY] [SEVERITY:H] [EFFORT:S] /harness-audit tails nonexistent root MEMORY.md; autopilot research can miss long-term lessons. Fix to memory/MEMORY.md + add probe.`
- Evidence path: `.claude/skills/harness-audit/SKILL.md:74` references `/home/sandbox/harness/MEMORY.md`.
- Repo layout: long-term memory is `memory/MEMORY.md`.

## Provenance

This ticket was research-selected by the autopilot loop, not requested by a human. When the `autopilot` issue queue is empty, the loop runs first-principles `/harness-audit` research and files its own `autopilot`-labelled ticket from the top-ranked finding, then builds that same ticket. Issue #176 is one such self-filed ticket: its body is the audit finding plus a plan sketch, in the loop's own voice.
