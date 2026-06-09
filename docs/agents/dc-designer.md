---
id: dc-designer
title: "DC Designer"
sidebar_position: 3
---

# DC Designer

The DC Designer is a datacenter design engineering agent that autonomously develops a 50MW→200MW hyperscale AI datacenter facility. It works across 15 interconnected plan documents (power, cooling, network, compute, storage, layout, redundancy, security, sustainability, cost model, 3D visualization, phased rollout, and buildout requirements), a FreeCAD parametric 3D model (`model_datacenter.py`) that generates 10 STL layers, and an interactive Three.js viewer (`output/dc_viewer.html`) served via Cloudflare tunnel at `https://dc-designer.ruska.dev`. The agent runs on three heartbeats — an hourly autonomous enhancement pipeline, a weekly design review, and a weekly memory distillation — and enforces quality through a seven-gate pre-merge pipeline before any feature lands.

## Branch

[github.com/mifunedev/openharness@agent/dc-designer](https://github.com/mifunedev/openharness/tree/agent/dc-designer)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/mifunedev/openharness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/dc-designer origin/agent/dc-designer
cd .worktrees/agent/dc-designer
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/AGENTS.md)

## Workspace contents

**Skills (7 pipeline-specific + 2 templates + 1 utility):**
- [`workspace/.claude/skills/design-consistency/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/design-consistency/SKILL.md) — 7-gate cross-document validation (power budget, cooling match, space allocation, cost coherence, phase alignment, redundancy claims, PUE feasibility)
- [`workspace/.claude/skills/model-review/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/model-review/SKILL.md) — code quality and plan alignment audit for `model_datacenter.py`
- [`workspace/.claude/skills/enhancement-quality-tracker/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/enhancement-quality-tracker/SKILL.md) — quality scoring and trend analysis across features
- [`workspace/.claude/skills/implementation-drift-gate/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/implementation-drift-gate/SKILL.md) — 7-gate plan/model/viewer drift detection
- [`workspace/.claude/skills/pre-merge-gate/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/pre-merge-gate/SKILL.md) — hard gate checking artifact completeness before PR merge
- [`workspace/.claude/skills/iteration-closeout/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/iteration-closeout/SKILL.md) — post-merge workflow enforcer
- [`workspace/.claude/skills/pipeline-strategy-review/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/pipeline-strategy-review/SKILL.md) — strategy effectiveness tracker
- [`workspace/.claude/skills/tunnel-setup/SKILL.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.claude/skills/tunnel-setup/SKILL.md) — Cloudflare tunnel management

**Heartbeats:**
- [`workspace/heartbeats/enhance-datacenter.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/heartbeats/enhance-datacenter.md) — hourly autonomous feature pipeline (24/7)
- [`workspace/heartbeats/design-review.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/heartbeats/design-review.md) — weekly design review (Wednesdays 10am MT)
- [`workspace/heartbeats/memory-distill.md`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/heartbeats/memory-distill.md) — weekly memory distillation (Sundays 8pm MT)

**Custom extension:**
- [`workspace/.openharness/banner.json`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.openharness/banner.json) — custom banner configuration
- [`workspace/.openharness/extensions/custom-banner.ts`](https://github.com/mifunedev/openharness/blob/agent/dc-designer/workspace/.openharness/extensions/custom-banner.ts) — custom banner extension

## How to use it

Run `/setup` from the host after provisioning the sandbox to complete end-to-end setup: it builds the Docker image, starts the container, installs tools, clones the `ai-datacenter-designer` target project into `workspace/ai-datacenter-designer/`, syncs heartbeats, starts the HTTP viewer on port 8200, and brings up the Cloudflare tunnel. Once running, the hourly heartbeat drives autonomous feature development: each pulse checks for a resumable pipeline state, picks the next feature from `enhancements/tracker.md`, creates a per-feature worktree, implements the feature across model/plans/viewer, runs the full pre-merge gate, and merges on pass. The weekly design review runs `/design-consistency` to validate cross-document figures. You can also interact with the agent directly inside the sandbox to request specific features or investigate drift.

## Customization tips

The tunnel hostname (`dc-designer.ruska.dev`) is managed by the `/tunnel-setup` skill and stored in `~/.cloudflared/config-dc-designer.yml` inside the container. To use a different tunnel or disable it, edit that config and restart cloudflared. Heartbeat intervals are set in `workspace/heartbeats.conf`; the hourly enhancement cadence can be slowed by changing the cron expression and running `make heartbeat` from the host. The feature backlog lives in `workspace/ai-datacenter-designer/enhancements/tracker.md` — add entries there to queue new work for the enhancement pipeline.

## Best practices observed

- Hourly enhancement heartbeat uses a persistent JSON pipeline-state file (`enhancements/.pipeline-state.json`) to resume mid-feature across container restarts without losing progress.
- Pre-merge gate (7 checks including plan/model/viewer drift) is a hard gate — the pipeline does not merge unless all gates pass, enforcing consistent quality across the 15-document design corpus.
- Feature work always happens in per-feature worktrees (`~/repo/.worktrees/feat/<N>-<slug>`), never directly on `main`, keeping the trunk stable while the hourly pipeline runs autonomously.
