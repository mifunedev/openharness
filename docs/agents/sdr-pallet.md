---
id: sdr-pallet
title: "SDR — Pallet"
sidebar_position: 8
---

# SDR — Pallet

SDR Pallet is a sales development representative agent built for a North Carolina-headquartered shipping-pallet manufacturer. Its mission, as stated in IDENTITY.md, is to "source, qualify, and hand off pallet-buying prospects in NC and the Southeast so the human owner can close more deals." The agent works a file-based CRM (CSV + JSON), drafts cold-email sequences through a multi-touch template library (covering verticals such as 3PL warehouses and breweries), and enforces strict BANT-Hybrid qualification gates before producing a handoff packet. It never generates pricing or quotes, and every outbound draft must pass the `/outreach-gate` content-quality check before it is considered deliverable.

## Branch

[github.com/ryaneggz/open-harness@agent/sdr-pallet](https://github.com/ryaneggz/open-harness/tree/agent/sdr-pallet)

## Spin up

```bash
# Clone the harness and check out this agent's branch in a worktree:
git clone https://github.com/ryaneggz/open-harness.git ~/.openharness
cd ~/.openharness
mkdir -p .worktrees/agent
git worktree add .worktrees/agent/sdr-pallet origin/agent/sdr-pallet
cd .worktrees/agent/sdr-pallet
make sandbox
make shell
```

First files to read inside the sandbox:
- [`AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/AGENTS.md)
- [`workspace/AGENTS.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/AGENTS.md)

## Workspace contents

- **Skills** (under [`workspace/.claude/skills/`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/))
  - [`/attention-list`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/attention-list/SKILL.md) — composite-score rank of top leads to work today
  - [`/cold-email`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/cold-email/SKILL.md) — draft outbound touches, writes to `crm/drafts/`
  - [`/crm-read`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/crm-read/SKILL.md) / [`/crm-write`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/crm-write/SKILL.md) — structured CRM access with enum validation
  - [`/lead-research`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/lead-research/SKILL.md) — prospect profiling, writes to `crm/drafts/<id>/research.md`
  - [`/lead-source`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/lead-source/SKILL.md) — surface new prospect candidates for a given vertical or territory
  - [`/outreach-gate`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/outreach-gate/SKILL.md) — content-quality and deliverability gate before any draft is considered live-ready
  - [`/pipeline-review`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/pipeline-review/SKILL.md) — stage counts, conversion rates, stuck leads
  - [`/handoff-packet`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/handoff-packet/SKILL.md) — generate the summary the human owner receives at `qualified`
  - [`/discovery-call`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/discovery-call/SKILL.md), [`/lead-import`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/lead-import/SKILL.md), [`/template-library`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/template-library/SKILL.md), [`/template-write`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/template-write/SKILL.md), [`/content-gate`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/content-gate/SKILL.md)
  - Wiki skills: [`/wiki-ingest`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/wiki-ingest/SKILL.md), [`/wiki-query`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/wiki-query/SKILL.md), [`/wiki-lint`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/skills/wiki-lint/SKILL.md)
- **Heartbeats** (YAML frontmatter in each `.md` file)
  - [`morning-pipeline.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/morning-pipeline.md) — weekdays 08:00 ET: run `/attention-list` + `/pipeline-review`, surface follow-ups and stuck leads
  - [`weekly-pipeline-review.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/weekly-pipeline-review.md) — Mondays 09:00 ET: stage conversion, wins/losses, template-coverage gaps
  - [`stuck-lead-sweep.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/stuck-lead-sweep.md) — Wed + Fri 10:00 ET: mid-week nudge on past-threshold leads
  - [`weekly-lead-source.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/weekly-lead-source.md) — weekly prospecting run for new candidates
  - [`memory-distill.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/memory-distill.md), [`wiki-lint.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/wiki-lint.md), [`nightly-release.md`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/heartbeats/nightly-release.md)
- **CRM data** — [`crm/leads.csv`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/crm/leads.csv), [`crm/stages.json`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/crm/stages.json), [`crm/schema.json`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/crm/schema.json), email templates under [`crm/templates/`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/crm/templates/)
- **Wiki** — [`wiki/sources/`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/wiki/sources/) pre-loaded with `pallet-industry-primer.md`, `nc-logistics-context.md`, and `sdr-playbook.md`
- **Slack hook** — [`workspace/.claude/hooks/notify_slack.sh`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/.claude/hooks/notify_slack.sh); Slack bot auto-starts when `SLACK_APP_TOKEN` + `SLACK_BOT_TOKEN` are set

## How to use it

Start the sandbox and open Claude Code (`claude`). The agent follows a five-heartbeat weekly rhythm — morning pipeline review every weekday, weekly conversion summary on Monday, stuck-lead sweeps midweek, and a Friday pipeline review. During interactive sessions you can ask the agent to source leads for a specific vertical (`/lead-source vertical=brewery territory=NC`), draft a cold-email touch (`/cold-email`), or run the morning pipeline manually. Every draft goes through `/outreach-gate` before it is considered ready; the agent never bypasses this gate. When a lead reaches `qualified`, the agent generates a handoff packet for the human owner to take into the quoting stage.

## Customization tips

Territory, vertical focus, and stuck-lead thresholds are defined in [`crm/stages.json`](https://github.com/ryaneggz/open-harness/blob/agent/sdr-pallet/workspace/crm/stages.json) and referenced in IDENTITY.md — edit those to shift geography or add new verticals. The Slack bot requires `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` in the sandbox environment; without them the agent runs headlessly. See `workspace/AGENTS.md` on the branch for the full env-var and channel customization guide, and `workspace/IDENTITY.md` for the complete territory and principal configuration.

## Best practices observed

- `/outreach-gate` is a hard gate: no draft is treated as deliverable until it returns `PASS`, protecting sender reputation at the 50-200 outbound-per-week scale.
- Five purpose-built heartbeats create a structured weekly cadence — morning pipeline Monday through Friday, stuck-lead sweeps Wednesday and Friday — without requiring manual triggers.
- The wiki (`wiki/sources/`) is pre-seeded with an industry primer, NC logistics context, and an SDR playbook, giving the agent grounded, citable knowledge before any live research.
