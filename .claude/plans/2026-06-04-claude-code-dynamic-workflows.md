# Claude Code Dynamic Workflows Wiki Research Plan

> **For Hermes:** Use subagent-driven-development skill to execute this plan after Ryan confirms. Use `/delegate`-style wave execution for research and review only. Do **not** use haiku; use the default capable model or sonnet where a model must be explicit.

**Goal:** Thoroughly research Claude Code dynamic workflows, starting from `https://code.claude.com/docs/en/workflows`, and preserve the deep understanding in the Open Harness wiki.

**Architecture:** This is a knowledge-capture task, not a runtime feature. The implementation scope is limited to wiki surfaces: raw source snapshot(s), a dedicated `wiki/claude-code-dynamic-workflows.md` entry, and cross-links from the existing inspectable/Pi workflow entry so Claude Code dynamic workflows and Pi dynamic workflows are represented as related counterparts.

**Tech Stack:** Open Harness wiki schema (`context/rules/wiki.md`), `/wiki-ingest` rules, Markdown source snapshots under `wiki/raw/`, entity pages under `wiki/`, and the daily memory log required by wiki ingest.

---

## Corrected Scope

This plan intentionally does **not** add cron runtime support, docs changes, CLI changes, workflow wrappers, tests for code behavior, or any Open Harness product feature. The only intended repository changes are wiki knowledge-retention artifacts.

The research should start with the official Claude Code dynamic workflows page:

- `https://code.claude.com/docs/en/workflows`
- Prefer the markdown source when available: `https://code.claude.com/docs/en/workflows.md`

Then cross-check related official Claude Code docs only where they clarify dynamic workflows:

- `https://code.claude.com/docs/en/agents`
- `https://code.claude.com/docs/en/sub-agents`
- `https://code.claude.com/docs/en/agent-teams`
- `https://code.claude.com/docs/en/worktrees`
- `https://code.claude.com/docs/en/hooks`
- `https://code.claude.com/docs/en/permissions`
- `https://code.claude.com/docs/en/sandboxing`
- `https://code.claude.com/docs/en/settings`
- `https://code.claude.com/docs/en/commands`
- `https://code.claude.com/docs/en/claude-directory`

The existing wiki entry `wiki/inspectable-agent-harness.md` should be treated as the umbrella/Pi-side context because it captures the LinkedIn post about Pi, pi-subagents, pi-dynamic-workflows, Atomic, and inspectable agent harnesses. The new Claude Code entry should be related to it, not replace it.

---

## Research Questions

The final wiki entry should answer these questions with source-backed detail:

1. What are Claude Code dynamic workflows?
2. What version/plan requirements and availability constraints apply?
3. How are workflows invoked?
   - `/deep-research`
   - prompt-triggered workflow / `ultracode`
   - `/effort ultracode`
   - saved workflow commands
4. How does the runtime work?
   - JavaScript orchestration script
   - isolated runtime separate from the main conversation
   - background execution
   - intermediate results in script variables
   - final result returned to conversation
5. What is known about workflow script semantics?
   - Claude-written JavaScript
   - `args` input for saved workflows
   - script coordinates subagents but has no direct filesystem/shell access
   - public docs do not expose a stable manual workflow authoring API
6. How do workflows relate to subagents, skills, agent teams, and `/batch`?
7. How do permissions and sandboxing apply?
   - launch approval prompt
   - permission-mode differences
   - workflow subagents running in `acceptEdits`
   - inherited tool allowlist
   - no interactive prompt in `claude -p` / Agent SDK
   - sandboxed Bash as separate protection layer
8. What inspectability surfaces exist?
   - view raw script before run
   - `Ctrl+G` editor flow
   - scripts written under `~/.claude/projects/`
   - `/workflows` run list and progress view
   - drill-down into phases, agent prompts, tool calls, results, tokens
9. What artifacts/results are documented, and what is not documented?
10. How do pause/resume/stop/restart/save controls work?
11. How are workflows disabled or governed?
12. What limits/cost risks exist?
   - max concurrent agents
   - max total agents
   - no mid-run user input
   - session-bound resume
   - token/rate-limit concerns
13. How should this entry relate to Pi dynamic workflows / `wiki/inspectable-agent-harness.md`?

---

## Proposed Wiki Shape

### New entry: `wiki/claude-code-dynamic-workflows.md`

Create a dedicated entry with valid frontmatter:

```yaml
---
title: "Claude Code Dynamic Workflows"
slug: claude-code-dynamic-workflows
tags: [claude-code, dynamic-workflows, subagents, agent-harness, inspectable-workflows]
created: 2026-06-04
updated: 2026-06-04
sources:
  - raw/2026-06-04-claude-code-dynamic-workflows.md
related: [inspectable-agent-harness]
confidence: provisional
---
```

The body must follow wiki schema order:

