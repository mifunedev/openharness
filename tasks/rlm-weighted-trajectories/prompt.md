# Ralph prompt — rlm-weighted-trajectories

Implement the task in `tasks/rlm-weighted-trajectories/prd.json` on branch `feat/533-rlm-weighted-trajectories` for issue #533.

Read first:
- tasks/rlm-weighted-trajectories/prd.md
- tasks/rlm-weighted-trajectories/prd.json
- tasks/rlm-weighted-trajectories/critique.md
- tasks/rlm-weighted-trajectories/progress.txt

Scope: harness-infra only (skills/scripts/probes/wiki). Skills live in `.mifune/skills/` and are auto-exposed to `.claude`/`.codex`/`.pi` via dir symlinks — there is ONE canonical copy, do not mirror-sync. Model new scorers on `.mifune/skills/prompt-miner/scripts/mine-traces.mjs` and new probes on an existing `evals/probes/*.sh` (3-state PASS=0/REGRESSION=1/SKIPPED=2). Do NOT edit `.oh/scripts/ralph.sh` or the protected `/ship-spec` build path — Layer B reuses ralph + worktrees by reference. Do not touch sandbox application code.
