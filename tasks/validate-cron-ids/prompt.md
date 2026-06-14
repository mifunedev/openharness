# validate-cron-ids

Implement issue #128: validate cron ids before shell interpolation.

Acceptance criteria:
- Cron ids match `^[a-z0-9][a-z0-9-]*$`.
- Explicit frontmatter `id` values match the cron file basename; omitted ids derive from the basename.
- Invalid cron definitions are skipped and logged without scheduling/crashing.
- Tests cover valid ids, unsafe id strings, unsafe filename basenames, basename mismatch, wrapper generation guards, and scheduleAll skip accounting.
- `crons/README.md` and `CHANGELOG.md` document the behavior.