```md
# Claude Code Dynamic Workflows

## Summary
<2-3 sentence synthesis.>

## Detail
<Bounded prose, ≤600 words total for the entry, with dense factual synthesis.>

## See Also
- [[inspectable-agent-harness]]
```

### Raw snapshot: `wiki/raw/2026-06-04-claude-code-dynamic-workflows.md`

Capture the official docs and research notes in a raw snapshot. Include:

- Source header for `https://code.claude.com/docs/en/workflows`
- Retrieved markdown or normalized excerpts from `workflows.md`
- Related official docs URLs used for cross-checking
- Notes that distinguish documented facts from inferences
- The LinkedIn URL only as prior context if used, not as the primary source

The raw snapshot can be longer than the wiki entry. It is the provenance trail for future agents.

### Existing entry update: `wiki/inspectable-agent-harness.md`

Update the existing umbrella entry minimally:

- Add `claude-code-dynamic-workflows` to `related`.
- Add `- [[claude-code-dynamic-workflows]]` under `## See Also`.
- If there is room under the 600-word cap, add one sentence explaining the relationship:
  - Pi/pi-dynamic-workflows is the Pi-side example from the LinkedIn post.
  - Claude Code dynamic workflows are the Claude Code-specific first-party mechanism.

Do not rewrite this page into a Claude Code details page. It should remain the umbrella/Pi-side inspectable harness note.

### Wiki index update: `wiki/README.md`

If the project expects wiki index updates, add `claude-code-dynamic-workflows` to the table consistently with existing entries. If the index is regenerated by `/wiki-lint`, use that path instead of hand-editing if available.

### Daily log

Append a `/wiki-ingest`-style log entry to `memory/2026-06-04/log.md` per the wiki-ingest skill.

---

## Implementation Tasks

### Task 1: Research official Claude Code workflow docs deeply

**Objective:** Gather source-backed facts from official Claude Code documentation, starting with the workflows page.

**Files:**
- Read: `wiki/inspectable-agent-harness.md`
- Read: `context/rules/wiki.md`
- No writes in this task

**Steps:**

1. Fetch `https://code.claude.com/docs/en/workflows`.
2. If HTML fetch is blocked or noisy, fetch `https://code.claude.com/docs/en/workflows.md` with a browser-like user agent.
3. Cross-check only the related official docs needed to clarify workflows:
   - agents, sub-agents, agent-teams, worktrees, hooks, permissions, sandboxing, settings, commands, claude-directory.
4. Extract facts under the research questions above.
5. Mark uncertain or undocumented items explicitly. In particular, do not invent a public workflow JavaScript API if docs only describe Claude-written saved scripts.

**Verification:**

- Research notes include URLs for every source.
- Research starts with the workflows page.
- Notes distinguish documented facts from inference.
- No repository files modified.

---

### Task 2: Write raw source snapshot

**Objective:** Preserve the research provenance in `wiki/raw/`.

**Files:**
- Create: `wiki/raw/2026-06-04-claude-code-dynamic-workflows.md`

**Steps:**

1. Ensure raw directory exists:

```bash
mkdir -p wiki/raw
```

2. Write the raw snapshot with this shape:

```md
# Source: https://code.claude.com/docs/en/workflows

Fetched/primary source:
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/workflows.md

Related official docs consulted:
- <urls>

## Captured workflow facts
...

## Notes and caveats
...
```

3. Include enough detail for future agents to reconstruct how Claude Code dynamic workflows work without repeating the web research.

**Verification:**

```bash
test -s wiki/raw/2026-06-04-claude-code-dynamic-workflows.md
```

---

### Task 3: Create dedicated Claude Code dynamic workflows wiki entry

**Objective:** Add a concise, schema-valid entity page that captures how dynamic workflows work in Claude Code.

**Files:**
- Create: `wiki/claude-code-dynamic-workflows.md`

**Steps:**

1. Write frontmatter exactly matching the wiki schema.
2. Set `confidence: provisional`.
3. Use `related: [inspectable-agent-harness]`.
4. Keep the body ≤600 words total, excluding frontmatter.
5. Include the most important details:
   - JavaScript runtime orchestration
   - invocation modes
   - approval and inspectability
   - subagents and permissions
   - `/workflows` management controls
   - limits and caveats
   - relationship to `/batch` and worktrees

**Verification:**

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/claude-code-dynamic-workflows.md
python3 - <<'PY'
from pathlib import Path
p=Path('wiki/claude-code-dynamic-workflows.md')
text=p.read_text()
body=text.split('---',2)[-1]
words=[w for w in body.replace('#',' ').split() if w]
print(len(words))
assert len(words) <= 600
for s in ['## Summary','## Detail','## See Also','[[inspectable-agent-harness]]']:
    assert s in text
