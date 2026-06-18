# Ralph iteration — make-harness-audit-load-shared-memory

You are one iteration of a Ralph loop implementing `make-harness-audit-load-shared-memory`.

## Context

- PRD: `tasks/make-harness-audit-load-shared-memory/prd.md`
- Structured stories: `tasks/make-harness-audit-load-shared-memory/prd.json`
- Critique: `tasks/make-harness-audit-load-shared-memory/critique.md`
- Branch: `feat/432-make-harness-audit-load-shared-memory`
- Issue: #432

## Critical rules

- Harness-infra only.
- Preserve source inspection against `AUDIT_ROOT`; move only the long-term memory tail to `AUDIT_LOG_ROOT`.
- Run the relevant eval probe and the full `/eval` runner before finalizing.
