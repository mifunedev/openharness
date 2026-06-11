# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| devtcp-hook | A | 2026-06-11 05:33 | PASS | memory/MEMORY.md 2026-06-10 (zsh /dev/tcp) |
| eval-gate | A | 2026-06-11 05:33 | PASS | memory/MEMORY.md 2026-06-11 (eval-gate) |
| health-check-docker-stats | A | 2026-06-11 05:33 | PASS | memory/MEMORY.md 2026-06-10 (docker stats vs ps Size) |
| next-dev-prod | A | 2026-06-11 05:33 | SKIPPED | memory/MEMORY.md 2026-06-04 |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
