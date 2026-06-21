# Hermes runtime home

Open Harness sets `HERMES_HOME=/home/sandbox/harness/.hermes` when `INSTALL_HERMES=true`.

This directory holds Hermes project-local runtime state such as config, memory, skills, sessions, and scheduled-task metadata. Runtime contents are gitignored.

On boot with Hermes enabled, the sandbox creates this symlink when the shared skill directory exists:

```text
/home/sandbox/harness/.hermes/skills/openharness -> ../../.mifune/skills
```

That makes the harness' in-repo shared skills visible to Hermes through Hermes' normal `$HERMES_HOME/skills` scan, while Claude, Codex, and Pi see the same tracked files through their own `skills` symlinks.

Hermes auth lives here as a project-local `auth.json`, gitignored and never committed. An earlier design symlinked it into the home-scoped `~/.hermes` named volume, but that volume is a different filesystem from the bind-mounted checkout, so Hermes' atomic credential writes (write-temp-then-rename) failed with a cross-device-link error (`EXDEV`). Keeping `auth.json` on the same device as `HERMES_HOME` resolves it; the entrypoint heals any leftover legacy symlink on boot.

## Gateway notes

Fresh images built with `INSTALL_HERMES=true` bundle the Slack extra (`hermes-agent[slack]`) by default, so the gateway's Slack adapter works out of the box. The notes below apply only to older images built before that change.

`hermes gateway run` can run the cron scheduler even when no messaging adapter starts. If Slack is configured but the sandbox Hermes install does not include Slack support, startup logs show:

```text
WARNING gateway.run: Slack: slack-bolt not installed. Run: pip install 'hermes-agent[slack]'
WARNING gateway.run: No adapter available for slack
WARNING gateway.run: No adapter could be created for any of the configured platform(s). Gateway will continue for cron job execution.
```

Fix it one of two ways:

- If Hermes should bridge Slack, run this from the project root (`/home/sandbox/harness`, not `.hermes/`). Open Harness installs Hermes into `/usr/local/lib/hermes-agent/venv`, so add the Slack extra to that venv with `uv pip`, then restart the gateway tmux session:

  ```bash
  cd /home/sandbox/harness
  uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack]'
  tmux kill-session -t <gateway-session>
  tmux new-session -s <gateway-session> 'hermes gateway run'
  ```

  If `uv` reports `Permission denied` under `/usr/local/lib/hermes-agent` or `/opt/uv/tools`, the venv is owned by the build-time sandbox UID but the entrypoint remapped the sandbox user to the host UID, orphaning it. Restarting the container auto-heals this (the entrypoint re-chowns both paths on boot). To repair without a restart, run once then rerun the install command above:

  ```bash
  sudo chown -R sandbox:sandbox /opt/uv /usr/local/lib/hermes-agent
  ```

  Verify Slack support is installed in the Hermes venv:

  ```bash
  /usr/local/lib/hermes-agent/venv/bin/python -c "import slack_bolt; print('slack-bolt OK')"
  which hermes
  ```

  The important rule is same environment: `/usr/local/bin/hermes` execs `/usr/local/lib/hermes-agent/venv/bin/hermes`, so install extras into `/usr/local/lib/hermes-agent/venv`.

- If Hermes should only run cron jobs, remove Slack from `hermes gateway setup` or leave the warning alone. Cron execution continues without a messaging adapter.

Hermes docs:

- Slack gateway setup: <https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack>
- Messaging gateway overview: <https://hermes-agent.nousresearch.com/docs/user-guide/messaging/>
- Cron scheduler: <https://hermes-agent.nousresearch.com/docs/user-guide/features/cron>
