# Implementation Prompt — one-click-deploy

Issue: #553 (`feat: add one-click hosted deployment from README`)
Branch: `feat/553-one-click-deploy`

Implement the PRD in `tasks/one-click-deploy/prd.md`:

1. Add a README one-click hosted deploy entry point for Railway.
2. Add Railway config-as-code and deploy assets for a smoke-testable hosted mode.
3. Document Railway requirements, secrets, persistence, and limitations.
4. Add an eval probe that guards the README/config/docs/startup contract.
5. Verify the probe and relevant docs/config checks.
