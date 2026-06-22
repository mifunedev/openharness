---
name: Bug Report
about: Report something that is broken
title: "[BUG] "
labels: bug
assignees: ""
---

## Description

<!-- What is broken? -->

## Steps to Reproduce

1. <!-- Step 1 -->
2. <!-- Step 2 -->
3. <!-- Step 3 -->

## Expected Behavior

<!-- What should happen? -->

## Actual Behavior

<!-- What happens instead? -->

## Environment

- **Checkout / branch**: <!-- git branch --show-current; git rev-parse --short HEAD -->
- **Sandbox / container**: <!-- make ps / docker compose ps / container name -->
- **Agent runtime**: <!-- claude, pi, codex, cron, or other relevant harness runtime -->
- **Command or workflow**: <!-- make target, script, skill, cron, or GitHub workflow that failed -->
- **Host context**: <!-- OS, Docker version, browser only if UI/browser behavior is involved -->

---

> **Git workflow**: see the [/git skill](../../.mifune/skills/git/SKILL.md)

---

## Acceptance Criteria

- [ ] Bug is fixed and no longer reproducible
- [ ] Regression test or eval probe added where practical
- [ ] Relevant lint, type-check, test, or probe commands pass
- [ ] Verified via agent-browser only when there is a deployed URL to check
- [ ] No regressions introduced
- [ ] PR targets `development` unless the git workflow rule says otherwise
