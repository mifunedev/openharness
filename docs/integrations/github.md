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

## Persisting credentials across restarts

The `gh` token is stored inside the container at `~/.config/gh/`, backed by the named `gh-config` volume. The token survives `docker compose down` and `docker compose up` cycles. `docker compose down -v` removes the volume — re-run `gh auth login` after a `down -v`, or register your own compose overlay in `config.json` `composeOverrides[]` to bind-mount a host directory to `~/.config/gh/`.
