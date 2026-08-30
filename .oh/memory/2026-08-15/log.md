
## 05:00 MDT — prompt-miner cron: SKIPPED-DISABLED (kill-switch defeated by stale root checkout)

**Did not run the mining cycle.** The cron is disabled at HEAD but fired anyway.

- `origin/development` (and worktree HEAD `954f1a8a`) has `.oh/crons/prompt-miner.md` → `enabled: false`, set by `aa461c4b` ("task: disable the prompt-miner cron", 2026-08-13).
- The cron runtime reads the **shared root checkout** `/home/sandbox/harness`, which is `0-ahead / 52-behind` `origin/development` and still serves the pre-kill-switch body with `enabled: true`.
- Net: an operator flipped the kill-switch two days ago; the cron has fired on 08-14 and 08-15 regardless.

**Scope:** checked every `enabled:` flag root-vs-HEAD across `.oh/crons/*.md`. `prompt-miner.md` is the **only** cron that differs — this is an isolated defeat, not a fleet-wide one.

**Not done (deliberately):** no mine run, no issue, no branch, no PR. Also did not `pull` the root — it would fast-forward 52 commits and change the body of every cron at once, and the root worktree is dirty (` M .gitignore`, `?? .worktrees/`). That is an operator call.

**Remedy (operator, from inside the container):**
```bash
git -C /home/sandbox/harness pull --ff-only origin development
kill -HUP "$(cat /home/sandbox/harness/.oh/crons/.pid)"
```

**Standing note:** the NO-CORPUS root cause (three compounding defects in `mine-traces.mjs`) remains unfiled and is unaffected by this — see `.oh/memory/2026-08-13/log.md`.
