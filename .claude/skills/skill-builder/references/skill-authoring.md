# Skill Authoring — Full Reference

Deep reference for `/skill-builder`. The actionable protocol + checklist live in
`../SKILL.md`; this file is the long tail (progressive-disclosure level 3 — loaded
only when you need it).

## Contents

1. [What skills are](#what-skills-are)
2. [Skills vs commands vs agents](#skills-vs-commands-vs-agents)
3. [Discovery & precedence](#discovery--precedence)
4. [Directory structure & resource types](#directory-structure--resource-types)
5. [Frontmatter schema](#frontmatter-schema)
6. [Field reference](#field-reference)
7. [Progressive disclosure & the listing budget](#progressive-disclosure--the-listing-budget)
8. [Context lifecycle (compaction)](#context-lifecycle-compaction)
9. [Shell injection](#shell-injection)
10. [String substitutions](#string-substitutions)
11. [Operator access controls](#operator-access-controls)
12. [Size-tiered templates](#size-tiered-templates)
13. [Common pitfalls](#common-pitfalls)

---

## What skills are

Skills are **modular packages** that extend Claude through specialized knowledge,
workflows, and tool integrations — domain-specific onboarding guides. They are
**self-contained folders**, **dynamically loaded** when relevant, and are *not*
slash commands or agents (though a skill does expose `/<name>`).

Default assumption: **"Claude is already very smart."** Don't explain what Claude
knows; capture the domain-specific things it doesn't.

## Skills vs commands vs agents

| Artifact | Location | Structure | Use it for |
|----------|----------|-----------|------------|
| **Skill** | `.claude/skills/*/SKILL.md` | Folder + resources | Contextual knowledge, workflows, slash commands. **Default.** |
| **Command** | `.claude/commands/*.md` | Single file | Same as a skill minus supporting files. Merged into skills; if a skill and command share a name, the **skill wins**. |
| **Agent** | `.claude/agents/*.md` | Single file | A forked sub-agent with its own tools/persona and isolated context. |

Task skill vs reference skill:

| Type | Invocation | Body shape | Signal |
|------|-----------|-----------|--------|
| **Reference** | Claude auto-loads inline from `description`/`paths` | Conventions, patterns ("when writing API endpoints, …") | usually no `disable-model-invocation` |
| **Task** | User types `/<name>` to make Claude *do* it | Numbered procedure, often side-effecting | often `disable-model-invocation: true` |

## Discovery & precedence

When skills share a name, highest-priority source wins:

1. **Enterprise/managed** (highest) — pushed via managed settings
2. **Personal** — `~/.claude/skills/` (all projects)
3. **Project** — `.claude/skills/` (this repo, version-controlled)

- **Plugin skills** are namespaced `<plugin>:<skill>` and sit outside this chain.
- **Live change detection**: adding/editing/removing a skill under an *existing*
  `.claude/skills/` takes effect within the session. Creating a top-level
  `.claude/skills/` that didn't exist at session start needs a restart.
- **Nested discovery**: reading a file under `packages/x/` also discovers
  `packages/x/.claude/skills/` (monorepo-per-package skills).
- **`--add-dir`**: `.claude/skills/` *is* loaded from added dirs (other `.claude/`
  config is not).

## Directory structure & resource types

```
skill-name/
├── SKILL.md         # Required: instructions + metadata
├── scripts/         # Optional: deterministic executable logic, run on demand
├── references/      # Optional: docs loaded contextually (schemas, APIs, policies)
└── assets/          # Optional: output-ready files (templates) — NOT loaded in context
```

| Dir | Purpose | Context loading |
|-----|---------|-----------------|
| `scripts/` | Deterministic, repeated tasks | On demand (executed, not read into context) |
| `references/` | Schemas, APIs, policies | Contextual (read when needed) |
| `assets/` | Templates, boilerplate, images | Never loaded |

## Frontmatter schema

```yaml
---
name: skill-name                  # Optional: defaults to dir name. lowercase/numbers/hyphens, ≤64.
description: |                     # Recommended: when/why to use — used for matching.
  Front-loaded description. Put TRIGGERS here, not in the body.
when_to_use: |                    # Optional: extra trigger phrases / example requests.
  - "review the PR"
argument-hint: "[issue-number]"   # Optional: autocomplete hint in the / menu.
arguments: [issue, branch]        # Optional: named positional args → $issue / $branch.
disable-model-invocation: false   # Optional: true = only manual /invoke; also blocks subagent preload.
user-invocable: true              # Optional: false = hide from / menu (Claude can still invoke).
allowed-tools: Read Grep Bash     # Optional: pre-approve while active (does NOT restrict).
model: sonnet                     # Optional: opus|sonnet|haiku, full ID, or inherit. This turn only.
effort: high                      # Optional: low|medium|high|xhigh|max (model-dependent).
context: fork                     # Optional: run in isolated subagent (body BECOMES the prompt).
agent: Explore                    # Optional: subagent type when context: fork.
paths:                            # Optional: globs — auto-load on matching files.
  - "src/api/**/*.ts"
shell: bash                       # Optional: bash (default) or powershell.
hooks:                            # Optional: lifecycle hooks scoped to this skill.
  PreToolUse:
    - matcher: "Bash"
      hooks: [{ type: command, command: "./scripts/validate.sh" }]
---
```

**All fields optional**; only `description` is *recommended* (else matching falls
back to the first body paragraph). **Triggers go in `description`/`when_to_use`,
never only in the body** — the body loads only after invocation.

## Field reference

- **name** — display name; defaults to dir name. lowercase/numbers/hyphens, ≤64.
- **description** — what + when. `description` + `when_to_use` is truncated at
  **1,536 chars** in the listing; front-load the key use case.
- **when_to_use** — appended to `description` in the listing (same 1,536 cap).
- **argument-hint** — placeholder in autocomplete (`[issue-number]`, `[file] [format]`).
  Must reflect the args the body actually consumes.
- **arguments** — named positional args; `arguments: [issue, branch]` → `$issue`,
  `$branch`. YAML list or space-separated string.
- **disable-model-invocation** — `true` removes the skill from Claude's invocable set
  (description not in context); only `/name` works. Also blocks subagent preload.
- **user-invocable** — `false` hides from `/` menu; Claude can still auto-invoke.
  (Does NOT block programmatic Skill-tool access — use `disable-model-invocation`.)
- **allowed-tools** — pre-approves tools while active. **Does not restrict** — use
  permission deny rules to actually block. Narrow it (`Bash(git add *)`).
- **model** — override for the rest of the turn; session model resumes next prompt.
  Same values as `/model`, plus `inherit`.
- **effort** — `low|medium|high|xhigh|max`; defaults to session.
- **context: fork** — runs in an isolated subagent; **the body becomes the prompt**
  (a reference-only skill with no task returns nothing when forked).
- **agent** — subagent type when `context: fork` (`Explore`, `Plan`,
  `general-purpose`, or any `.claude/agents/<name>`). Default `general-purpose`.
- **paths** — auto-load when Claude reads matching files (rule-style globs).
- **shell** — `bash` (default) or `powershell` (needs `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`).
- **hooks** — `settings.json` hook schema, scoped to this skill's lifecycle.

## Progressive disclosure & the listing budget

Three levels of context loading:

| Level | Content | Size |
|-------|---------|------|
| 1 | Metadata (name + description) — always available | ~100 words |
| 2 | SKILL.md body — when triggered | < 5k words |
| 3 | Bundled resources — as needed | variable |

Descriptions share a per-session budget (~1% of context window, fallback 8,000
chars; raise with `SLASH_COMMAND_TOOL_CHAR_BUDGET`). Over budget → descriptions get
truncated (names always survive). If a skill stops being picked, trim its
description so the keywords survive.

## Context lifecycle (compaction)

1. On invoke, the full SKILL.md enters the conversation as one message.
2. On auto-compaction, the first **5,000 tokens** of each skill are re-attached.
3. Re-attached skills share a **25,000-token** budget; over it, older/less-relevant
   skills are dropped.
4. Earlier-invoked skills in long sessions are likelier to be evicted.

Implications: put the **most critical instructions at the top**; keep the first
~2,000 words essential; push tables/examples/nice-to-haves later; self-contained
skills survive eviction best.

## Shell injection

Embed live shell output that runs **before** Claude sees the content (stdout
replaces the placeholder at load time).

- Inline: `` The latest commit is: !`git log -1 --oneline` ``
- Multiline: a fenced block opened with `!` runs each line.

Guidelines: runs in project root; controlled by the `shell` field; keep fast (it
delays loading); failures yield empty output (stderr suppressed). Use for dynamic
context (git state, versions, running services).

## String substitutions

| Variable | Expands to |
|----------|-----------|
| `$ARGUMENTS` | All args as typed. If absent from the body, args are appended as `ARGUMENTS: <value>`. |
| `$ARGUMENTS[N]` / `$N` | Arg at index N (0-based); shell-style quoting applies. |
| `$name` | Named arg from `arguments: [issue, branch]` → `$issue`, `$branch`. |
| `${CLAUDE_SESSION_ID}` | Current session ID. |
| `${CLAUDE_EFFORT}` | Current effort (`low…max`) — adapt instructions to it. |
| `${CLAUDE_SKILL_DIR}` | Directory containing SKILL.md — use to reference bundled scripts CWD-independently. |

## Operator access controls

User/org-level (not authoring options, but design with them in mind):

| Mechanism | Effect |
|-----------|--------|
| `permissions.deny: ["Skill"]` | Disables ALL skills. |
| `permissions.allow: ["Skill(commit)", "Skill(review-pr *)"]` | Allowlist by name / `name *` prefix. |
| `permissions.deny: ["Skill(deploy *)"]` | Denylist by name / prefix. |
| `disable-model-invocation: true` | Removes the skill from Claude's invocable set. |
| `disableSkillShellExecution: true` | Disables `` !`cmd` `` / ` ```! ` blocks (managed/bundled skills unaffected). |

For side-effecting skills prefer `disable-model-invocation: true` (user opts in by
typing `/name`) + narrow `allowed-tools`, not blanket Bash.

## Size-tiered templates

**Simple (~13 lines)** — pure guidance, no frontmatter beyond `description`:

```markdown
---
name: skill-name
description: Brief description of when to use this skill.
---
When [doing X], always:
1. **Step**: …
2. **Step**: …
```

**Medium (~66–125 lines)** — purpose + instructions + examples + small reference:

```markdown
---
name: skill-name
description: What it does and when to use it.
---
# Skill Name
[Purpose.]
## Instructions
1. …
## Examples
User: "[request]"
Assistant: [behavior]
## Reference
| Option | Description |
```

**Complex (200+ lines)** — add architecture, domain sections, important-notes; push
the bulk into `references/` so SKILL.md stays < 500 lines.

## Common pitfalls

1. **Over-explaining** — Claude is smart; cover only domain specifics.
2. **Triggers in the body** — they belong in `description`/`when_to_use`.
3. **Mismatched degrees of freedom** — exact steps for fragile/critical ops; room
   for flexible tasks.
4. **Missing examples** — examples convey style better than prose.
5. **Deep nesting** — keep references one level from SKILL.md; no reference chains.
6. **Excessive length** — target < 5k words / < 500 lines; use progressive disclosure.
7. **Inert args** — declaring `argument-hint`/`arguments` but never consuming
   `$ARGUMENTS`/`$N` in the body.
8. **Coupling out of the skill dir** — logic belongs in the skill's `scripts/`, not
   in the Makefile or a sibling location.