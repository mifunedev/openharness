<!-- 
REFERENCE FILE — NOT A CRON DEFINITION
This file is a curated backlog of harness-infrastructure improvements.
The /autopilot loop reads this file to select the next item to build.
Do NOT modify or delete this comment — it is the safety marker.
-->

# Autopilot Backlog

## Usage

This file is a curated checklist of harness-infrastructure work items. The `/autopilot` skill reads the top unchecked item (`- [ ]`) and builds it. Each item:

- Starts with a `slug:` token (kebab-case, deterministic, used for deduplication against open issues/PRs)
- Carries a brief description of the work
- Includes a source attribution (`source: <what-added-it>`)

Format: `- [ ] <slug>: <description> (source: <source-attribution>)`

Checked items (`- [x]`) are considered done and may be removed or archived by hand.

## Active items

- [ ] drift-sentinel: /drift-check skill + heartbeat integration detecting framework (origin↔upstream), branch-behind append-file, and host/state drift (source: memory/MEMORY.md 2026-06-10)
