---
id: blog-writer
title: "Blog Writer"
sidebar_position: 2
---

# Blog Writer

The Blog Writer is a technical content agent that writes for [ruska.ai/blog](https://ruska.ai/blog) — a blog showcasing AI expertise and driving leads for Ruska AI's automation services. It runs on a weekly heartbeat, rotates through five content pillars (Service Spotlight, Technical How-To, Industry Trends, Behind the Build, Tool Reviews), and produces a fully-formatted blog post plus LinkedIn and X promotional drafts, then opens a PR against the `ruska-ai/website` repository for human review. As its `SOUL.md` states: "You write posts that a developer would bookmark and an SMB owner would forward to their team."

## Branch

[github.com/ryaneggz/open-harness@agent/blog-writer](https://github.com/ryaneggz/open-harness/tree/agent/blog-writer)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/ryaneggz/open-harness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/blog-writer origin/agent/blog-writer
cd .worktrees/agent/blog-writer
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/AGENTS.md)

## Workspace contents

- [`workspace/.claude/skills/blog-writing/SKILL.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/skills/blog-writing/SKILL.md) — primary skill: blog post creation, social media derivation, PR workflow, and exact frontmatter format
- [`workspace/.claude/agents/agent-builder.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/agents/agent-builder.md) — sub-agent for scaffolding new agents
- [`workspace/.claude/agents/command-builder.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/agents/command-builder.md) — sub-agent for building CLI commands
- [`workspace/.claude/agents/skill-builder.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/agents/skill-builder.md) — sub-agent for building new skills
- [`workspace/.claude/posts/linkedin-template.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/posts/linkedin-template.md) — LinkedIn post template
- [`workspace/.claude/posts/x-template.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.claude/posts/x-template.md) — X.com post template
- [`workspace/heartbeats/blog-writer.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/heartbeats/blog-writer.md) — weekly blog post heartbeat (Mondays 9am MT)
- [`workspace/heartbeats/memory-distill.md`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/heartbeats/memory-distill.md) — Sunday memory distillation heartbeat
- [`workspace/.pi/banner.json`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.pi/banner.json) — custom Pi agent banner
- [`workspace/.pi/extensions/custom-banner.ts`](https://github.com/ryaneggz/open-harness/blob/agent/blog-writer/workspace/.pi/extensions/custom-banner.ts) — Pi banner extension

## How to use it

Start the sandbox and enter the container with `make shell`. The agent runs Claude Code inside `workspace/`. The weekly heartbeat fires every Monday at 9am MT and runs the full blog-writing workflow automatically: it reads `MEMORY.md` for pillar rotation context, checks the published posts in `ruska-ai/website` to avoid duplicates, picks a topic, writes an 800–1500 word post with correct frontmatter, derives a LinkedIn post (50–200 words) and an X post (under 280 characters), creates a PR against `ruska-ai/website:master`, and logs the result. You can also invoke the `/blog-writing` skill interactively to trigger a post on demand or to draft content for a specific topic.

## Customization tips

The agent reads `heartbeats.conf` for its schedule. To change the posting day or time, edit `workspace/heartbeats.conf` and run `make heartbeat` from the host to sync. Content pillar rotation and topic avoidance are tracked in `workspace/MEMORY.md` and `workspace/memory/YYYY-MM-DD.md` — update `MEMORY.md` to seed a preferred pillar sequence. The blog's author fields (name, LinkedIn URL, avatar) are defined in the `/blog-writing` skill's frontmatter template; update them there if the author changes.

## Best practices observed

- Content pillar rotation is tracked in `MEMORY.md` to prevent clustering — the heartbeat reads recent memory entries before picking a topic.
- Blog post is always the primary artifact; LinkedIn and X posts are derived from it rather than written independently, keeping all three consistent.
- Weekly heartbeat fires via cron (`heartbeats.conf`) and writes structured memory logs so the next run can resume context without re-reading history.
