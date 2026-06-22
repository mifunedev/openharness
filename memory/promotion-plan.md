# Promotion / Launch Plan — `mifunedev/openharness` on Developer Message Boards

> Durable, tracked copy of the launch campaign plan (topic note per
> `.mifune/skills/retro/references/memory-protocol.md` — campaign planning lives at `memory/<topic>.md`).
> Created 2026-06-10. Kept out of `docs/` deliberately: `docs/` publishes to
> oh.mifune.dev, and a public site is the wrong home for launch strategy.
> Scratch origin: `.claude/plans/kind-dancing-parnas.md`.

## Context

**Why this exists.** Open Harness is a mature, genuinely-differentiated open-source tool with a near-empty awareness footprint. The goal is a launch plan to put it in front of the right developer communities (Hacker News, Reddit, dev.to, X/Bluesky, later lobste.rs / Product Hunt / awesome-lists) without getting flagged as spam or drowned in the 2026 "yet-another-AI-agent" fatigue.

**Decided scope (clarifying Q&A, 2026-06-10):**
- **Deliverable:** strategy **plus paste-ready draft copy** per board.
- **Posture:** staggered, **lead with Show HN**, then roll out.
- **Channel readiness:** **nothing warm** — no HN karma, no aged Reddit accounts, no lobste.rs invite, no X/Bluesky audience. User asked for an *honest assessment from the current point*; plan front-loads an account-warming runway and realistic expectations.

---

## Honest assessment from a cold start (read first)

1. **Category is crowded / audience fatigued.** "Autonomous AI coding agent in a container" is not novel on HN/Reddit in 2026 (OpenHands, SWE-agent, Devin, Aider, Cursor, Windsurf, K8s Agent Sandbox). Leading with *"autonomous AI agent"* reads as noise. **The wedge is the opinionated design, not the agent label.**
2. **Zero warm channels caps day-one reach.** Realistic round-one goal: **first ~50–250 GitHub stars + real feedback**, not virality. At-bats, not one swing.
3. **HN tolerates a new account; Reddit punishes one.** HN ranks on the post, not account age. Reddit's 90/10 automod auto-removes self-promo from a cold account in r/selfhosted and r/programming → Reddit needs a warm-up week; HN does not.
4. **lobste.rs is off the table day-one** (invite-only; bans write-only self-promoters). Month-2+ credibility play.
5. **X/Bluesky with no audience ≠ a megaphone.** Building-in-public surfaces that compound slowly. On Bluesky, *understate the AI angle* (it blocks AI-hype accounts).
6. **Biggest lever: lead with substance.** Defensible, debate-sparking ideas — *one-project/one-sandbox*, *markdown-crons-as-prompts*, *containers-not-microVMs*, the *four-words taxonomy* — beat "try my agent runner." Four ship-ready blog posts already articulate these. **Lead with the idea; let the tool be the payoff.**

**Net recommendation (honoring lead-with-HN):** keep HN-lead, but insert a **Week 0 warm-up runway** (accounts + demo GIF + a few genuine early stars) and frame the Show HN around a concrete design decision, not the agent category.

---

## Product in one breath

Docker-based agent harness for **one project**, agent-tended over time. One `docker compose up` = a long-lived sandbox where a coding agent (Claude Code / Codex / Pi, optionally OpenCode/DeepAgents/Hermes) runs against a single repo/branch/identity. A tiny **croner runtime reads `crons/*.md`** and wakes the agent on schedule — the cron body *is* the prompt. Only host dependency is Docker. Infra (Postgres, Cloudflare tunnels, SSH) is opt-in via Compose overlays. MIT. Repo `github.com/mifunedev/openharness`. Install `curl -fsSL https://oh.mifune.dev/install.sh | bash`.

**Positioning wedge:** *Single-project, one-sandbox, cron-driven, self-hosted, engine-agnostic.* No competitor combines all five (OpenHands multi-tenant; SWE-agent issue-reactive; Devin closed SaaS; Cursor/Windsurf IDE-native; Claude Code interactive-only — Open Harness can *wrap* it). One-liner: **"Deploy one agent to one repo. Let it work on a schedule. No vendor, no K8s — just Docker and markdown."**

