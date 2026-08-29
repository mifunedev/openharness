<h1 align="center">🏗️ Open Harness</h1>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache--2.0-D4AF37?style=plastic&labelColor=0B1220"></a>
  <a href="https://github.com/mifunedev/openharness/actions/workflows/ci-harness.yml"><img alt="CI: Harness" src="https://img.shields.io/github/actions/workflow/status/mifunedev/openharness/ci-harness.yml?branch=main&style=plastic&label=CI&labelColor=0B1220&color=D4AF37"></a>
  <a href="https://github.com/mifunedev/openharness/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/mifunedev/openharness?style=plastic&logo=github&logoColor=white&labelColor=0B1220&color=D4AF37"></a>
  <a href="https://github.com/mifunedev/openharness/issues"><img alt="Issues" src="https://img.shields.io/github/issues/mifunedev/openharness?style=plastic&labelColor=0B1220&color=D4AF37"></a>
  <img alt="Docker required" src="https://img.shields.io/badge/Docker-required-D4AF37?style=plastic&logo=docker&logoColor=white&labelColor=0B1220">
  <a href="https://deepwiki.com/mifunedev/openharness"><img alt="Ask DeepWiki" src="https://img.shields.io/badge/DeepWiki-ask-D4AF37?style=plastic&labelColor=0B1220"></a>
</p>

<p align="center">
  <img src=".github/assets/mifune-banner.jpg" alt="Open Harness" width="100%">
</p>

**Open Harness provides the sandbox; you choose the harness.** It's a Docker-based workspace, agent-tended over time: clone-and-own the repo, set one `.env`, and `oh sandbox` boots a long-lived container where the coding agent of your choice — Claude Code, Codex, Pi (Hermes, Grok, and more opt-in) — works on its own branch and identity. Because it's just Docker, it runs **identically on your laptop or a remote VM** — and remote is the default: deployed on a VM, Open Harness becomes a **lights-out software factory**, where the agent works unattended, on a schedule and reachable over Slack, fanning out across isolated **git worktrees** — parallel branches, delegated sub-agents, even other cloned repos — while you're away and your laptop stays clean.

