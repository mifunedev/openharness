# Implementation Prompt — preserve-cron-reload-file-paths

Issue: #472 (`fix: preserve cron reload file paths`)
Branch: `feat/472-preserve-cron-reload-file-paths`

Implement the PRD in `tasks/preserve-cron-reload-file-paths/prd.md`:

1. Preserve path-qualified cron `filePath` across `reloadEntryForFire` and `reloadBody` in `scripts/cron-runtime.ts`.
2. Add a regression test proving `reloadBody(reloadEntryForFire(entry))` reads the updated source file and does not log `BODY_RELOAD_ERR`.
3. Update cron-runtime wiki/changelog documentation.
4. Verify with `pnpm vitest run scripts/__tests__/cron-runtime.test.ts` and `pnpm run test:scripts`.