---

## Asset inventory → board mapping

Four **ship-ready** blog posts (verified strong, opinionated, first-person, diagrams) are the backbone; the tool is the CTA under the idea.

| Asset (`blog/`) | Thesis | Anchors |
|---|---|---|
| `2026-05-19-four-words-multi-agent.md` — Operator/Sandbox/Orchestrator/Harness | 4-word vocabulary; orchestrator/harness are the same recursive shape | **Show HN** primary; r/programming, lobste.rs |
| `2026-06-07-containers-microvms-vms.md` — where should an agent run? | microVM doesn't replace the container; clean isolation model | **lobste.rs** flagship (later); HN systems; r/devops |
| `2026-06-04-compound-engineering.md` | every fix leaves the next easier — shown in files + failure modes | r/programming; HN; dev.to |
| `2026-05-19-statusline-context-rot.md` | tactical fix for silent context overflow; 3 tiers | **r/ClaudeAI**, r/ChatGPTCoding; HN tip |
| `archive/2026-04-28-byoh.md` — BYOH | "stop installing agent CLIs" setup-pain narrative | r/selfhosted resurface |

**Demo asset (Week 0):** 20–40s asciinema/GIF — `make sandbox` → `tmux ls` shows `system-cron` → fast-forward → `git log` + `gh pr list` show a PR the agent opened on a cron. Centerpiece for README top, HN comment, X thread. **Full production guide (seed repo, isolated demo cron, VHS tape, export targets): `memory/promotion-demo-shotlist.md`.**

---

## Board priority & staggered sequence

**Week 0 — warm-up (3–7 days, do not skip):** create + warm HN account (non-link comments); warm Reddit account (genuine comments in r/selfhosted, r/ClaudeAI, r/programming = the "90"); record demo GIF → README top; seed 5–20 genuine stars; verify install one-liner on a clean machine; write/check the HN comment.

| When | Board | Fit | Anchor | Why |
|---|---|---|---|---|
| Day1 Tue–Thu 9–11am ET | **Show HN** | High | Tool + four-words idea in first comment | Cold-start-friendly; high signal |
| Day1 ∥ | **r/selfhosted** | High | BYOH / self-hosted framing | Loves Docker-only, no-SaaS |
| Day1 ∥ | **r/ClaudeAI** | V.High | "wrapped Claude Code + cron" | Native, friendly, 900k+; *complementary* |
| Day2+ if HN lands | **r/programming**, **r/opensource** | Med | compound-engineering | Stricter; use HN as proof |
| Day2–3 | **r/devops**, **r/commandline** | Med | containers-microVMs / CLI | Adjacent infra |
| Wk1–2 | **dev.to / Hashnode** | Med | syndicate posts w/ canonical | Long-tail SEO |
| Wk1+ | **X / Bluesky** | Low-Med | building-in-public + GIF | Compounds slowly; understate AI |
| Wk2–3 if traction | **Product Hunt** | Med | tagline + demo video | Only once stars validate |
| Month2 proven | **awesome-lists** (docker/selfhosted/devops) | Med | 1-line + repo | Maintainers want proof first |
| Month1+ if invited | **lobste.rs** | Med-High | containers-microVMs deep-dive | Invite-gated; tool incidental |

---

## Per-board #1 gotcha

- **Show HN** — `Show HN: <name> – <plain desc>`, no hype/no `!`, Tue–Thu AM ET, one calm "why I built this" comment (not the landing page), engage every reply. **Kill-shot:** marketing voice → downvote spiral.
- **lobste.rs** — invite-only, <25% self-promo of all activity, deep-dive w/ tool incidental. **Kill-shot:** announcement-channel use = ban.
- **r/selfhosted / r/devops** — frame as "didn't want SaaS X / N CLIs." **Kill-shot:** same link to both subs in a week = spam flag.
- **r/ClaudeAI** — native, friendly. **Kill-shot:** positioning as a Claude Code *competitor* (frame as a layer *around* it).
- **r/programming / r/opensource** — 90/10 automod. **Kill-shot:** cold account + link-only = auto-removed; lead with the idea.
- **dev.to / Hashnode** — publish on oh.mifune.dev first, syndicate w/ **canonical URL**. **Kill-shot:** no canonical.
- **X / Bluesky** — problem→design→GIF→link. **Kill-shot:** daily link-spam; AI-hype framing on Bluesky.
- **Product Hunt** — sharp tagline + demo video. **Kill-shot:** saturation drowns weak differentiators.

