---
name: reflect
description: |
  Deliberate whole-session memory pass: scan the current conversation for
  durable behavioral patterns, run the qualify filter, classify surviving
  lessons by memory tier, propose MEMORY.md / IDENTITY.md additions for
  confirmation, then write only what was approved plus the mandatory log entry.
  Operationalizes the Memory Improvement Protocol (context/rules/memory.md)
  as an explicit, session-closing skill rather than a per-run afterthought.
  TRIGGER when: /reflect invoked explicitly, or when the session is closing
  and contains decisions, surprises, or failure modes worth preserving.
argument-hint: "[--dry-run]"
---

# Reflect

Extract durable behavioral patterns from the current conversation and promote them — with explicit confirmation — into the harness memory tiers (`memory/MEMORY.md`, `context/IDENTITY.md`). Always appends a log entry regardless of outcome.

This is the deliberate "Improve" pass of the Memory Improvement Protocol defined in `context/rules/memory.md`. Running it as a named skill turns an optional afterthought into a first-class, propose-then-confirm operation.

## When to use

- `/reflect` invoked explicitly to close a session.
- Proactively, after a session that produced decisions, surprises, regressions, or failure modes the next agent would benefit from knowing.

## When NOT to use

- **`/harness-audit`** — audits harness code health via four parallel sub-agents. That is a structural audit, not a behavioral/conversational pass.
- **`/context-audit`** — scores the default-loaded context budget across four dimensions. It trims files, not behaviors.
- **`/skill-lint`** — scores individual skills for staleness. It reviews skill quality, not session outcomes.
- **Trivial sessions** — if the session contained only mechanical read-only queries or single-command invocations with no surprises, announce the skip and proceed to log.

`/reflect` is the only skill whose domain is *current-session behavioral patterns → memory/identity*.

## Scope

Current conversation only. `/reflect` does not read prior daily logs, prior sessions, or the `~/.claude/projects/...` auto-memory store. It works from what is already in context.

## Instructions

### 1. Gather session signals

Scan the current conversation for:
- Decisions made and the reasoning behind them.
- Surprises — things that failed that seemed straightforward, or worked unexpectedly.
- Couplings, constraints, or edge cases that were non-obvious.
- Corrections the user made to the agent's behavior.
- Patterns in what the user asked for repeatedly.

Do not invent signals not present in the conversation.

### 2. Extract candidate patterns

From the signals, draft a list of candidate lessons — one per observation. Write each in one sentence, descriptive tone ("this session showed X"), not prescriptive. Include the session date (UTC).

### 3. Apply the qualify filter

Discard any candidate that matches any row in the "What Does NOT Go in Memory" table (`context/rules/memory.md`):

| Discard if | Reason |
|------------|--------|
| Contains a secret, token, or credential | Memory may be committed |
| Is raw stdout or command output | Use interpretation, not transcript |
| Belongs in a commit message or PR body | Duplication causes drift |
| Is a step-by-step task plan | Plans belong in `tasks/<name>/prd.json` |
| Re-derivable in under a minute | Reading one file answers it — don't memorize |

Also discard any candidate that is already captured, verbatim or in substance, in `memory/MEMORY.md` or `context/IDENTITY.md`. Link or skip; never double-write.

### 4. Classify surviving lessons by tier

For each surviving candidate, classify:

| Tier | Write to | Criterion |
|------|----------|-----------|
| **Log** | `memory/<UTC-date>/log.md` | Transient observation: true of this run, not necessarily future ones. Free to write. |
| **MEMORY.md** | `memory/MEMORY.md` under `## Lessons Learned` | Experiential, session-specific: "this session showed X is true of this codebase." Descriptive tone. Propose-then-confirm. |
| **IDENTITY.md** | `context/IDENTITY.md` under `## Lessons learned (append-only)` | Graduated principle: applies across contexts, not just this run. Prescriptive tone ("always X"). **Never auto-write.** Propose a diff for approval. A lesson earns this only when it generalizes. |

When in doubt between MEMORY.md and IDENTITY.md: if you would scope it to "this session" or "this codebase right now," it belongs in MEMORY.md. If you would remove the scoping and say "always," it belongs in IDENTITY.md.

### 5. Propose-then-confirm gate

Before writing to `memory/MEMORY.md` or `context/IDENTITY.md`, present the proposed additions as a clearly formatted block:

```
Proposed MEMORY.md addition(s):
- YYYY-MM-DD: <one-sentence lesson>

Proposed IDENTITY.md addition(s):
- <prescriptive principle, "always X" or "never Y">

Type APPROVE to write, SKIP to discard any item, or EDIT <n> <new text> to revise.
```

Do not write to either file until the user responds. Log-tier entries do not require approval.

If `--dry-run` was passed, skip writing entirely and report what would have been written.

### 6. Write approved changes

For each APPROVED item:

**`memory/MEMORY.md`** — append under `## Lessons Learned`:
```markdown
- **YYYY-MM-DD**: <lesson>
```

**`context/IDENTITY.md`** — append under `## Lessons learned (append-only)`:
```markdown
- **YYYY-MM-DD**: <principle>
```

Both files are append-only. Never edit existing entries.

### 7. Append the log entry

Always run this step, regardless of whether anything was promoted. Get the current UTC time first:

```bash
date -u +%H:%M
TODAY=$(date -u +%Y-%m-%d)
mkdir -p "memory/$TODAY"
```

Then append to `memory/<UTC-date>/log.md`:

```markdown
## Reflect -- HH:MM UTC
- **Result**: OP | DRY-RUN | SKIPPED-TRIVIAL
- **Candidates**: <count extracted before qualify filter>
- **Promoted**: <count written to MEMORY.md> to MEMORY.md, <count> to IDENTITY.md
- **Observation**: <one sentence on what the session's most significant pattern was, or "no durable patterns found">
```

## MEMORY.md vs IDENTITY.md boundary

| | `memory/MEMORY.md` | `context/IDENTITY.md` |
|-|--------------------|-----------------------|
| **Tone** | Descriptive — "this session showed…" | Prescriptive — "always X", "never Y" |
| **Scope** | Session or codebase-specific observation | Generalizes across contexts |
| **Written by** | This skill, immediately after the session | Only after deliberate review confirms generalization |
| **Changed how** | Append-only; entries are never edited | Deliberate revision; graduation is rare |

A lesson graduates from MEMORY.md to IDENTITY.md when it has recurred across multiple sessions or contexts, not from a single run. Do not graduate prematurely.

## Auto-trigger note

Claude Code skills cannot self-trigger. True automatic firing at session end would require a `Stop` hook configured in `settings.json` via `/update-config`. That is explicitly deferred from v1 of this skill.

## Anti-patterns

- **Proposing without filtering.** Running the qualify filter is not optional — a candidate list that hasn't been filtered is not ready to propose.
- **Writing without confirmation.** MEMORY.md and IDENTITY.md entries require explicit approval. The log entry does not.
- **Double-writing.** If a lesson already exists in MEMORY.md or IDENTITY.md, link or skip. Never add a duplicate.
- **Graduating prematurely.** One session is evidence, not a principle. IDENTITY.md entries need cross-session generalization.
- **Reading outside current context.** Do not read prior `log.md` files or external transcripts. Scope is the open conversation only.
- **Skipping the log.** Every invocation — op, dry-run, trivial skip — appends a log entry. No exceptions.
