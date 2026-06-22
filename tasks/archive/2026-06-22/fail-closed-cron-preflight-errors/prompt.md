# Ralph Prompt — fail-closed-cron-preflight-errors

Issue: #206
Branch: feat/206-fail-closed-cron-preflight-errors

## Contract

Read:
- tasks/fail-closed-cron-preflight-errors/prd.md
- tasks/fail-closed-cron-preflight-errors/prd.json
- tasks/fail-closed-cron-preflight-errors/critique.md
- tasks/fail-closed-cron-preflight-errors/progress.txt

Implement the user stories in priority order. Keep scope to harness infrastructure only. Do not change sandbox application code.

## Verification

- `pnpm vitest run scripts/__tests__/cron-runtime.test.ts`
- `bash evals/probes/autopilot-preflight-gate.sh`
- `bash .claude/skills/eval/run.sh`
