# Hermes gateway Slack adapter in Open Harness

## Symptom

When running Hermes gateway in a tmux session, users may see:

```text
WARNING gateway.run: Slack: slack-bolt not installed. Run: pip install 'hermes-agent[slack]'
WARNING gateway.run: No adapter available for slack
WARNING gateway.run: No adapter could be created for any of the configured platform(s).
Gateway will continue for cron job execution.
```

## Meaning

Slack is enabled in Hermes' gateway configuration, but the Hermes install in the sandbox does not include the optional Slack adapter dependency (`slack-bolt`). This affects Hermes' own messaging gateway only. It is separate from the Open Harness Pi Slack extension under `.pi/extensions/slack/`.

The gateway continuing for cron execution is expected: Hermes cron jobs can still run even when no messaging platform adapter is available.

## Fixes to document for users

- If they want Hermes Slack bridging, run from the project root (`/home/sandbox/harness`, not `.hermes/`) and install the Hermes Slack extra into the venv that owns the `hermes` executable. In Open Harness, `/usr/local/bin/hermes` execs `/usr/local/lib/hermes-agent/venv/bin/hermes`, so use `uv pip` against that venv:

  ```bash
  cd /home/sandbox/harness
  uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack]'
  ```

  Do **not** use `uv tool install` for this sandbox image. It installs a separate tool environment rather than modifying the `/usr/local/lib/hermes-agent/venv` used by `/usr/local/bin/hermes`. If `uv` reports `Permission denied` under `/opt/uv/tools`, that is an image ownership bug: root-owned build-time uv paths leaked into the runtime shell. Fix the image so runtime `UV_TOOL_DIR` / `UV_TOOL_BIN_DIR` point at sandbox-owned home paths, and chown image-level agent install directories that humans are expected to modify from inside the container. For an already-running container, a one-time repair is:

  ```bash
  sudo chown -R sandbox:sandbox /opt/uv /usr/local/lib/hermes-agent
  ```

- Verify the Hermes venv directly:

  ```bash
  /usr/local/lib/hermes-agent/venv/bin/python -c "import slack_bolt; print('slack-bolt OK')"
  which hermes
  ```

- Restart the tmux gateway session after changing dependencies:

  ```bash
  tmux kill-session -t <gateway-session>
  tmux new-session -s <gateway-session> 'hermes gateway run'
  ```

- If they do not want Hermes Slack bridging, remove/disable Slack via:

  ```bash
  hermes gateway setup
  ```

## Documentation pitfall

When a user-facing optional runtime warning is confusing enough to troubleshoot interactively, reflect the clarification in the user-facing runtime docs/README, not only in the chat answer. For Hermes project-local runtime state and gateway notes in Open Harness, prefer `.hermes/README.md`; keep the top-level `README.md` for broad install/use copy unless the warning affects first-run project setup generally. Link to upstream Hermes docs when documenting gateway fixes:

- Slack gateway setup: <https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack>
- Messaging gateway overview: <https://hermes-agent.nousresearch.com/docs/user-guide/messaging/>
- Cron scheduler: <https://hermes-agent.nousresearch.com/docs/user-guide/features/cron>
