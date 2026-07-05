<h1 align="center">🏗️ Open Harness</h1>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-D4AF37?style=plastic&labelColor=0B1220"></a>
  <a href="https://github.com/mifunedev/openharness/actions/workflows/ci-harness.yml"><img alt="CI: Harness" src="https://img.shields.io/github/actions/workflow/status/mifunedev/openharness/ci-harness.yml?branch=main&style=plastic&label=CI&labelColor=0B1220&color=D4AF37"></a>
  <a href="https://github.com/mifunedev/openharness/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/mifunedev/openharness?style=plastic&logo=github&logoColor=white&labelColor=0B1220&color=D4AF37"></a>
  <a href="https://github.com/mifunedev/openharness/issues"><img alt="Issues" src="https://img.shields.io/github/issues/mifunedev/openharness?style=plastic&labelColor=0B1220&color=D4AF37"></a>
  <img alt="Docker required" src="https://img.shields.io/badge/Docker-required-D4AF37?style=plastic&logo=docker&logoColor=white&labelColor=0B1220">
  <a href="https://deepwiki.com/mifunedev/openharness"><img alt="Ask DeepWiki" src="https://img.shields.io/badge/DeepWiki-ask-D4AF37?style=plastic&labelColor=0B1220"></a>
</p>

<p align="center">
  <img src=".github/assets/mifune-banner.jpg" alt="Open Harness" width="100%">
</p>

**Open Harness provides the sandbox; you choose the harness.** It's a Docker-based workspace, agent-tended over time: clone-and-own the repo, set one `harness.yaml`, and `make sandbox` boots a long-lived container where the coding agent of your choice — Claude Code, Codex, Pi (Hermes, Grok, and more opt-in) — works on its own branch and identity. Because it's just Docker, it runs **identically on your laptop or a remote VM** — and remote is the default: deployed on a VM, Open Harness becomes a **lights-out software factory**, where the agent works unattended, on a schedule and reachable over Slack, fanning out across isolated **git worktrees** — parallel branches, delegated sub-agents, even other cloned repos — while you're away and your laptop stays clean.

- **One project, one sandbox.** A single container scoped to a single repo. The agent owns its branch and its workspace; you keep your laptop clean.
- **Parallel by design.** The worktrees skill fans one sandbox into isolated git worktrees — parallel branches, delegated sub-agents, even other cloned repos.
- **Remote-first, lights-out.** Runs the same on your laptop or a cloud VM; on a VM it's an unattended software factory — agents build on a schedule, reachable over Slack.
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

# b. Materialize local config, then edit it BEFORE building — set sandbox.name,
#    sandbox.timezone, git.user_name, git.user_email, and any optional installs
#    (Hermes, agent-browser, …). Secrets stay in .devcontainer/.env.
make harness-config
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

# Authenticate the agents you'll use. Simplest cross-provider path: launch the agent,
# run /login, and pick DEVICE MODE (a code + URL that works headless/remote). The
# one-liners below are equivalents where a provider exposes them:
claude auth login            # Claude Code   (or /login in-session)
codex login --device-auth    # Codex         (device mode; or /login in-session)
pi                           # Pi            (first run walks provider auth; /login in-session)
hermes setup                 # Hermes        (optional; needs install.hermes: true)

# Configure Slack, then run + verify the gateways (sandbox-only):
#   config: .oh/docs/integrations/slack.md  ·  .oh/docs/harnesses/hermes.md
gateway pi && gateway hermes
gateway status
tmux attach -r -t client-slack-pi   # read-only view; detach with Ctrl-b d
```

> **Optional — DebugMCP.** If you attach to the sandbox from **VS Code** (Dev Containers →
> *Attach to Running Container*) after `make sandbox`, you can install the `microsoft/DebugMCP`
> extension to expose a debugging MCP server that **any MCP-capable harness** (Claude Code,
> Codex, …) can drive. It's optional and not tied to any single agent — see the
> [DebugMCP runbook](.oh/docs/integrations/debugmcp.md#confirmed-setup-runbook).

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

Open Harness requires Docker with the Compose plugin, Git, and make on the host. The installer clones into `~/.openharness`, offers to share your host `gh` token, writes `.devcontainer/.env`, and builds the image (~10 min cold, ~30s warm).

**Fork and clone (self-hosting):**

```bash
# Fork on GitHub, then clone YOUR fork; the installer auto-detects the local clone:
git clone https://github.com/<your-org>/<your-fork>.git && cd <your-fork>
bash .oh/scripts/install.sh
```

**Install directly from your fork without cloning first:**

```bash
OH_GITHUB_REPO=<your-org>/<your-fork> curl -fsSL \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/.oh/scripts/install.sh | bash
```

Review-first fork install:

```bash
curl -fsSL -o openharness-install.sh \
  https://raw.githubusercontent.com/<your-org>/<your-fork>/main/.oh/scripts/install.sh
# Review openharness-install.sh, then run it against your fork.
OH_GITHUB_REPO=<your-org>/<your-fork> bash openharness-install.sh
```

If your fork uses a default branch other than `main`, set `OH_GITHUB_REF=<branch>` and replace `main` in the URL. See [Installation docs](.oh/docs/installation.md) for all environment overrides.

**Get the standalone `oh` CLI (equip an existing project repo):**

The installer above builds the harness sandbox. To instead put the `oh` command on your host — so you can run `oh init` inside any project — bootstrap it once:

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

Review-first alternative (no extra dependency):

```bash
curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
# Review get-oh.sh in your editor or pager before running it.
bash get-oh.sh
```

**Use `oh` immediately in the current shell** (installs *and* puts `oh` on your PATH now — no new terminal or re-login):

```bash
source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)
```

**Or install from npm** — if you already have **Node.js ≥ 20** on your host, skip the bootstrap script entirely:

```bash
npm install -g @mifune/openharness   # puts `oh` on your PATH
oh init

# ...or zero-install, no global install:
npx @mifune/openharness init
```

Unlike `get-oh.sh`, npm does **not** install Node for you — Node ≥ 20 must already be on your PATH.

If you already ran the plain piped form and `oh` isn't found yet, just add its dir to the current shell's PATH: `export PATH="$HOME/.local/bin:$PATH"`.

`get-oh.sh` installs the single self-contained `oh` binary to `~/.local/bin/oh` — **no repo clone**, and it leaves any existing `~/.openharness` sandbox config untouched. It needs **Node.js ≥ 20** to run `oh`; if Node is missing it offers to install nvm + Node 22 (and sources it so it works in the same shell). `oh init` fetches its scaffold payload on demand. Override the install dir with `OH_BIN_DIR`. Then:

```bash
cd <your-project>
oh init          # equip the repo with Open Harness
oh sandbox       # provision + start the sandbox
```

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

`harness.yaml` is local gitignored config for shared non-secret settings, generated
from tracked `harness.yaml.example` by `make harness-config` (also run by
`make sandbox`). It holds `sandbox.*`, `git.*`, optional installs, Slack allowlists,
and compose overlays. **Secrets stay in the gitignored `.devcontainer/.env`**
(`GH_TOKEN`, `PI_SLACK_APP_TOKEN`, `PI_SLACK_BOT_TOKEN`) — never in
`harness.yaml`. Active keys in `harness.yaml` override `.devcontainer/.env`; apply
changes with `make destroy && make sandbox`.
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
| **Worktrees** | One sandbox → many isolated git worktrees: parallel branches, delegated sub-agents, satellite project clones under `.worktrees/` |
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
