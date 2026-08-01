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

## Operator critique — root package grounding

Finding:

- **High**: The initial PR grounded the fix mostly in installed/generated harness evidence and did not explicitly audit the root `pi-messenger-bridge` package README/source, even though the original package README is the source of the admin-command wording.

Resolution:

- Audited the installed package metadata and cloned the package source at the resolved commit `dca59db0482e97a9ef85e1a3a49da937e9b94bc5`.
- Added `.oh/tasks/slack-admin-command-surface/root-package-audit.md` with root README/source evidence:
  - README `## Commands` lists `/msg-bridge ...`.
  - README `Admin commands (in DM with the bot)` lists `/help`, `/trusted`, `/channels`, etc.
  - `src/index.ts` registers only `msg-bridge` as a Pi command.
  - `src/transports/slack.ts` routes trusted DM slash text to `handleAdminCommand`.
  - `src/auth/challenge-auth.ts` gates admin handlers on trust.
  - `.pi/install/slack-manifest.json` has message events and no Slack-native slash-command definitions.
- Updated docs and eval guard to cite/require this grounding.
