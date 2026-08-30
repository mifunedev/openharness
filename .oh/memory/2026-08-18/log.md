
## prompt-miner cron — 2026-08-18 05:00 MDT — SKIPPED-DISABLED (day 4)

- Cron is `enabled: false` at HEAD (`aa461c4b`, merged 2026-08-13) but fired again.
- Cause: the runtime reads the shared root `/home/sandbox/harness`, still `91bc0b3f`, 0-ahead / 52-behind `origin/development`, so it serves the pre-kill-switch body (`enabled: true`).
- No mining run, no issue, no branch, no PR.
- Scope re-checked across all `.oh/crons/*.md`: `prompt-miner.md` is still the only cron whose `enabled:` differs root-vs-HEAD.
- Second symptom of the same stale root: served body pins `--hours 24`; HEAD pins `--hours 336`. The 24h window alone guarantees `NO-CORPUS`.
- Action: commented day-4 evidence on the existing tracking issue `mifunedev/openharness#799` (open, 0 comments, no operator action since 08-17). No duplicate filed.
- Remedy needs an operator: `git -C /home/sandbox/harness pull --ff-only origin development && kill -HUP "$(cat /home/sandbox/harness/.oh/crons/.pid)"` (pid 1678).
