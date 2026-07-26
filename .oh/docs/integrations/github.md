---
title: "GitHub"
---

# GitHub

Open Harness uses the GitHub CLI (`gh`) for authentication inside the sandbox. For HTTPS
workflows, `gh auth setup-git` installs a credential helper so `git push`/`git fetch` use
your GitHub token automatically. For the recommended [clone-and-own private origin +
upstream](../installation.md#clone-and-own-private-origin-and-upstream-recommended) flow,
authenticate over **SSH** so pushes use a key generated inside the sandbox (see below).

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

## SSH authentication (recommended for private origin + upstream)

The [clone-and-own](../installation.md#clone-and-own-private-origin-and-upstream-recommended)
flow uses SSH remote URLs (`git@github.com:...`). Two ways to get an SSH key that GitHub
trusts:

**A. Interactive — pick SSH during `gh auth login`** (the validated path):

```bash
gh auth login
# ? What account do you want to log into?   GitHub.com
# ? What is your preferred protocol for Git operations?   SSH
# ? Generate a new SSH key to add to your GitHub account?   Yes
#   (accept the path, empty passphrase, give it a title)
# ? How would you like to authenticate?   Paste an authentication token
```

Pasting a token (a classic PAT with `repo`, `read:org`, `admin:public_key`, and — if you
will run `gh repo create` — `workflow`) lets `gh` upload the freshly generated public key
for you. After this, `git@github.com:...` remotes push without prompting.

**B. Automatic — via `GH_TOKEN` at container start.** If `GH_TOKEN` was provided when the
sandbox booted, the entrypoint mirrors the interactive SSH path: it generates an ed25519
keypair at `~/.ssh/id_ed25519` and uploads the public key to GitHub as
`openharness-<sandbox-name>` (`.devcontainer/entrypoint.sh:275-309`). This upload requires
the token to carry the **`admin:public_key`** scope; without it the key is still generated
but not uploaded, and HTTPS + the credential helper continue to work. The step is
idempotent — an already-registered key is detected and skipped.

Verify the key is in place:

```bash
gh ssh-key list
ssh -T git@github.com    # "Hi <user>! You've successfully authenticated…"
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

The `gh` token is stored inside the container at `~/.config/gh/`, backed by the named `config-dir` volume that persists all of `~/.config`. The token survives `docker compose down` and `docker compose up` cycles. `docker compose down -v` removes the volume — re-run `gh auth login` after a `down -v`, or register your own compose overlay in `config.json` `composeOverrides[]` to bind-mount a host directory to `~/.config/`.
