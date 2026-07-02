# 🏗️ Open Harness

**Open Harness** is a Docker-based agent harness for **one project**, agent-tended over time. One `docker compose up` gives you a long-lived sandbox where Claude (or another agent of your choice) runs against a single repo, branch, and identity — not a multi-tenant comparison rig.

- **One project, one sandbox.** A single container scoped to a single repo. The agent owns its branch and its workspace; you keep your laptop clean.
- **Agents that work while you sleep.** A tiny croner runtime reads `.oh/crons/*.md` markdown and wakes the agent on a schedule.
- **Host dependencies: Docker, Git, and make.** No Node, no Python, no toolchain rot on your laptop. (`make` runs the `make sandbox` / `make shell` wrappers — see [Prerequisites](.oh/docs/installation.md#prerequisites).)
- **Composable infra.** Cherry-pick Cloudflare tunnels, SSH, Caddy gateway, or pack-supplied services via Compose overlays.
- **Slack-ready.** The `pi-messenger-bridge` package bridges Slack (and other messengers) to a Pi agent — see [.oh/docs/integrations/slack.md](.oh/docs/integrations/slack.md).
- **Multiple harnesses, one sandbox.** Claude, Codex, and Pi ship by default (Hermes, Grok, and more are opt-in); bridge them to Slack with [`pi-messenger-bridge`](.oh/docs/integrations/slack.md).

---

## 📦 Install

Open Harness runs one project in one Docker sandbox. The recommended path is
**clone-and-own**: clone upstream, then make your **own private repo** the `origin` and keep
`mifunedev/openharness` as `upstream` so you can pull framework updates and contribute back.

Host prerequisites: [Docker](https://docs.docker.com/get-docker/) with the Compose plugin,
[Git](https://git-scm.com/), and `make` (build-essential) — full list in
[Prerequisites](.oh/docs/installation.md#prerequisites).

### 1. Basic setup

```bash
# a. Clone upstream:
git clone https://github.com/mifunedev/openharness.git ~/.openharness && cd ~/.openharness

# b. Edit harness.yaml BEFORE building — set sandbox.name, sandbox.timezone,
#    git.user_name, git.user_email, and any optional installs (Hermes, agent-browser, …).
#    See "⚙️ Configure" below for the full key list. Secrets stay in .devcontainer/.env.
nano harness.yaml

# c. Build the image and open a shell inside the sandbox:
make sandbox && make shell
```

That is already a working sandbox. To make it **yours** (private `origin` + `upstream`) and
authenticate the agents, continue with the optional full setup.

### 2. Full setup (optional) — private repo, remotes, agent auth

Run these **inside the sandbox** (`make shell`). Per-step depth + troubleshooting:
[quickstart → End-to-end setup walkthrough](.oh/docs/quickstart.md#end-to-end-setup-walkthrough).

```bash
# GitHub auth over SSH — pick SSH, generate a key, paste a token:
gh auth login && gh auth setup-git

# Create your own PRIVATE repo, point origin at it, add upstream — all over SSH:
gh repo create <your-user>/openharness --private
git remote set-url origin git@github.com:<your-user>/openharness.git
git remote add upstream git@github.com:mifunedev/openharness.git
git push -u origin HEAD

# Authenticate the agents you'll use:
claude auth login            # Claude Code
codex login --device-auth    # Codex (+ install microsoft/DebugMCP in your IDE, then attach)
pi                           # Pi (first run walks provider auth)
hermes setup                 # Hermes (optional; needs install.hermes: true)

# Configure Slack, then run + verify the gateways (sandbox-only):
#   config: .oh/docs/integrations/slack.md  ·  .oh/docs/harnesses/hermes.md
gateway pi && gateway hermes
gateway status
tmux attach -r -t client-slack-pi   # read-only view; detach with Ctrl-b d
```

<details><summary>Other install methods (Railway preview · one-line installer · fork-and-clone)</summary>

**Hosted smoke test — Railway (one click):**

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fmifunedev%2Fopenharness)

This boots a Railway-hosted status surface so you can verify Open Harness starts before doing local setup. Railway mode does **not** provide the host Docker socket or privileged sibling containers needed for full sandbox lifecycle commands (`make sandbox`, `make shell`, compose overlays). Use it as a hosted preview; use the local Docker path above for the complete harness. Details: [Railway deployment](.oh/docs/railway.md).

**One-line installer (upstream):**

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

Review-first alternative (no extra dependency):

```bash
curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
# Review openharness-install.sh in your editor or pager before running it.
bash openharness-install.sh
```

If you already use [`vet`](https://github.com/vet-run/vet), you can review and approve the same installer with `vet https://oh.mifune.dev/install.sh`. `vet` is optional; Open Harness requires Docker with the Compose plugin, Git, and make on the host. The installer clones into `~/.openharness`, offers to share your host `gh` token, writes `.devcontainer/.env`, and builds the image (~10 min cold, ~30s warm).

**Fork and clone (self-hosting):**

```bash
# Fork on GitHub, then clone YOUR fork; the installer auto-detects the local clone:
git clone https://github.com/<your-org>/<your-fork>.git && cd <your-fork>
bash .oh/scripts/install.sh
```

**Install directly from your fork without cloning first:**

```bash
OH_GITHUB_REPO=<your-org>/<your-fork> curl -fsSL \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/scripts/install.sh | bash
```

Review-first fork install:

```bash
curl -fsSL -o openharness-install.sh \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/scripts/install.sh
# Review openharness-install.sh, then run it against your fork.
OH_GITHUB_REPO=<your-org>/<your-fork> bash openharness-install.sh
```

If your fork uses a default branch other than `main`, set `OH_GITHUB_REF=<branch>` and replace `main` in the URL. See [Installation docs](.oh/docs/installation.md) for all environment overrides.

</details>


## 🧩 How the primitive pack ships

Open Harness vendors the shared skills/agents/hooks primitive pack directly into the `.oh/` control plane: `.oh/skills/`, `.oh/agents/`, `.oh/hooks/`, and `.oh/skills.lock` are tracked as ordinary files in this repo. The `oh` CLI lays them down during `oh init`/`oh update`, so a fresh checkout has the skills immediately — no submodule, no recursive clone, no network step.

Provider surfaces are symlinks into `.oh/`: `.pi/skills`, `.claude/skills`, and `.codex/skills` point at `.oh/skills`; `.claude/agents` → `.oh/agents`; `.claude/hooks` → `.oh/hooks`. `.pi/` itself remains the Pi provider surface in v1.

## 🚀 Use it

```bash
cd ~/.openharness
make shell       # enter the isolated sandbox
# inside the sandbox, launch any core agent:
#   claude     # Claude Code (default)
#   codex      # OpenAI Codex CLI
#   opencode   # OpenCode (optional: set install.opencode: true in harness.yaml and rebuild)
#   pi         # Pi Coding Agent
#   deepagents # LangChain DeepAgents (optional: set install.deepagents: true in harness.yaml and rebuild)
#   hermes     # Nous Research Hermes (optional: set install.hermes: true in harness.yaml and rebuild)
#   grok       # xAI Grok Build (optional: set install.grok_build: true in harness.yaml and rebuild)
make destroy     # stop and remove the sandbox
make help        # all targets
```

## 🧪 Testing

- Property-based testing convention: [.oh/docs/property-testing.md](.oh/docs/property-testing.md)

Prefer VS Code or remote SSH? Use the Dev Containers extension's "Attach to Running Container" against `openharness`, or SSH into your host first and then attach.

## ⚙️ Configure (optional)

`harness.yaml` is the tracked config for shared non-secret settings (`sandbox.*`,
`git.*`, optional installs, Slack allowlists, compose overlays). **Secrets stay in
the gitignored `.devcontainer/.env`** (`GH_TOKEN`, `PI_SLACK_APP_TOKEN`,
`PI_SLACK_BOT_TOKEN`) — never in `harness.yaml`. Active keys in `harness.yaml`
override `.devcontainer/.env`; apply changes with `make destroy && make sandbox`.
Full key reference: [Quickstart → Configuration](.oh/docs/quickstart.md#configuration).

<details><summary>Manual setup (no installer)</summary>

```bash
git clone https://github.com/mifunedev/openharness.git && cd openharness
make sandbox
make shell
```

</details>

## ✨ What you get

| | |
|---|---|
| **Core agents** | Defaults: Claude Code, Codex, Pi. Optional: OpenCode, DeepAgents, Hermes, Grok Build |
| **Runtimes** | Node 22, pnpm, Bun, uv (Python) |
| **DevOps** | Docker CLI + Compose, GitHub CLI, cloudflared, tmux, croner |
| **Browser** | agent-browser + Chromium (headless) |
| **One project, one sandbox** | A single container scoped to a single repo and branch |
| **Crons** | Markdown-defined schedules in `.oh/crons/*.md` driven by the in-container croner runtime |
| **Multi-agent** | Claude, Codex, Pi by default (Hermes/Grok opt-in); Slack bridging via [pi-messenger-bridge](.oh/docs/integrations/slack.md) |

## 📚 Where to go next

- [Docs index](.oh/docs/README.md) — GitHub-readable docs kept with the core repo
- [Quickstart](.oh/docs/quickstart.md) — full step-by-step
- [DeepWiki](https://deepwiki.com/mifunedev/openharness) — generated codebase map
- [Docs site source](https://github.com/mifunedev/openharness-web) — migrated Docusaurus site and blog archive

## 🧹 Cleanup

```bash
make destroy
```

## 🤝 Contributing & community

Open Harness is maintained under the [`mifunedev`](https://github.com/mifunedev) org — the canonical repo is [github.com/mifunedev/openharness](https://github.com/mifunedev/openharness). To run your own, use the clone-and-own setup above (or fork it — see **Other install methods**) and open PRs back upstream. Issues and PRs welcome; if Open Harness is useful to you, please [give us a star](https://github.com/mifunedev/openharness/stargazers).

## 📄 License

MIT.

---

[Docs index](.oh/docs/README.md) · [Docs site source](https://github.com/mifunedev/openharness-web)
