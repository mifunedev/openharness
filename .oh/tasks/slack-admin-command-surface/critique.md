# Critique Summary

Two read-only adversarial critics reviewed the issue #354 worktree.

## Critic A — docs contract

Findings:

- **High**: `.oh/skills/t3/references/sandbox-processes.md` repeated the stale claim that `/trusted` and `/channels` are typed into the `client-slack-*` pane.
- **Medium**: The eval guard initially covered only Slack/connecting/Pi docs and missed the T3 process reference.

Resolution:

- Updated `.oh/skills/t3/references/sandbox-processes.md` so only Pi-side `/msg-bridge` commands are typed into the pane; Slack trust/channel admin is DM text to the bot.
- Expanded `.oh/evals/probes/slack-admin-command-surface.sh` to cover the T3 process reference and reject the old phrasing.

## Critic B — PR readiness

Findings:

- **High**: `prd.json` initially left all stories pending and lacked `passes` fields.
- **High**: `progress.txt` initially left US-004 pending with no terminal status marker.
- **Medium**: `.oh/tasks/*` is ignored by default, so the task folder must be force-added.
- **Medium**: Verification should prove the probe is executable and included in git.

Resolution:

- Updated `prd.json` with per-story `status`, `passes`, and evidence for US-001 through US-003; US-004 remains in progress until PR creation.
- Updated `progress.txt` with completed story evidence and `STATUS: READY_FOR_PR`.
- Planned `git add -f .oh/tasks/slack-admin-command-surface` before commit.
- Added `git ls-files --stage .oh/evals/probes/slack-admin-command-surface.sh .oh/tasks/slack-admin-command-surface` to verification commands.
