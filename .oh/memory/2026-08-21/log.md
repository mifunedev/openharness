## prompt-miner cron — 2026-08-21 05:00 MDT — SKIPPED-DISABLED (day 7)

- Cron is `enabled: false` at HEAD (`aa461c4b`, merged 2026-08-13) but fired again.
- Cause: the runtime reads the shared root `/home/sandbox/harness`, still `91bc0b3f`, 0-ahead / **54-behind** `origin/development`, so it serves the pre-kill-switch body (`enabled: true`).
- No mining run, no issue, no branch, no PR.
- **New this run — blast radius measured beyond cron bodies.** Prior runs only diffed `enabled:` flags. Diffing the whole gap `91bc0b3f..origin/development`: only **2** cron bodies differ (`prompt-miner.md`, `crons/README.md`), but **240 files** differ overall (+28,474 / −1,185). Every cron run resolving skills/scripts/references through the root reads an 8-day-old harness. This is a drifted runtime source-of-truth, not one stuck kill-switch.
- Second symptom of the same stale root (unchanged): served body pins `--hours 24`; HEAD pins `--hours 336`. The 24h window alone guarantees `NO-CORPUS`.
- Action: **escalated by editing the title** of `mifunedev/openharness#799` to carry the live fire count (`...has now fired 7x while disabled (08-15..08-21)`), then added one day-7 comment with the blast-radius table. Six prior comment-only escalations reached no operator; the issue list now shows the count without opening the issue. No duplicate filed.
- Seven consecutive unwanted fires (08-15 … 08-21).
- Remedy still needs an operator — root worktree is dirty (`M .gitignore`, `M .oh/evals/RESULTS.md`, `?? .worktrees/`), so an unattended `pull --ff-only` stays off the table. After resolving those: `git -C /home/sandbox/harness pull --ff-only origin development && kill -HUP "$(cat /home/sandbox/harness/.oh/crons/.pid)"`.

