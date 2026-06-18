# PRD: Pi Autoresearch Support

## 1. Introduction/Overview

Integrate the upstream `pi-autoresearch` Pi package as a default Open Harness Pi capability. The package provides an autonomous optimization loop for Pi: initialize an experiment, run a benchmark, log the result, keep wins, revert losses, and repeat with dashboard visibility. Open Harness should load it through Pi's project-local package mechanism, document operator use, and keep experiment scratch files out of git.

## 2. Goals

- Make `pi-autoresearch` available in fresh trusted Open Harness Pi sessions without manual install.
- Prefer package pinning over vendoring to minimize maintained third-party code.
- Document safe use, verification, dashboard controls, and token-spend guardrails.
- Ignore `.auto/` runtime state so experiments do not pollute commits.
- Preserve existing Pi package behavior and tests.

## 3. User Stories

### US-001: Pin pi-autoresearch as a default Pi package

**Description:** As a harness operator, I want `pi-autoresearch` to load from project-local Pi settings so fresh sandboxes can use autoresearch without manual package installation.

**Acceptance Criteria:**

- [ ] `.pi/settings.json` includes `npm:pi-autoresearch@1.6.0` in the default `packages` list.
- [ ] `.pi/extensions/__tests__/settings.test.ts` expects the new package pin without re-adding `@narumitw/pi-codex-usage`.
- [ ] The implementation uses Pi's package install path instead of vendoring upstream source into `.pi/extensions/`.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-002: Ignore autoresearch scratch state

**Description:** As a harness maintainer, I want `.auto/` session files to stay local so optimization-loop logs, benchmark scripts, and configs are not accidentally committed.

**Acceptance Criteria:**

- [ ] `.gitignore` ignores `**/.auto/` or an equivalent pattern that covers project-root and nested autoresearch sessions.
- [ ] The ignore rule does not hide tracked documentation or package settings.
- [ ] Tests pass.

### US-003: Document pi-autoresearch integration

**Description:** As a harness operator, I want a dedicated integration guide so I know how to start, cap, verify, and troubleshoot autoresearch sessions.

**Acceptance Criteria:**

- [ ] `docs/integrations/pi-autoresearch.md` explains what package is loaded and why package pinning was chosen.
- [ ] The guide documents `/skill:autoresearch-create`, `/autoresearch export`, `/skill:autoresearch-finalize`, and dashboard/shortcut behavior.
- [ ] The guide documents `.auto/` files, including `prompt.md`, `measure.sh`, `log.jsonl`, optional `checks.sh`, hooks, and `.auto/config.json`.
- [ ] The guide includes a sane `maxIterations` example and warns that long-running loops spend tokens until capped or stopped.
- [ ] The guide includes verification commands for `pi list`, `pi -e npm:pi-autoresearch@1.6.0`, or equivalent package checks.
- [ ] Docs build passes or the changed docs are otherwise syntax-checked.

### US-004: Assess overlap with `/autopilot`

**Description:** As a harness maintainer, I want the integration to explicitly compare `pi-autoresearch` with `/autopilot` so Open Harness does not ship two ambiguous autonomous optimization loops.

**Acceptance Criteria:**

- [ ] `docs/integrations/pi-autoresearch.md` includes a section comparing `pi-autoresearch` and `/autopilot`.
- [ ] The comparison states that `/autopilot` is the harness-infra self-improvement runner that selects issues, builds PRs, runs eval/CI/PR gates, and respects autopilot caps.
- [ ] The comparison states that `pi-autoresearch` is an operator-invoked experiment loop for metric optimization inside a selected working directory.
- [ ] The comparison identifies overlap around benchmark-driven keep/revert decisions, long-running autonomy, token spend, and git mutations.
- [ ] The comparison declares v1 non-integration: `pi-autoresearch` does not replace `/autopilot`, `/benchmark`, `/eval`, or `/ship-spec` in this PR.
- [ ] The comparison names follow-on questions for whether `pi-autoresearch` can back future `/benchmark` experiments.

### US-005: Cross-link from Pi harness docs and changelog

**Description:** As a reader of the main Pi harness docs, I want the default package list and changelog to mention autoresearch so the new capability is discoverable.

**Acceptance Criteria:**

- [ ] `docs/harnesses/pi.md` lists `pi-autoresearch` among default Pi packages and links to the integration guide.
- [ ] `docs/installation.md` default package summary includes `pi-autoresearch`.
- [ ] `CHANGELOG.md` records the new default Pi autoresearch package support under `[Unreleased]`.
- [ ] Tests pass.

## 4. Functional Requirements

- FR-1: The system must load `pi-autoresearch` through `.pi/settings.json` project packages.
- FR-2: The package pin must be exact (`npm:pi-autoresearch@1.6.0`) to keep fresh-sandbox behavior reproducible.
- FR-3: The package list regression test must fail if the pin is removed or reordered unexpectedly.
- FR-4: `.auto/` runtime state must be ignored by git.
- FR-5: Documentation must describe the token-spend cap via `.auto/config.json maxIterations`.
- FR-6: Documentation must state that Pi installs missing project packages automatically after trust.
- FR-7: Documentation must identify `pi-autoresearch` as operator-facing and not yet a replacement for the harness `/benchmark` node.
- FR-8: Documentation must assess overlap with `/autopilot` before recommending operational use.

## 5. Non-Goals (Out of Scope)

- Vendoring or modifying upstream `pi-autoresearch` source.
- Wiring `pi-autoresearch` into `/benchmark` or `/autopilot` control flow.
- Running an unattended autoresearch optimization loop as part of this PR.
- Adding a default `.auto/config.json` to the repository; `.auto/` is session-local scratch state.

## 6. Design Considerations

- Place the detailed runbook under `docs/integrations/` beside `slack.md` and `github.md`.
- Keep the main `docs/harnesses/pi.md` package list compact; deep operational detail belongs in the integration page.
- Follow Pi package docs: project `.pi/settings.json` packages auto-install on startup after project trust.
- Treat `/autopilot` overlap as a design-risk section, not a hidden assumption. The first integration should expose the package and document boundaries; it should not silently route scheduled self-improvement through a new loop.

## 7. Technical Considerations

- Upstream `pi-autoresearch@1.6.0` declares `pi.extensions: ["./extensions"]` and `pi.skills: ["./skills"]`, so Pi's package loader should discover both the extension and skills.
- The package declares peer dependencies on Pi core packages and `@sinclair/typebox`; these are available in the Pi runtime / harness root dependencies.
- The upstream package requires Node >=22; the harness environment inventory lists Node 22.22.2.

## 8. Success Metrics

- `pnpm test -- .pi/extensions/__tests__/settings.test.ts` passes.
- `pnpm format:check` and `pnpm typecheck` pass or failures are shown to be pre-existing/unrelated.
- `pnpm docs:build` passes for the new documentation.
- `npm view pi-autoresearch@1.6.0` confirms the package manifest exposes Pi extension and skill resources.

## 9. Open Questions

- Should a future PR add a harness-owned starter template for `.auto/config.json`, or is documentation enough for v1?
- Should `/benchmark` eventually delegate exploratory optimization tasks to pi-autoresearch after the package is proven in operator use?
- Should `/autopilot` ever call pi-autoresearch for benchmark-improvement tickets, or should the two loops remain separate because `/autopilot` owns issue/PR/eval governance?
