# 🏗️ Open Harness

**Open Harness** is a Docker-based agent harness for **one project**, agent-tended over time. One `docker compose up` gives you a long-lived sandbox where Claude (or another agent of your choice) runs against a single repo, branch, and identity — not a multi-tenant comparison rig.

- **One project, one sandbox.** A single container scoped to a single repo. The agent owns its branch and its workspace; you keep your laptop clean.
- **Agents that work while you sleep.** A tiny [croner runtime](docs/architecture/crons-and-heartbeats.md) reads `crons/*.md` markdown and wakes the agent on a schedule.
- **Only host dependency: Docker.** No Node, no Python, no toolchain rot on your laptop.
- **Composable infra.** Cherry-pick Postgres, Cloudflare tunnels, SSH, Slack, Caddy gateway via Compose overlays.
- **Multi-agent? Add a pack.** Slack-driven Pi+Mom and other multi-agent setups ship as separate packs — see [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune).

---

## 📦 Install

```bash
curl -fsSL https://oh.mifune.dev/install.sh | bash
```

The installer clones into `~/.openharness`, offers to share your host
`gh` token, writes `.devcontainer/.env`, and builds the image (~10 min
cold, ~30s warm). Only host dependency: [Docker](https://docs.docker.com/get-docker/).

## 🚀 Use it

```bash
cd ~/.openharness
make shell       # enter the isolated sandbox
# inside the sandbox, launch any core agent:
#   claude     # Claude Code (default)
#   codex      # OpenAI Codex CLI
#   opencode   # OpenCode
#   pi         # Pi Coding Agent
#   deepagents # LangChain DeepAgents (multi-provider)
make destroy     # stop and remove the sandbox
make help        # all targets
```

Prefer VS Code or remote SSH? See [Connecting to a sandbox](https://oh.mifune.dev/docs/connecting).

## ⚙️ Configure (optional)

`.devcontainer/.env` is generated with safe defaults during install. Open
it any time to change `SANDBOX_NAME`, set a different `GH_TOKEN`, change
`TZ`, or enable overlay-specific vars (`SANDBOX_PASSWORD` for sshd,
`SLACK_*` for the Slack overlay). Apply with `make destroy && make sandbox`.

<details><summary>Manual setup (no installer)</summary>

```bash
git clone https://github.com/ryaneggz/open-harness.git && cd open-harness
make sandbox
make shell
```

</details>

## ✨ What you get

| | |
|---|---|
| **Core agents** | Claude Code, Codex, OpenCode, Pi |
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

See [Repo Layout](docs/architecture/container-runtime.md#repo-layout) for the annotated tree.

For Pi+Slack functionality, install the [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack from inside the sandbox.

## 🧹 Cleanup

```bash
make destroy
```

## 🤝 Contributing & community

Issues and PRs welcome at [github.com/ryaneggz/open-harness](https://github.com/ryaneggz/open-harness). If Open Harness is useful to you, please [give us a star](https://github.com/ryaneggz/open-harness/stargazers).

## 📄 License

MIT.

---

[Full documentation](https://oh.mifune.dev/docs)
