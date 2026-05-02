---
sidebar_position: 4
title: "Onboarding"
---

# Onboarding

Onboarding is a manual checklist run inside the sandbox after your first `docker compose up`. There is no host-side wizard — every step runs against an interactive shell in the container.

Open a shell first:

```bash
docker exec -it -u sandbox openharness zsh
```

Replace `openharness` with whatever you set as `SANDBOX_NAME` in `.devcontainer/.env`. Then walk the steps below in order. Each step is idempotent — re-run any single step to refresh that credential.

## Steps

### Step 1 — GitHub CLI

Authenticates the `gh` CLI so the agent can create PRs, open issues, and push branches directly from the sandbox.

```bash
gh auth login && gh auth setup-git
```

Pick HTTPS as the protocol (the credential helper installed by `gh auth setup-git` makes `git push` / `git fetch` "just work" without SSH keys). If you prefer SSH, choose SSH at the prompt and the CLI will generate an ed25519 key and upload it to GitHub for you.

Verify with `gh auth status`. If it succeeds, you are done with this step.

### Step 2 — LLM provider

Authenticate Claude Code (and Codex if you use it) so they can make API calls.

```bash
claude   # opens the OAuth flow on first run; follow the printed URL
codex    # OpenAI auth, only if you intend to use Codex
```

Both write tokens to their respective directories under the sandbox home (`~/.claude/`, `~/.codex/`). With the persistent named volumes, credentials survive container rebuilds.

If you prefer API keys over OAuth, set the relevant variables in `.devcontainer/.env` (e.g. `OPENAI_API_KEY`) before bringing the sandbox up.

### Step 3 — SSH key (optional)

If you chose HTTPS in Step 1 you can skip this. Otherwise, verify the GitHub SSH path:

```bash
ssh -T git@github.com
```

If the response says GitHub recognizes your key, you are done. If it does not, generate a new key (`ssh-keygen -t ed25519`) and add the public key at [github.com/settings/keys](https://github.com/settings/keys).

### Step 4 — Cloudflare tunnel (optional)

Only relevant when you want public URLs for in-sandbox dev servers. The image ships `cloudflared`; create a named tunnel from inside the sandbox:

```bash
cloudflared login
cloudflared tunnel create openharness
```

See the [Cloudflare integration guide](./integrations/cloudflare) for ingress configuration. Skip if you only run locally.

### Step 5 — Slack bot (optional, via pack)

Slack-driven Pi+Mom is not part of core OpenHarness. Install the [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack inside the sandbox and follow its README — it owns its own onboarding (Socket Mode app token, bot token, named tmux session for the worker).

To set tokens manually for a future pack install, add them to `.devcontainer/.env`:

```bash
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
```

## After onboarding

Start the agent in a named tmux session so it survives shell disconnects:

```bash
tmux new-session -d -s agent-claude 'claude'
tmux attach -t agent-claude
```

See `.claude/rules/sandbox-processes.md` (rendered in the Architecture section) for the full session-naming convention.

## Troubleshooting

**`gh auth login` fails:** Try `gh auth login --web` for browser-based auth, or use a [personal access token](https://github.com/settings/tokens).

**SSH key not recognized by GitHub:** Copy the public key (`cat ~/.ssh/id_ed25519.pub`) and add it at [github.com/settings/keys](https://github.com/settings/keys).

**Cloudflare login opens no browser:** `cloudflared login` prints a URL — paste it into any browser on your laptop.

**Claude Code auth fails:** Run `claude` directly inside the sandbox to retrigger the OAuth flow interactively. If you mounted host `~/.claude` via the `claude-host` overlay, your laptop's existing credentials are reused and no in-sandbox flow is needed.

**Slack bot not responding (mifune pack):** Attach to the agent's tmux session to see error output:

```bash
tmux attach -t agent-mom
```

Common causes: LLM auth missing (complete Step 2 first), invalid tokens, or the Slack app is not installed to your workspace.
