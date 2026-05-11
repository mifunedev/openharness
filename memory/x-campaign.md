# Open Harness X Campaign

Created: 2026-05-04

## Purpose

Track the weekly Sunday X scheduling effort for Open Harness so future
sessions can continue the campaign without reconstructing context from chat.

## Channel

- Automated channel: X only, via Post Bridge.
- Account used: `JohnEggz`
- Post Bridge social account id: `41738`
- Developer-board submissions stay manual and separate from this queue.
- Do not use "please star" language. Soft CTAs may include repo/docs links.
- Use tasteful emoji markers to improve scanability. Prefer 2-4 structural
  emojis per post, usually as bullets or section leads, not decoration after
  every sentence.

## Weekly Workflow

Every Sunday evening in America/Denver:

1. Review previous week's stars, clicks, comments, and docs visits.
2. Pick 2-3 posts for the coming week.
3. Ensure every post shows a concrete repo capability:
   - harness structure
   - heartbeats
   - Ralph
   - crons
   - tmux
   - supported agents
   - overlays
4. Schedule through Post Bridge for Tuesday, Thursday, and optionally Saturday.
5. Do not schedule more than 3 posts per week.
6. Use light emoji structure when it makes the post easier to scan.

## Week 1 Scheduled Posts

These were created in Post Bridge on 2026-05-04 and updated with emoji
structure on 2026-05-04.

| Date UTC | Post Bridge id | Status | Topic |
|---|---|---|---|
| 2026-05-05T18:30:00Z | `5ba2f7eb-06d5-485d-8145-791a1861c196` | scheduled | Same harness structure across Claude Code, Codex, OpenCode, Pi, and DeepAgents |
| 2026-05-07T18:30:00Z | `4397c0c9-1476-4af8-ab12-81f326575839` | scheduled | Heartbeats as markdown cron tasks |
| 2026-05-09T17:00:00Z | `6df45de4-a2eb-47ee-890f-51df6769eaf9` | scheduled | Ralph task loop with `prd.json`, `prompt.md`, `progress.txt`, and `scripts/ralph.sh` |

## Week 2 Scheduled Posts

Created in Post Bridge on 2026-05-10.

| Date UTC | Post Bridge id | Status | Topic |
|---|---|---|---|
| 2026-05-12T18:30:00Z | `147aff3c-666c-4af3-8742-dd33c144aaec` | scheduled | Compose overlays — modular docker-compose stacks |
| 2026-05-14T18:30:00Z | `d23a5b93-eceb-4e8c-96f6-402f00e864f3` | scheduled | Slack Pi extension at `.pi/extensions/slack/` |
| 2026-05-16T17:00:00Z | `58b60ffc-26c7-4ce9-80fc-e45ca81e6545` | scheduled | Cloudflare named tunnels via `/cloudflared-tunnel` |

## Week 2 Captions

Tuesday:

> 🧩 Open Harness sandboxes are modular docker compose stacks.
>
> 🌐 `cloudflared` for tunnels
> 🐘 `postgres` for a dev DB
> 🔑 `ssh` to share host keys
> 🪞 `*-host` to share agent auth
>
> All flipped on in one config.
>
> Docs: https://oh.mifune.dev/docs/guide/overlays

Thursday:

> 💬 Open Harness can live in Slack.
>
> 🧩 Drop the Pi Slack extension into `.pi/extensions/slack/`
> 🔑 Add bot + app tokens to env
> 📨 Mention the bot or DM it
>
> Your sandbox agent talks where your team already does.
>
> Docs: https://oh.mifune.dev/docs/integrations/slack

Saturday:

> 🌐 Expose a sandbox app to a real URL in one step.
>
> 🚇 `/cloudflared-tunnel` builds a named tunnel
> 📝 Writes the ingress config
> 🧭 Routes DNS — all idempotent
>
> Docs: https://oh.mifune.dev/docs/integrations/cloudflare

## Week 1 Captions

Tuesday:

> 🧰 Same harness shape across Claude Code, Codex, OpenCode, Pi, and DeepAgents.
>
> 📦 One container
> 🗂️ One workspace template
> 🔁 One lifecycle
>
> Quickstart: https://oh.mifune.dev/docs/quickstart

Thursday:

> ⏱️ Heartbeats in Open Harness are plain markdown cron tasks.
>
> 📝 `crons/*.md` names the schedule, prompt, and checks
> 🔁 the runtime wakes the agent
> 📓 progress lands back in the repo
>
> Docs: https://oh.mifune.dev/docs/crons/overview

Saturday:

> 🔁 Ralph is the task loop in Open Harness.
>
> 📋 `tasks/<name>/prd.json` defines the work
> 🧭 `prompt.md` guides each pass
> 📓 `progress.txt` records state
> ⚙️ `scripts/ralph.sh` runs the harness
>
> Repo: https://github.com/ryaneggz/open-harness

## Follow-Up Cadence

The follow-ups below are also tracked in `crons/heartbeat.md`.

- 2026-05-10: schedule week 2.
- 2026-05-17: schedule week 3.
- 2026-05-24: schedule week 4.
- 2026-06-01: review campaign and decide whether to extend, pause, or do a Product Hunt/HN push.

## Operational Notes

- Post Bridge instructions live at `.claude/skills/post-bridge/SKILL.md`.
- The Post Bridge API key is available in the skill folder `.env`; do not print or expose it.
- For future API calls, load the `.env` into process memory and print only sanitized account/post metadata.
- Create text-only scheduled posts with:
  - `social_accounts: [41738]`
  - `caption`
  - `scheduled_at`
  - `platform_configurations.twitter.caption`
