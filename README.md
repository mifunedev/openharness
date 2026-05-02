# 🏗️ Open Harness

**Open Harness** is a Docker-based agent harness for **one project**, agent-tended over time. One `docker compose up` gives you a long-lived sandbox where Claude (or another agent of your choice) runs against a single repo, branch, and identity — not a multi-tenant comparison rig.

- **One project, one sandbox.** A single container scoped to a single repo. The agent owns its branch and its workspace; you keep your laptop clean.
- **Agents that work while you sleep.** A tiny [croner runtime](.claude/specs/structure-spec-v0.7.md) reads `crons/*.md` markdown and wakes the agent on a schedule.
- **Only host dependency: Docker.** No Node, no Python, no toolchain rot on your laptop.
- **Composable infra.** Cherry-pick Postgres, Cloudflare tunnels, SSH, Slack, Caddy gateway via Compose overlays.
- **Multi-agent? Add a pack.** Slack-driven Pi+Mom and other multi-agent setups ship as separate packs — see [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune).

---

## 📦 Install

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

Only host dependency: [Docker](https://docs.docker.com/get-docker/). The installer clones the repo into `~/openharness`, writes `.devcontainer/.env`, and brings the sandbox up via `docker compose`. There is no host CLI to install.

## 🚀 Quickstart

The full sandbox lifecycle is three commands:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d --build   # provision and start
docker exec -it -u sandbox openharness zsh                         # connect (interactive shell)
docker compose -f .devcontainer/docker-compose.yml down -v         # tear down
```

Prefer VS Code or remote SSH? See [Connecting to a sandbox](https://oh.mifune.dev/docs/connecting).

Inside the shell, start working:

```bash
gh auth login && gh auth setup-git    # one-time, if GH_TOKEN wasn't set in .env
claude                                # terminal coding agent
```

## 🐳 Docker only (no installer)

Alternative path for hosts with only Docker + git — no `bash` piping:

```bash
git clone https://github.com/ryaneggz/open-harness.git && cd open-harness
cp .devcontainer/.example.env .devcontainer/.env
# edit .devcontainer/.env: set GH_TOKEN, optionally rename SANDBOX_NAME,
# and set INSTALL_AGENT_BROWSER=false unless you need headless Chromium
docker compose -f .devcontainer/docker-compose.yml up -d --build  # ~10 min on cold cache
docker compose -f .devcontainer/docker-compose.yml exec -u sandbox sandbox zsh
```

For Postgres, Slack, SSH, or the Caddy gateway, chain overlay files with extra `-f` flags — see [Compose overlays](https://oh.mifune.dev/docs/guide/overlays).

## ✨ What you get

| | |
|---|---|
| **Default agent** | Claude Code (terminal coding agent) |
| **Runtimes** | Node 22, pnpm, Bun, uv (Python) |
| **DevOps** | Docker CLI + Compose, GitHub CLI, cloudflared, tmux, croner |
| **Browser** | agent-browser + Chromium (headless) |
| **One project, one sandbox** | A single container scoped to a single repo and branch |
| **Crons** | Markdown-defined schedules in `crons/*.md` driven by the in-container croner runtime |
| **Multi-agent** | Install a [harness pack](https://oh.mifune.dev/docs/guide/bring-your-own-harness) such as [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) for Pi+Mom + Slack |

## 📚 Where to go next

- [Quickstart](https://oh.mifune.dev/docs/quickstart) — full step-by-step
- [Onboarding](https://oh.mifune.dev/docs/onboarding) — auth wizard walkthrough
- [Compose overlays](https://oh.mifune.dev/docs/guide/overlays) — Postgres, SSH, gateway, Cloudflare
- [Bring your own harness](https://oh.mifune.dev/docs/guide/bring-your-own-harness) — install harness packs (e.g. [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) for the Pi+Mom Slack bot)
- [Crons](https://oh.mifune.dev/docs/crons/overview) — markdown-defined autonomous tasks
- [Architecture](https://oh.mifune.dev/docs/architecture/overview) — one container, one project, one croner

## 🗂️ Project layout

```
.devcontainer/    # Sandbox environment (Dockerfile, compose, overlays)
crons/            # Markdown-defined schedules (read by scripts/cron-runtime.ts)
docs/             # Plain-markdown documentation (GitHub-rendered)
install/          # Provisioning scripts
scripts/          # Host-and-sandbox helper scripts (e.g. cron-runtime.ts)
workspace/        # Agent workspace template (bind-mounted)
```

For Pi+Slack functionality, install the [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack from inside the sandbox.

## 🧹 Cleanup

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```

## 🤝 Contributing & community

Issues and PRs welcome at [github.com/ryaneggz/open-harness](https://github.com/ryaneggz/open-harness). If Open Harness is useful to you, please [give us a star](https://github.com/ryaneggz/open-harness/stargazers).

## 📄 License

MIT.

---

[Full documentation](https://oh.mifune.dev/docs)