- **One project, one sandbox.** A single container scoped to a single repo. The agent owns its branch and its workspace; you keep your laptop clean.
- **Parallel by design.** The worktrees skill fans one sandbox into isolated git worktrees — parallel branches, delegated sub-agents, even other cloned repos.
- **Remote-first, lights-out.** Runs the same on your laptop or a cloud VM; on a VM it's an unattended software factory — agents build on a schedule, reachable over Slack.
- **Agents that work while you sleep.** A tiny croner runtime reads `crons/*.md` markdown and wakes the agent on a schedule.
- **Host dependencies: Docker, Git, and Node.js ≥ 20.** No Python, no pnpm, no agent CLIs, no toolchain rot on your laptop — Node runs the `oh` CLI and nothing else. (`get-oh.sh` installs Node for you if you don't have it — see [Prerequisites](docs/installation.md#prerequisites).) The same `oh` verbs work on the host and inside the sandbox — see [lifecycle commands](docs/lifecycle-commands.md).
- **Composable infra.** Cherry-pick Cloudflare tunnels, SSH, Caddy gateway, or pack-supplied services via Compose overlays.
- **Slack-ready.** The `pi-messenger-bridge` package bridges Slack (and other messengers) to a Pi agent — see [docs/integrations/slack.md](docs/integrations/slack.md).
- **Herdr-first interactive work.** Claude, Codex, and Pi ship by default (Hermes, Grok, and more are opt-in). After entering the sandbox, run [Herdr](docs/integrations/herdr.md) first; keep setup, agents, tests, and servers organized in its persistent panes. Headless Slack and cron infrastructure remain independent.

---

> 📖 **Read the docs → https://oh.mifune.dev**
> Rendered, searchable docs, guides, and blog. New here? Start with the [Start Here hub](docs/README.md).

## 📦 Install

Open Harness runs one project in one Docker sandbox, and **`oh` is the only front
door**. Host prerequisites: Docker (with the Compose plugin), Git, and Node.js ≥ 20.

### 1. Get `oh`

**npm** — you already have Node ≥ 20:

```bash
npm install -g @mifune/openharness   # puts `oh` on your PATH
```

**curl** — no Node yet; the bootstrap offers to install nvm + Node 22 for you:

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

Review-first (download, read, then run — no extra dependency):

```bash
curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
# Review get-oh.sh in your editor or pager before running it.
bash get-oh.sh
```

It installs the self-contained `oh` binary to `~/.local/bin/oh` — no repo clone.
Use `source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)` to put `oh` on the
*current* shell's PATH, or `export PATH="$HOME/.local/bin:$PATH"` after the
piped form. Override the location with `OH_BIN_DIR`.

**From source** — build the CLI out of a checkout:

```bash
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness/.oh/cli && npm install && npm run build
# put dist/oh.js on your PATH as `oh`
```

### 2. Provision the sandbox

```bash
cd <your-project>   # or ~/.openharness for the clone above
oh init             # equip the repo: .oh/ control plane, oh.json, .env
oh sandbox          # build + start the container (~10 min cold, ~30s warm)
oh shell            # attach as the sandbox user
```

Then, inside the sandbox, open the persistent interactive workspace first:

```bash
herdr
```

`oh init` vendors the `.oh/` control plane into **your** repo rather than cloning
this one, and runs the interactive setup — sandbox name, timezone, git identity,
optional installs — writing non-secrets to the tracked `oh.json` and secrets to a
gitignored, `0600` `.env`. Your own repo mounts at `/home/sandbox/project`; a
clone of this one mounts at `/home/sandbox/harness`.

`herdr` should be your first inside-sandbox command. Run the remaining setup,
authentication, agents, tests, and servers from its panes. That is already a
working sandbox. To make it **yours** (private `origin` + `upstream`) and
authenticate the agents, continue with the optional full setup.

> **One-line install of this harness.** `curl -fsSL https://oh.mifune.dev/install.sh | bash`
> does steps 1 and 2 in one shot for a clone of *this* repo at `~/.openharness`
> (review-first: download it, read it, then `bash openharness-install.sh`). Set
> `OH_GITHUB_REPO=<your-org>/<your-fork>` to install a fork instead. All
> environment overrides: [Installation](docs/installation.md).

### 3. Full setup (optional) — private repo, remotes, agent auth

Run these **inside the initial Herdr pane** (`oh shell`, then `herdr`). Per-step depth + troubleshooting:
[quickstart → End-to-end setup walkthrough](docs/quickstart.md#end-to-end-setup-walkthrough).

```bash
# GitHub auth over SSH — pick SSH, generate a key, paste a token
# (SSH remotes use the key directly, so `gh auth setup-git` isn't needed):
gh auth login

# Create your own PRIVATE repo and point origin at it. `oh config repo` runs the
# four commands below for you (it asks first, and defaults to no):
oh config repo

# The manual equivalent, if `gh` is not installed — `oh config repo` keeps the
# upstream you cloned from as the `openharness` remote instead of `upstream`:
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
#   config: docs/integrations/slack.md  ·  docs/harnesses/hermes.md
gateway pi && gateway hermes
gateway status
tmux attach -r -t client-slack-pi   # read-only view; detach with Ctrl-b d
```

### VS Code (secondary path)

Provision with `oh sandbox`, then attach with **Dev Containers: Attach to
Running Container** against your sandbox. That is the supported editor path.

**Do not provision with "Reopen in Container".** That path reads
`.devcontainer/devcontainer.json`, which lists `docker-compose.yml` alone, so it
bypasses `.oh/scripts/docker-compose.sh` and **no overlay applies** — no SSH
(`access.ssh`), no host Docker socket (`access.dockerSocket`), no Hermes
dashboard (`hermesDashboard.enabled`), and nothing from `composeOverrides[]`.
Secrets still load, because compose auto-loads the `.devcontainer/.env` symlink
beside the compose file; non-secret `oh.json` settings fall back to the compose
defaults. Details: [lifecycle commands](docs/lifecycle-commands.md#vs-code-reopen-in-container-applies-no-overlays).

> **Optional — DebugMCP.** Once attached from VS Code, you can install the
> `microsoft/DebugMCP` extension to expose a debugging MCP server that **any
> MCP-capable harness** (Claude Code, Codex, …) can drive. It's optional and not
> tied to any single agent — see the
> [DebugMCP runbook](docs/integrations/debugmcp.md#confirmed-setup-runbook).

## 🧩 How the primitive pack ships

Open Harness vendors the shared skills/agents/hooks primitive pack directly into the `.oh/` control plane: `.oh/skills/`, `.oh/agents/`, `.oh/hooks/`, and `.oh/skills.lock` are tracked as ordinary files in this repo. The `oh` CLI lays them down during `oh init`/`oh update`, so a fresh checkout has the skills immediately — no submodule, no recursive clone, no network step.

Provider surfaces are symlinks into `.oh/`: `.pi/skills`, `.claude/skills`, `.codex/skills`, and `.prime/agent/skills` point at `.oh/skills`; `.claude/agents` → `.oh/agents`; `.claude/hooks` → `.oh/hooks`. `.pi/` itself remains the Pi provider surface in v1.

## 🚀 Use it

```bash
cd ~/.openharness
oh shell         # enter the isolated sandbox
herdr            # first command: open the primary interactive workspace
# from Herdr panes, launch any core agent:
#   claude     # Claude Code (default)
#   codex      # OpenAI Codex CLI
#   pi         # Pi Coding Agent
#   opencode   # OpenCode   (optional: oh harness install opencode)
#   deepagents # LangChain DeepAgents (optional: oh harness install deepagents)
#   hermes     # Nous Research Hermes (optional: oh harness install hermes)
#   grok       # xAI Grok Build       (optional: oh harness install grok-build)
oh stop          # stop the sandbox, keeping volumes
oh destroy       # stop and remove the sandbox
oh --help        # every verb
```

## 🧪 Testing

- Property-based testing convention: [docs/property-testing.md](docs/property-testing.md)

Prefer VS Code or remote SSH? Use the Dev Containers extension's "Attach to Running Container" against `openharness` — not "Reopen in Container", which applies no overlays (see [VS Code (secondary path)](#vs-code-secondary-path)) — or SSH into your host first and then attach.

## ⚙️ Configure (optional)

Configuration is split by kind across two files at the repository root. Tracked
`oh.json` holds every non-secret setting — sandbox identity, git identity,
optional `install.*` builds, the SSH and Docker-socket toggles. A gitignored,
mode-`0600` `.env` holds nothing but secrets (`GH_TOKEN`, `SANDBOX_PASSWORD`,
`PI_SLACK_APP_TOKEN`, `PI_SLACK_BOT_TOKEN`, …); the tracked `.env.example`
documents every allow-listed key. Set one field with `oh config set <field>
<value>` or one secret with `oh secret set <KEY>`, then apply with
`oh stop && oh sandbox`.
Full field reference: [Configuration](docs/configuration.md).

Secrets are read on **every** path, including VS Code "Reopen in Container" —
that path loads `.devcontainer/docker-compose.yml` directly and compose
auto-loads the dotenv beside it, which is a symlink to the root one. Compose
*overlays* are the exception: that path applies none, which is why `oh sandbox`
provisions and VS Code only attaches. A
`harness.yaml` layer used to sit in front of these files and was invisible on
exactly that path; it was removed in 0.4.0, and a leftover one is migrated
automatically on the next lifecycle command. Compose overlay *paths* live in
`composeOverrides[]` in `oh.json`. See
[the prebuilt-image deployment guide](docs/deployment-prebuilt-image.md) for
the image-mode recipe.

## ✨ What you get

| | |
|---|---|
| **Core agents** | Defaults: Claude Code, Codex, Pi. Optional: OpenCode, DeepAgents, Hermes, Grok Build |
| **Runtimes** | Node 22, pnpm, Bun, uv (Python) |
| **DevOps** | Herdr, Docker CLI + Compose, GitHub CLI, cloudflared, tmux, croner |
| **Browser** | agent-browser + Chromium (headless) |
| **One project, one sandbox** | A single container scoped to a single repo and branch |
| **Worktrees** | One sandbox → many isolated git worktrees: parallel branches, delegated sub-agents, satellite project clones under `projects/` |
| **Crons** | Markdown-defined schedules in `crons/*.md` driven by the in-container croner runtime |
| **Multi-agent** | Claude, Codex, Pi by default (Hermes/Grok opt-in); Slack bridging via [pi-messenger-bridge](docs/integrations/slack.md) |

## 📚 Where to go next

- **[Read the docs → oh.mifune.dev](https://oh.mifune.dev)** — the rendered, searchable documentation site (start here)
- [Docs index](docs/README.md) — GitHub-readable docs kept with the core repo
- [Quickstart](docs/quickstart.md) — full step-by-step
- [DeepWiki](https://deepwiki.com/mifunedev/openharness) — generated codebase map
- [Docs site source](https://github.com/mifunedev/openharness-web) — Docusaurus source repo that builds oh.mifune.dev (contribute doc edits here)

## 🧹 Cleanup

```bash
oh destroy
```

## 🤝 Contributing & community

Open Harness is maintained under the [`mifunedev`](https://github.com/mifunedev) org — the canonical repo is [github.com/mifunedev/openharness](https://github.com/mifunedev/openharness). To run your own, use the clone-and-own setup above (or fork it — see **Other install methods**) and open PRs back upstream. Issues and PRs welcome; if Open Harness is useful to you, please [give us a star](https://github.com/mifunedev/openharness/stargazers).

## 📄 License

[Apache License 2.0](LICENSE) — copyright Ryan Eggleston, d/b/a Mifune Dev (mifune.dev). Prior MIT releases remain available under MIT; this change governs new code and future releases and does not revoke past grants.

Apache-2.0 covers the runtime, the `oh` CLI, container definitions, and the harness spec. The Mifune Console, the provisioning and fleet-management control plane, and billing / enterprise policy / RBAC / hosted operations are proprietary — see the [open-core boundary](docs/open-core.md).

## Trademarks

Apache-2.0 §6 grants no permission to use the Mifune or Open Harness names, logos, or trade dress (reasonable, customary use in describing the origin of the work is fine). Fork it, modify it, sell it — just don't present your fork as Mifune.

---

[Read the docs](https://oh.mifune.dev) · [Docs index](docs/README.md) · [Docs site source](https://github.com/mifunedev/openharness-web)
