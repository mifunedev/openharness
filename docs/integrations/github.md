---
sidebar_position: 2
title: "GitHub"
---

# GitHub

Open Harness uses the GitHub CLI (`gh`) for authentication inside the sandbox. This avoids managing SSH keys for most workflows — `gh auth setup-git` installs a credential helper so `git push` and `git fetch` use your GitHub token automatically.

## One-time onboarding

Inside the sandbox, run these commands once:

```bash
gh auth login
gh auth setup-git
```

`gh auth login` opens a browser-based OAuth flow and saves the token to `~/.config/gh/`. `gh auth setup-git` registers the GitHub CLI as a Git credential helper, so all subsequent `git` commands use the stored token without prompting.

After this, standard Git commands work without additional configuration:

```bash
git clone https://github.com/your-org/your-repo.git
git push origin main
```

## Creating and managing pull requests

With the CLI authenticated, use `gh` to create PRs, open issues, and check CI status from inside the sandbox:

```bash
# Create a pull request
gh pr create --base development --title "FROM feat/my-feature TO development"

# Check CI pipeline status
gh run list --branch feat/my-feature

# View an issue
gh issue view 42
```

## Optional SSH overlays

For cases where Git-over-SSH is required (custom Git servers, deploy keys, or workflows that do not support HTTPS), two compose overlays are available:

| Overlay | Behavior |
|---|---|
| `docker-compose.ssh.yml` | Mounts your host `~/.ssh` directory into the sandbox read-only. Uses your existing SSH keys without copying them. |
| `docker-compose.ssh-generate.yml` | Generates a new persistent ED25519 keypair in a named Docker volume. The public key must be added to GitHub manually before use. |

These overlays are mutually exclusive — use at most one. Both are off by default. Add one when starting the sandbox:

```bash
docker compose \
  -f .devcontainer/docker-compose.yml \
  -f .devcontainer/docker-compose.ssh.yml \
  up -d --build
```

For most users, `gh auth login` and `gh auth setup-git` are sufficient and no SSH overlay is needed.

## Persisting credentials across restarts

The `gh` token is stored inside the container at `~/.config/gh/`. Because this path is inside the container, it is lost when the container is removed. To persist credentials across `docker compose down -v` cycles, either re-run `gh auth login` after each rebuild, or bind-mount a host directory to `~/.config/gh/` via a custom compose overlay.