PY
```

---

### Task 4: Link the existing inspectable/Pi workflow entry

**Objective:** Relate the Claude Code entry to the existing Pi/inspectable harness wiki entry without changing that page’s identity.

**Files:**
- Modify: `wiki/inspectable-agent-harness.md`

**Steps:**

1. Add `claude-code-dynamic-workflows` to the `related:` frontmatter list.
2. Add `- [[claude-code-dynamic-workflows]]` under `## See Also`.
3. Optionally add one concise sentence in `## Detail` if the entry remains under 600 words:

```md
Claude Code dynamic workflows are the Claude Code-specific first-party counterpart to the Pi/pi-dynamic-workflows pattern described here.
```

4. Do not replace the Pi/LinkedIn synthesis with Claude Code details.

**Verification:**

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/inspectable-agent-harness.md
python3 - <<'PY'
from pathlib import Path
text=Path('wiki/inspectable-agent-harness.md').read_text()
assert 'claude-code-dynamic-workflows' in text
body=text.split('---',2)[-1]
assert len([w for w in body.replace('#',' ').split() if w]) <= 600
PY
```

---

### Task 5: Update wiki index and daily log

**Objective:** Keep the wiki navigable and satisfy the wiki-ingest logging rule.

**Files:**
- Modify: `wiki/README.md` if manually maintained or regenerated
- Modify/Create: `memory/2026-06-04/log.md`

**Steps:**

1. Update `wiki/README.md` to include `claude-code-dynamic-workflows`, or run the repo’s wiki index regeneration path if available.
2. Append a `/wiki-ingest` style log entry:

```md
## /wiki-ingest -- <HH:MM> UTC
- **Result**: OP
- **Source**: https://code.claude.com/docs/en/workflows
- **Slug-Created**: claude-code-dynamic-workflows
- **Slugs-Updated**: inspectable-agent-harness
- **Snapshot-Path**: wiki/raw/2026-06-04-claude-code-dynamic-workflows.md
- **Observation**: Captured Claude Code dynamic workflows as the Claude-specific counterpart to the Pi dynamic workflow/inspectable harness entry.
```

**Verification:**

```bash
grep -n 'claude-code-dynamic-workflows' wiki/README.md wiki/inspectable-agent-harness.md memory/2026-06-04/log.md
```

---

### Task 6: Final wiki audit

**Objective:** Verify the wiki changes are accurate, bounded, linked, and schema-compliant before reporting back.

**Files:**
- Review all changed wiki/log files

**Steps:**

1. Run schema/frontmatter checks:

```bash
awk '/^---$/{f=!f; next} f{print}' wiki/claude-code-dynamic-workflows.md
awk '/^---$/{f=!f; next} f{print}' wiki/inspectable-agent-harness.md
```

2. Check links:

```bash
grep -R "\[\[claude-code-dynamic-workflows\]\]\|\[\[inspectable-agent-harness\]\]" -n wiki/*.md
```

3. Check word counts for both touched wiki entries.
4. Use a fresh reviewer subagent to audit:
   - source faithfulness to Claude Code docs
   - no unsupported claims about JavaScript API or automatic worktree isolation
   - wiki schema compliance
   - clear relationship between Claude Code dynamic workflows and Pi dynamic workflows
5. Fix any audit findings and repeat checks.

**Verification:**

- New wiki entry exists and is ≤600 words.
- Raw snapshot exists and cites `https://code.claude.com/docs/en/workflows` first.
- `inspectable-agent-harness` links to the new entry.
- New entry links back to `inspectable-agent-harness`.
- Daily log contains the ingest entry.
- Final reviewer finds no critical/important issues.

---

## Acceptance Criteria

- [ ] Research starts from `https://code.claude.com/docs/en/workflows` / `workflows.md`.
- [ ] Repository changes are scoped to wiki knowledge-retention surfaces and required ingest log only.
- [ ] No cron runtime, CLI, docs harness, or product implementation changes are made.
- [ ] `wiki/raw/2026-06-04-claude-code-dynamic-workflows.md` captures source-backed research notes.
- [ ] `wiki/claude-code-dynamic-workflows.md` exists with valid schema, `confidence: provisional`, and ≤600-word body.
- [ ] `wiki/claude-code-dynamic-workflows.md` explains how workflows work in Claude Code: invocation, runtime, scripts, subagents, permissions, inspectability, management, disable controls, cost, and limits.
- [ ] `wiki/inspectable-agent-harness.md` is related to the new Claude Code entry and remains the umbrella/Pi-side inspectable workflow note.
- [ ] Unsupported claims are avoided, especially around a stable public JS authoring API and automatic worktree isolation for workflow-spawned agents.
- [ ] Wiki index/log are updated if required.
- [ ] Final audit passes before reporting completion.

## Deferred / Explicitly Out of Scope

- No `workflow:` cron frontmatter.
- No `scripts/cron-runtime.ts` changes.
- No Vitest tests.
- No `oh workflow` CLI.
- No docs changes under `docs/`.
- No changes to Claude Code permissions or sandbox behavior.
- No generated workflow engine or workflow execution code.
