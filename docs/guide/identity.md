---
title: "Identity & Memory"
sidebar_position: 7
---


Workspace files give agents persistent identity and durable memory across sessions.

## Files

| File | Purpose | Authored by |
|------|---------|-------------|
| `SOUL.md` | Agent persona, tone, boundaries | User (seeded with template) |
| `MEMORY.md` | Curated long-term memory | Agent (distilled from daily logs) |
| `memory/YYYY-MM-DD/log.md` | Daily append-only logs | Agent |

## How memory works

Agents read `MEMORY.md` at session start for accumulated context and distill daily logs into it periodically. When the user says "remember this," agents write to `MEMORY.md` immediately.

Daily logs live at `memory/YYYY-MM-DD/log.md` — agents append structured entries during work sessions. Other artifacts for that day (decisions, archived task folders, transcripts) sit alongside `log.md` in the same directory. The directory-per-day layout is canonical per SPEC v0.7 §"Memory structure"; flat `memory/<date>.md` files are deprecated.

## SOUL.md

Defines the agent's persona and boundaries. The agent may evolve it over time but must inform the user when it does. This file contains personality and values, not procedures or coding standards.

## MEMORY.md

Curated, durable memory distilled from daily logs. Contains decisions, lessons learned, recurring patterns, and triage history. The [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune) harness pack symlinks `.slack/MEMORY.md` so the Slack bot interfaces share the same memory.

Memory stores **operational self-awareness** — what the agent learned from doing work. For **structured domain knowledge** extracted from external documents, see the Wiki system instead.

## Memory protocol

At the end of every task (heartbeat, skill, or interactive session):

1. **Log**: Append a structured entry to `memory/YYYY-MM-DD/log.md`
2. **Qualify**: Did I learn something durable? Is there a recurring pattern?
3. **Improve**: If yes, update `MEMORY.md`. If no, move on.
4. **Never skip**: Even no-ops get logged.
