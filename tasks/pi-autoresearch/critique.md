# Critique: Pi Autoresearch Support

## Implementer Critic
- [HIGH] PRD initially considered restoring the already-documented `@narumitw/pi-codex-usage` package pin while adding `pi-autoresearch`, but the maintainer clarified that `pi-codex-usage` should not be added back — `.pi/settings.json`, `docs/harnesses/pi.md` — Mitigation: US-001 now explicitly forbids re-adding `@narumitw/pi-codex-usage`; docs and tests align with the package list.
- [MEDIUM] Package-list ordering was underspecified — PRD FR-3 / US-001 — Mitigation: US-001 now constrains the list through the settings regression test while keeping `@narumitw/pi-codex-usage` absent.
- [MEDIUM] Documentation requirements relied on inferred upstream command names and shortcuts — PRD US-003 — Mitigation: US-003 now requires verification against upstream `pi-autoresearch@1.6.0` README/package manifest.
- [LOW] Interactive Pi verification may require trust/session state not guaranteed in CI — PRD US-003 — Mitigation: docs include interactive verification, while CI proof relies on package metadata, settings tests, typecheck, and docs build.
- [LOW] Pre-existing validation failures could be hand-waved — PRD Success Metrics — Mitigation: final audit must report exact command outputs and distinguish changed-file-related failures from unrelated baseline failures.

## User Critic
- [HIGH] Acceptance criteria did not prove fresh sandbox / no manual install outcome — issue #239 Acceptance Criteria — Mitigation: US-001 pins the project package; US-003 documents `pi list --approve` and package checks as the fresh trusted-project verification path.
- [MEDIUM] Opt-out/idempotent enablement requirement was dropped — issue #239 Acceptance Criteria — Mitigation: docs explain project package behavior and troubleshooting; no user config or agent auth is clobbered because the integration does not copy files into `~/.pi/agent/`.
- [MEDIUM] Token-spend guardrails were documentation-only while the issue requested a sane `maxIterations` default — PRD US-003 / Non-Goals — Mitigation: v1 keeps `.auto/` session-local, documents a copyable `maxIterations: 20` cap, and does not commit a default session file that would be ignored or misleading.
- [MEDIUM] Dashboard verification was documentation-only — issue #239 Acceptance Criteria — Mitigation: docs name dashboard surfaces verified from upstream; full render verification remains manual/interactive because it depends on Pi TUI mode.
- [LOW] Success metrics weakened pass/fail proof — PRD Success Metrics — Mitigation: final audit must cite actual local validation.

## Synthesis
All HIGH findings are mitigated in the PRD and implementation plan: keep the Codex usage package absent per maintainer direction, make the package list test authoritative, and document verification for fresh trusted Pi sessions. The user's added overlap concern is captured as US-004: the docs must compare `pi-autoresearch` with `/autopilot`, identify autonomy/git/benchmark overlap, and explicitly state that v1 does not wire autoresearch into `/autopilot`, `/benchmark`, `/eval`, or `/ship-spec`.
