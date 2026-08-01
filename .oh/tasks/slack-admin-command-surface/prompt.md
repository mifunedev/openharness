# Prompt

Use `.oh/prompts/advisor/pr.yml` in an isolated worktree to address issue #354: clarify Slack bridge admin command surfaces, preserve the user's WHAT, generate PRD/Ralph-style task artifacts, validate docs with an eval guard, and open a ready PR.

## Inputs

- Issue: https://github.com/ryaneggz/openharness/issues/354
- RCA comment: https://github.com/ryaneggz/openharness/issues/354#issuecomment-5148855634
- Worktree branch: `bug/354-slack-admin-surface`
- Target base: `development`

## Key evidence

- Pi command surface: only `pi.registerCommand("msg-bridge")` in the installed bridge package.
- Slack admin surface: `handleAdminCommand` processes trusted DM text commands.
- Original Slack manifest: message-event based, with no native admin slash command declarations.
- Original bridge transport: message handler only, with no Bolt `app.command(...)` listeners.
- Docs conflated in-session `/msg-bridge` with Slack admin commands.
