# Critique — avoid-shell-sourcing-slack

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] “Pass only tokens” conflicts with current Slack bridge behavior: allowlist env vars are required for responses, and `oh config slack` writes `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` into `.devcontainer/.env`; dropping them from the restored `pi` process can make startup “succeed” but deny all inbound Slack messages. | [EVIDENCE: `.pi/extensions/slack/allowlist.ts`; `packages/oh/src/config/slack.ts`; AC text: “The tmux command passes only SLACK_APP_TOKEN and SLACK_BOT_TOKEN to the pi process.”] | [RECOMMENDATION] Clarify intended behavior: either include required `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` in the explicit allowlist passed to `pi`, or update AC/docs to acknowledge token-only startup connects but denies messages without another allowlist source.

[SEVERITY: M] [STORY: US-001] The same unsafe shell-source launch pattern remains in the Slack setup wizard, so the repo will still contain a first-party path that executes `.devcontainer/.env` before launching `client-slack`. | [EVIDENCE: `packages/oh/src/config/slack.ts` `relaunchClientSlack` uses `bash -c 'set -a; source ${envPath}; set +a; pi ...'`] | [RECOMMENDATION] Explicitly scope the PRD as entrypoint-startup-only with accepted residual risk, or add `packages/oh/src/config/slack.ts` relaunch/manual instructions to the no-source contract.

[SEVERITY: M] [STORY: US-001] Env-file parsing behavior is underspecified, making FR-1 hard to verify and easy to implement incompatibly with current Compose-style `.env` expectations. | [EVIDENCE: AC text: “read SLACK_APP_TOKEN and SLACK_BOT_TOKEN values from .devcontainer/.env without executing the file”; `docs/integrations/slack.md` describes Compose `KEY=value` format] | [RECOMMENDATION] Specify the supported parser contract: exact keys, comments/blanks, duplicate-key precedence, CRLF handling, whether quoted values are unwrapped, and that no shell expansion/command substitution is performed.

[SEVERITY: L] [STORY: US-002] Boot-critical protected entrypoint syntax validation is only a success metric, not an acceptance criterion, so an implementation can satisfy AC while breaking container startup. | [EVIDENCE: `.claude/protected-paths.txt` lists `.devcontainer/entrypoint.sh`; PRD Success Metrics says shell syntax validation passes but AC only says “Relevant tests pass” / “Typecheck/tests pass”] | [RECOMMENDATION] Add an AC requiring `bash -n .devcontainer/entrypoint.sh` and, if available in the existing suite, shellcheck-compatible syntax for the touched block.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-001] `.env` parsing compatibility is underspecified; “parsed as data” may accidentally reject existing Compose-style quoting/comments/whitespace or duplicate-key behavior even though token storage format must not change. | [EVIDENCE: `tasks/avoid-shell-sourcing-slack/prd.md` — FR-1, FR-4, Non-Goals] | [RECOMMENDATION] Define the supported `.devcontainer/.env` line forms for Slack tokens and add acceptance coverage for quoted values, comments/blank lines, whitespace, and metacharacters.

[SEVERITY: M] [STORY: US-001] “Pass only the Slack token variables” is ambiguous: inline `SLACK_APP_TOKEN=... SLACK_BOT_TOKEN=... pi ...` still inherits the full parent environment, so a user/security reviewer may expect stronger env isolation than the PRD actually specifies. | [EVIDENCE: `tasks/avoid-shell-sourcing-slack/prd.md` — Goals, US-001 Acceptance Criteria, FR-2] | [RECOMMENDATION] Clarify whether “only” means “only variables read from `.devcontainer/.env`” or a scrubbed child environment via `env -i`; align tests to that interpretation.

[SEVERITY: L] [STORY: US-002] Regression test scope may be too text-level for a boot-critical protected entrypoint; tests can prove `source $SLACK_ENV` disappeared while missing runtime breakage in command construction/escaping. | [EVIDENCE: `tasks/avoid-shell-sourcing-slack/prd.md` — US-002 Acceptance Criteria, Technical Considerations; `.claude/protected-paths.txt`] | [RECOMMENDATION] Add one lightweight executable test or shell syntax/fixture invocation around the Slack restore construction path, while keeping the patch narrow because `.devcontainer/entrypoint.sh` is protected.

## Synthesis

- **High-severity findings**: 1
- **Medium-severity findings**: 4
- **Low-severity findings**: 2
- **Recommendation**: PROCEED — the high finding was mitigated in `prd.md` by preserving optional `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` in the explicit Slack env allowlist; medium findings were mitigated by clarifying entrypoint-only scope, parser semantics, inherited-env semantics, and adding shell syntax plus executable shell-quote coverage.
