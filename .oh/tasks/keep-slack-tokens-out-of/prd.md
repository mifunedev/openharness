# PRD — Keep Slack Tokens Out of tmux argv

## Summary

Harden the devcontainer `client-slack` restore path so Slack token values never appear in the tmux launch command while preserving the existing Slack bridge restart behavior.

## Goals

- Keep `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and optional Slack allow-list values out of process argv / tmux command strings.
- Preserve the existing `client-slack` session name, `pi` launch, and `/tmp/client-slack.log` output.
- Add regression coverage for malicious-looking token values and argv redaction.

## Non-Goals

- Do not change the Slack Pi extension runtime semantics.
- Do not change how users configure Slack tokens in `.devcontainer/.env`.
- Do not touch sandbox application code.

## User Stories

### US-001 — Runtime env handoff

As a sandbox operator, I want the `client-slack` restore path to pass Slack tokens through a permission-restricted runtime env file so secrets are inherited by `pi` without appearing in tmux argv.

Acceptance criteria:
- `.devcontainer/entrypoint.sh` no longer builds an `env SLACK_APP_TOKEN=...` command string.
- The restore path writes only the required Slack keys to a temporary mode-600 runtime env file.
- The tmux command string contains only the runtime env file path, sources and removes it inside the child shell, then runs `pi 2>&1 | tee /tmp/client-slack.log`.
- Existing start conditions remain unchanged: `.devcontainer/.env` exists, both required Slack tokens are present, and sandbox-user `pi` is installed.

### US-002 — Regression coverage and docs

As a future maintainer, I want tests and durable docs to capture the secret-handling invariant.

Acceptance criteria:
- `scripts/__tests__/entrypoint.test.ts` executes the captured tmux command and proves fixture token values are absent from the command string.
- The test still proves `pi` receives the original Slack values and malicious-looking fixture content is not evaluated.
- `CHANGELOG.md` records the security fix.
- `wiki/sandbox-auth-volumes.md` documents the Slack runtime env handoff and `wiki/README.md` stays indexed.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `wiki/sandbox-auth-volumes.md`
- **Spec alignment**: document that auth/secret handling now includes a Slack runtime env-file handoff that keeps token values out of tmux argv while preserving ownership and startup behavior.
- **DeepWiki comparison**: no relevant public DeepWiki page was reachable from the local tooling during this run; local source-backed wiki entry is the authority.
- **Acceptance criteria**: update the wiki entry with relevant source files and line-cited behavior; refresh `wiki/README.md`; verify with `bash evals/probes/wiki-readme-index.sh`.

## Critique Synthesis

Critics found no unmitigated high-severity findings. The main risk is accidentally changing Slack startup behavior; US-001 requires preserving start conditions, session name, and logging.
