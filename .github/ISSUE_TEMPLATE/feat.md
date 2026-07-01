---
name: Feature Request
about: Propose a new feature for the harness
title: "[FEAT] "
labels: enhancement
assignees: ""
---

## Summary

<!-- One-sentence description of the feature. -->

## Motivation

<!-- Why is this needed? What problem does it solve? -->

## Proposed Implementation

<!-- Describe the approach. Consider:
  - Which area of the harness does this affect? (.devcontainer/, .oh/install/, .oh/docs/, workspace/ template, .oh/scripts/, .oh/crons/)
  - New skill, rule, or heartbeat needed?
  - Compose overlay change? Dockerfile change?
  - Any new commands or CLI surface?
-->

## Design

<!-- Optional: mockups, wireframes, or ASCII sketches -->

---

> **Git workflow**: see the [/git skill](../../.mifune/skills/git/SKILL.md)

---

## Acceptance Criteria

- [ ] Feature works as described
- [ ] TypeScript strict — no `any` types (where TS applies)
- [ ] Tests added for new logic where applicable
- [ ] Lint + format + type-check pass (`pnpm run lint && pnpm run format:check && pnpm -r run type-check`)
- [ ] Documentation updated under `.oh/docs/` if user-visible
- [ ] PR targets `development` unless the git workflow rule says otherwise
