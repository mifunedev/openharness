---
id: linkedin-ghostwriter
title: "LinkedIn Ghostwriter"
sidebar_position: 5
---

# LinkedIn Ghostwriter

The LinkedIn Ghostwriter is a content agent that drafts LinkedIn posts in Ryan Eggleston's voice to grow Open Harness adoption. Each heartbeat cycle it consults a style guide, reads reference posts for voice calibration, picks a topic from a rotating queue, and writes a 50–200 word post that must pass a five-item mandatory checklist: a link to the Open Harness repo, at least one concrete proof point (number, command, or file name), an engagement hook, a connection to a specific Open Harness feature, and a closer not used in any previous draft. Drafts are saved to timestamped files for human review — never published automatically. The funnel goal, as stated in the skill: "Followers → Stars → Contributors → Customers (SMB automation services in Southern Utah)."

## Branch

[github.com/mifunedev/openharness@agent/linkedin-ghostwriter](https://github.com/mifunedev/openharness/tree/agent/linkedin-ghostwriter)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/linkedin-ghostwriter origin/agent/linkedin-ghostwriter
cd .worktrees/agent/linkedin-ghostwriter
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/AGENTS.md)

## Workspace contents

**Skills:**
- [`workspace/.claude/skills/linkedin-ghostwriter/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/SKILL.md) — primary skill: content pillar rotation, mandatory checklist, post structure, draft save workflow
- [`workspace/.claude/skills/post-bridge/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/post-bridge/SKILL.md) — Post Bridge API integration for social publishing

**Reference library:**
- [`workspace/.claude/skills/linkedin-ghostwriter/references/style-guide.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/references/style-guide.md) — voice and content strategy guide
- [`workspace/.claude/skills/linkedin-ghostwriter/references/open-harness.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/references/open-harness.md) — repo context and business goals
- [`workspace/.claude/skills/linkedin-ghostwriter/references/posts/`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/references/posts/) — 9 reference posts with screenshots for voice calibration
- [`workspace/.claude/skills/linkedin-ghostwriter/assets/drafts/`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/assets/drafts/) — timestamped draft output (100+ drafts generated)
- [`workspace/.claude/skills/linkedin-ghostwriter/assets/drafts/queue.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.claude/skills/linkedin-ghostwriter/assets/drafts/queue.md) — pending/done topic queue

**Heartbeat:**
- [`workspace/HEARTBEAT.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/HEARTBEAT.md) — heartbeat instructions (LinkedIn Ghostwriter task runs each cycle)

**Custom banner:**
- [`workspace/.pi/banner.json`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.pi/banner.json) — Pi agent custom banner
- [`workspace/.pi/extensions/custom-banner.ts`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/.pi/extensions/custom-banner.ts) — Pi banner extension

**Memory:**
- [`workspace/memory/linkedin-ghostwriter-iterations.md`](https://github.com/mifunedev/openharness/blob/agent/linkedin-ghostwriter/workspace/memory/linkedin-ghostwriter-iterations.md) — per-cycle iteration log (pillar balance, checklist pass/fail, lessons)

## How to use it

Start the sandbox and enter with `make shell`. The agent runs Claude Code inside `workspace/`. Each heartbeat cycle it reads the iteration memory for past learnings, consults the style guide and two reference posts, checks the topic queue, drafts a post with a content-pillar label (Pain→Solution, Build Log, Steal My Workflow, or Honest Reflection), verifies the mandatory checklist, saves the draft to a timestamped file under `assets/drafts/`, updates the queue, and writes a cycle summary to `memory/linkedin-ghostwriter-iterations.md`. You can also invoke the `/linkedin-ghostwriter` skill interactively to draft a post for a specific topic or angle. To publish, copy a draft and use the `/post-bridge` skill or your own publishing workflow.

## Customization tips

Content pillar rotation, topic history, and the mandatory closer log are all tracked in `workspace/memory/linkedin-ghostwriter-iterations.md` and `assets/drafts/queue.md`. Seed the queue's `## Pending` section with specific topics or angles to steer future drafts. The style guide at `references/style-guide.md` defines anti-patterns and formatting conventions — edit it to adjust voice or structural rules. The heartbeat interval is controlled by the host-side `HEARTBEAT_INTERVAL` environment variable (default 1800 seconds). See `workspace/AGENTS.md` on the branch for env-var and channel customization.

## Best practices observed

- Mandatory five-item checklist enforced per draft (repo link, proof point, engagement hook, OH feature connection, unique closer) ensures consistent post quality without relying on the agent's discretion.
- Iteration memory (`linkedin-ghostwriter-iterations.md`) tracks pillar balance across cycles so the agent can self-correct if it clusters on one content type.
- Draft queue (`assets/drafts/queue.md`) maintains a Pending/Done topic ledger, letting the heartbeat pick up pre-seeded topics or generate fresh ones from a different pillar than the previous cycle.