---

## Messaging matrix

**Lead with:** (1) one project, one sandbox; (2) markdown crons (body *is* the prompt); (3) Docker is your only dependency; (4) engine-agnostic; (5) composable Compose overlays, no lock-in.

**Never say:** "revolutionary," "10x," "AI-powered," `!`-hype, "future of coding," emoji-stuffing on HN/lobste.rs, "replaces Claude Code/Cursor."

**Honest hook (everywhere):** *"There are a lot of agent runners now. The one I wanted and couldn't find was scoped to a single repo, ran on a schedule I could read as plain markdown, and needed nothing on my laptop but Docker. So I built it."*

---

## Draft copy (paste-ready — personalize lightly)

### Show HN

**Title options (≤80 chars, no hype):**
- `Show HN: Open Harness – a Docker sandbox that runs a coding agent on a cron`
- `Show HN: Open Harness – one container, one repo, an agent that wakes on a schedule`
- `Show HN: Open Harness – markdown-defined crons that wake a coding agent`

**URL:** `https://github.com/mifunedev/openharness`

**First comment (post immediately):**
> I've been calling everything "an agent" for two years and kept building setups that were hard to reason about. Open Harness is the version that finally felt clean: one Docker container scoped to one repo and branch, with a coding agent (Claude Code by default, also Codex/Pi) living inside it. The only thing on my laptop is Docker.
>
> Two design decisions it's built around, in case they're useful even if the tool isn't:
>
> - **One project, one sandbox.** Not a multi-tenant rig for racing agents against each other. The agent owns its workspace and branch; nothing it does touches the host unless I promote it.
> - **Crons are markdown.** A `crons/*.md` file is YAML frontmatter plus a body — and the body *is* the prompt fired at the agent on schedule. A ~100-line runtime parses it. So "wake up hourly and triage the repo" is a file you read, not a config that triggers separate code.
>
> What it deliberately doesn't do: in-box multi-agent fan-out (that's a separate pack), and it shares the host kernel — it's a container, not a microVM, because the threat model is *my own* confused agent, not untrusted tenants. I wrote up why a Firecracker microVM *doesn't* replace the container here if anyone wants the reasoning: [oh.mifune.dev/blog/containers-microvms-vms].
>
> Install is `curl -fsSL https://oh.mifune.dev/install.sh | bash` (Docker only; ~10 min cold build). It's MIT. Happy to get torn apart on the design — especially the single-project constraint, which is the part people push back on.

*(Keep to one comment; reply to critiques individually.)*

### r/selfhosted

**Title:** `I built an open-source Docker harness so a coding agent runs against one repo on a schedule — no SaaS, no host install`

**Body:**
> I didn't want to pay for a hosted "AI engineer," and I didn't want to install four different agent CLIs (and the Node/Python versions they each demand) on my laptop. So I built Open Harness: a single Docker container scoped to one repo, with a coding agent running inside it. Host dependency is just Docker.
>
> The part that's relevant to this sub:
> - **Self-hosted, no SaaS** — your machine, your container, your agent. MIT.
> - **Markdown-defined cron** — drop a `crons/*.md` file and the agent wakes on that schedule and runs the prompt in the file (e.g. "review open PRs and the memory log hourly"). A tiny in-container runtime drives it; no external scheduler.
> - **Composable infra** — Postgres, Cloudflare tunnels, SSH are opt-in Docker Compose overlays, not bundled bloat.
> - **Engine-agnostic** — defaults to Claude Code, but Codex and Pi work against the same workspace.
>
> What it's *not*: a multi-tenant platform. Deliberately one-project / one-sandbox. Repo: github.com/mifunedev/openharness — happy to answer setup questions.

### r/ClaudeAI

**Title:** `I wrapped Claude Code in a Docker harness + markdown cron so it can work on one repo autonomously`

