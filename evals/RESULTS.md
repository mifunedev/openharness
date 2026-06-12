# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
| eval-runner-exit | A | 2026-06-12 02:28 | PASS | issue #410 — eval runner aggregate exit contract |
| health-check-docker-stats | A | 2026-06-12 02:28 | PASS | issue #408 — health-check in-container RAM reclaim |
| skill-paths | A | 2026-06-12 02:28 | PASS | issue #408 — harness-audit & skill-lint stale path references |

<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->
