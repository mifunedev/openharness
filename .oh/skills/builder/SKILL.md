---
name: builder
description: |
  Author and refine provider-portable agents, reference skills, task-style command
  skills, and path-scoped rules using one repository-grounded workflow. TRIGGER
  when: asked to create, build, scaffold, convert, review, or update an agent,
  skill, command, workflow, rule, coding standard, or contextual instruction.
argument-hint: "agent|skill|command|rule <name-or-request>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Builder

Build one artifact through the matching type reference. Run inline and inherit the
session model; do not fork or override the model unless the artifact being authored
has an independently justified need.

Arguments received: `$ARGUMENTS`

## Dispatch

1. Treat the first whitespace-delimited argument as `TYPE` and the remainder as
   the artifact name, request, or path.
2. Accept exactly these types:

   | Type | Read and follow |
   |------|-----------------|
   | `agent` | `references/agent.md` |
   | `skill` | `references/skill.md` |
   | `command` | `references/command.md` |
   | `rule` | `references/rule.md` |

3. If `TYPE` is missing or unknown, or the remaining request is empty or only
   whitespace, print the following and stop without reading type references or
   modifying files:

   ```text
   Usage: /builder <agent|skill|command|rule> <name-or-request>
   ```

4. Read the selected reference completely, then execute its protocol against the
   remainder of `$ARGUMENTS`. The selected reference is authoritative for artifact
   shape and type-specific validation.

## Shared protocol

Apply these steps for every valid type before the selected reference's type-specific
steps.

### 1. Discover local authority

- Find and read applicable `AGENTS.md` and `CLAUDE.md` files from repository root
  through the target directory. More local instructions win; in one directory,
  `AGENTS.md` is canonical.
- Identify the source-of-truth artifact directory. In Open Harness and equipped
  projects, edit `.oh/agents/` or `.oh/skills/`; provider directories such as
  `.claude/`, `.codex/`, and `.pi/` are generated or symlinked exposure surfaces.
- Outside an Open Harness layout, follow the target project's documented canonical
  path rather than creating `.oh/` speculatively.
- Inspect two or three nearby artifacts of the same type. Reuse their naming,
  frontmatter, structure, tone, and validation conventions.
- Search for an existing artifact with the same purpose. Prefer a focused update or
  explicit consolidation over a near-duplicate.

### 2. Define the contract

Before editing, state internally:

- the artifact's one-sentence purpose and concrete triggers;
- who invokes or consumes it;
- what is in scope, out of scope, and considered done;
- the minimum tools, context, side effects, and supporting resources required;
- which behavior is repository-specific and must be grounded in inspected files.

Ask a question only when unresolved ambiguity would materially change the artifact
or create unsafe side effects. Otherwise use the request and repository evidence.

### 3. Author narrowly

- Use lowercase kebab-case names and one artifact per coherent concern.
- Put matching and trigger information in frontmatter, not only in the body.
- Use imperative, operational language. Remove generic expertise prose that does
  not change behavior.
- Prefer the least privilege and smallest context footprint that completes the job.
- Cite real local paths and commands only after verifying them.
- Do not modify unrelated files, generated provider mirrors, or user work in the
  working tree.

### 4. Validate and report

- Validate frontmatter delimiters and required fields without assuming optional YAML
  libraries are installed.
- Check every referenced path, invocation, tool, and supporting file.
- Enforce the selected reference's size, safety, and semantic checks.
- When `.oh/scripts/link-providers.sh` exists and canonical `.oh/` primitives were
  changed, run `bash .oh/scripts/link-providers.sh --check`.
- Run `git diff --check` when inside a Git worktree.
- Report the files created, updated, or removed; the resulting invocation or loading
  behavior; key design choices; and validation evidence. Never claim a check ran if
  it did not.

## Memory Protocol

At the end of every run, including invalid requests and failures, complete the
canonical log → qualify → improve cycle when the Open Harness memory scaffold is
available.

### Log

Resolve the configured memory root and append one immutable record through the
locked helper. Replace placeholders with the actual outcome.

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
TODAY=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H:%M)
if [ -x "$ROOT/.oh/scripts/oh-path" ] && [ -x "$ROOT/.oh/scripts/locked-append.sh" ]; then
  MEM="${MEMORY_DIR:-$(bash "$ROOT/.oh/scripts/oh-path" memory)}"
  mkdir -p "$MEM/$TODAY"
  "$ROOT/.oh/scripts/locked-append.sh" "$MEM/$TODAY/log.md" <<EOF

## Builder -- $TIME UTC
- **Result**: <OP | DRY-RUN | PARTIAL | FAIL>
- **Type**: <agent | skill | command | rule | invalid>
- **Artifact**: <path or none>
- **Validation**: <checks run or none>
- **Observation**: <one concise finding or no durable finding>
EOF
fi
```

### Qualify and improve

Ask whether anything unexpectedly failed, exposed an undocumented coupling or edge
case, or would materially help the next agent. If not, record that no durable
finding emerged and stop. If yes, check existing `MEMORY.md`, `IDENTITY.md`, and
canonical guidance for duplication, then use `/retro`'s propose-then-confirm gate to
append one concise supported lesson to `MEMORY.md`. Never promote an unverified
single-run guess or edit `IDENTITY.md` silently.

See `.oh/skills/retro/references/memory-protocol.md` for the canonical Memory
Improvement Protocol.