**Body:**
> Love Claude Code, but I wanted it to (a) live in an isolated sandbox per project and (b) wake itself on a schedule instead of me babysitting a session. So I built Open Harness — an MIT, Docker-based harness that runs Claude Code inside a long-lived container scoped to a single repo/branch.
>
> The cron part is the fun bit: schedules are plain markdown. A `crons/heartbeat.md` is just YAML frontmatter + a prompt body, and the runtime fires that prompt on schedule. Mine reads the memory log every hour and surfaces anything stale; you could have it triage issues, open PRs, run tests overnight.
>
> Engine-agnostic under the hood (Codex and Pi work too), but I run it on Claude Code. It's a layer *around* Claude Code, not a replacement — giving your CC session a body, a schedule, and a memory that survives restarts.
>
> Repo: github.com/mifunedev/openharness. Curious what autonomous cron jobs people here would actually want to run.

### X / Bluesky thread (understate AI on Bluesky)

1. I kept installing a new coding-agent CLI every month and rotting my laptop's toolchain. So I built the opposite: one Docker container, one repo, the agent lives *inside*. Host dependency = Docker. Nothing else. 🧵
2. The core constraint is on purpose: **one project, one sandbox.** Not a rig for racing agents. The agent owns its branch and workspace; my laptop stays clean.
3. The part I like most: **crons are markdown.** A `crons/*.md` file's body *is* the prompt the agent runs on schedule. "Wake hourly, triage the repo" is a file you read — not a config wired to separate code. [demo GIF]
4. Defaults to Claude Code but Codex and Pi run against the same workspace. Postgres / tunnels / SSH are opt-in Compose overlays — no lock-in. MIT.
5. Try it: `curl -fsSL https://oh.mifune.dev/install.sh | bash` (Docker only). Repo → github.com/mifunedev/openharness. Tearing-apart welcome, especially on the single-project design.

### dev.to / Hashnode syndication

- **First syndication:** `compound-engineering` (broad) or `four-words` (most original).
- **Canonical URL:** set to `oh.mifune.dev/blog/<slug>` — publish there first, syndicate second.
- **Tags:** `#ai`, `#devops`, `#docker`, `#opensource` (dev.to caps at 4).
- **Footer CTA:** *"Open Harness is the MIT tool these patterns come from — github.com/mifunedev/openharness."*

---

## Success metrics & contingencies

**Round-one targets (cold start):** Show HN >10 pts + a real thread (front page = upside, not the bar); GitHub +50–250 stars over 1–2 weeks + 5+ substantive issues/discussions; a Reddit post that survives automod with genuine Q&A.

**Contingencies:** HN flops (<5 pts off /new) → don't repost the URL; a week later submit a *blog post* as a regular HN link (four-words or containers stands alone), repo discoverable underneath. Reddit auto-removal → account wasn't warm; comment another week, retry idea-first. No traction → the 4 posts are independent at-bats; space them out.

---

## Pre-launch verification (clear before Day 1)

1. Install one-liner works from clean state (`curl … | bash` → sandbox builds → `make shell` → agent launches). A broken first-run on HN is fatal.
2. Every link in the copy resolves (repo, oh.mifune.dev install/docs/blog).
3. README launch-ready (demo GIF top, one-liner above the fold).
4. Each draft post checked vs that board's #1 gotcha (HN: zero marketing/no `!`; Reddit: problem-first; dev.to: canonical; Bluesky: understate AI).
5. Accounts warmed (HN non-link comments; Reddit genuine activity = the "90").
6. A handful of genuine early stars before the Reddit/PH posts (which display star count).

---

## Source research (2026-06-10)

- Competitive landscape: OpenHands (multi-tenant), Aider (CLI editor), SWE-agent (issue-reactive, Princeton), Devin (closed SaaS), Claude Code (interactive), Cursor/Windsurf (IDE), Autobot (cron+loop, Crystal), K8s Agent Sandbox (cluster-scale). Niche owned: single-project + markdown-cron + self-hosted + engine-agnostic.
- Board-norm sources: HN Show HN guidelines + timing; lobste.rs about/self-promo (<25%); Reddit 90/10; dev.to/Hashnode canonical URLs; Bluesky AI-hype backlash; r/ClaudeAI ~900k.
