# Reference Skill Builder

Author a domain or guidance skill that Claude loads inline when relevant. In Open
Harness, write `.oh/skills/<name>/SKILL.md`; `.claude/skills`, `.codex/skills`, and
`.pi/skills` are exposure surfaces, not additional copies.

## Contents

1. [Choose a reference skill](#choose-a-reference-skill)
2. [Design for progressive disclosure](#design-for-progressive-disclosure)
3. [Frontmatter](#frontmatter)
4. [Authoring protocol](#authoring-protocol)
5. [Resources](#resources)
6. [Validate](#validate)
7. [Report](#report)

## Choose a reference skill

Use this type for conventions, domain knowledge, decision guidance, or contextual
instructions Claude should consult while doing another task. If the request is a
deliberate end-to-end procedure such as deploy, release, publish, sync, or sweep,
use `/builder command` instead. Use an agent only when the work needs a durable
specialist identity and isolated context.

Reference skills should usually remain model-invocable. They may use `paths:` when
specific files provide a reliable loading signal. Do not use `context: fork` for
pure reference content: in a fork, the body becomes a task prompt and passive
guidance has no useful task to complete.

## Design for progressive disclosure

Treat context as a shared budget:

1. **Metadata** is always listed. Make `description` short, specific, and
   trigger-rich.
2. **SKILL.md** loads when selected. Put critical behavior first and keep it below
   500 lines.
3. **Bundled resources** load only when needed. Keep them one level from SKILL.md;
   do not create reference chains.

Assume the model already knows general software practice. Capture repository- or
domain-specific knowledge, decision rules, failure modes, and realistic examples.
Do not turn the skill into a broad tutorial.

Use this structure only as needed:

```text
<name>/
  SKILL.md
  references/   # schemas, policies, detailed domain material
  scripts/      # deterministic repeated logic
  assets/       # output-ready templates; not loaded as instructions
```

## Frontmatter

Start from the minimum:

```yaml
---
name: api-conventions
description: |
  Apply this project's API boundary, validation, and error conventions. TRIGGER
  when: adding or reviewing API handlers, request schemas, or endpoint tests.
paths:
  - "src/api/**/*"
allowed-tools: Read Grep
---
```

Common fields:

| Field | Use |
|-------|-----|
| `name` | Optional in some runtimes, but include it; lowercase kebab-case, max 64 characters. |
| `description` | What the skill provides and when to use it. Front-load triggers; combined with `when_to_use`, keep below 1,536 characters. |
| `when_to_use` | Optional extra matching phrases; avoid duplicating the description. |
| `paths` | Optional list or comma-separated globs for file-triggered loading. |
| `argument-hint` / `arguments` | Use only when the skill consumes invocation arguments; wire every declared argument in the body. |
| `allowed-tools` | Pre-approves listed tools while active; it does not restrict other tools. Keep narrow. |
| `user-invocable` | Set `false` only when hiding the slash-menu entry is intentional. |
| `disable-model-invocation` | Usually false or omitted for reference skills. `true` makes it manual-only and prevents subagent preload. |
| `model` / `effort` | Omit to inherit unless a stable task requirement justifies an override. |
| `context: fork` / `agent` | Avoid for passive reference content; use only when the body is an actionable isolated task. |
| `shell` / `hooks` | Add only after verifying local runtime support and a concrete need. |

Place matching information in frontmatter. The body is invisible until the skill
loads.

## Authoring protocol

1. Define the decisions or behavior this skill improves and examples that should
   and should not trigger it.
2. Read two or three neighboring skills and search for overlap.
3. Choose a name aligned with the domain, not an implementation detail.
4. Write minimal frontmatter. Omit inherited defaults and unsupported fields.
5. Put non-negotiable instructions first, in imperative form.
6. Express flexible guidance as principles and examples; express fragile operations
   as exact constraints. Match specificity to risk.
7. Include realistic examples when behavior is stylistic or easy to misread.
8. Put long stable material in `references/`; put repeated deterministic operations
   in executable `scripts/`; put output templates in `assets/`.
9. Link every bundled resource directly from SKILL.md and say when to load or run it.
10. Keep behavior self-contained within the skill directory unless a shared harness
    primitive is intentionally canonical.

### Arguments and dynamic context

- `$ARGUMENTS` is the complete invocation string.
- `$0`, `$1`, and named variables from `arguments: [name, target]` expose
  positional values. Multi-word values require shell-style quoting.
- `${CLAUDE_SKILL_DIR}` addresses bundled files independent of the working
  directory.
- Shell injection can embed current state before the body loads, but it delays
  loading and may be disabled by policy. Use only fast, non-sensitive commands.

Do not declare arguments that the body ignores. Do not use dynamic shell context
for state Claude can inspect safely after invocation.

## Resources

- `references/`: detailed material read on demand. Add a contents list to any
  reference over 100 lines.
- `scripts/`: deterministic logic that is safer or cheaper to execute than
  regenerate. Use `set -euo pipefail`, resolve paths robustly, and test it.
- `assets/`: files copied or transformed into outputs. Do not tell Claude to load
  large assets as context unless necessary.

Keep references shallow: SKILL.md may point to `references/foo.md`; that reference
must not require another chain of references to become usable.

## Validate

- [ ] Canonical file exists at `.oh/skills/<name>/SKILL.md` in Open Harness.
- [ ] `name` matches the directory and uses lowercase kebab-case.
- [ ] Frontmatter delimiters and YAML structure are valid.
- [ ] Description front-loads triggers and stays within the listing limit.
- [ ] Positive and negative trigger examples distinguish it from agents and task
      skills.
- [ ] `paths:` globs are narrow and match real files when present.
- [ ] Every declared argument, tool, script, reference, and asset is used and exists.
- [ ] SKILL.md is below 500 lines; references over 100 lines have a contents list.
- [ ] No deep reference chains or copied provider mirrors.
- [ ] Model, fork, and side-effect fields are omitted unless justified.
- [ ] Bundled scripts have executable permissions and pass a real invocation.

## Report

```markdown
## Skill Created: <name>

**File**: `.oh/skills/<name>/SKILL.md`
**Loads when**: <description and optional paths>
**Resources**: <references/scripts/assets or none>
**Invocation**: `/<name> <arguments, if any>`
**Validation**: <checks and results>
```
