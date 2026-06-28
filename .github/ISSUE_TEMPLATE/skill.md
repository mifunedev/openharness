---
name: Skill
about: Create a new Claude Code skill
title: "[SKILL] "
labels: skill
assignees: ""
---

## Skill Definition

- **Name**: <!-- lowercase-with-hyphens -->
- **Description**: <!-- When should Claude use this skill? What triggers it? -->
- **Degrees of Freedom**: <!-- High / Medium / Low -->

## Purpose

<!-- What specific problem does this skill solve? What does success look like? -->

## Examples

### Example 1

**User**: <!-- "Realistic user request that should trigger this skill" -->
**Assistant**: <!-- Expected behavior or output -->

### Example 2

**User**: <!-- "Another scenario" -->
**Assistant**: <!-- Expected behavior or output -->

---

## Skill Structure

> Skills are modular instruction packages — NOT agents, NOT slash commands. They live at `.claude/skills/<skill-name>/` and follow progressive disclosure: metadata is always loaded, SKILL.md loads when triggered, resources load on demand.

```
<skill-name>/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: executable code for deterministic tasks
├── references/           # Optional: docs loaded contextually
└── assets/               # Optional: output-ready files (NOT loaded in context)
```

### SKILL.md Format

```markdown
---
name: <skill-name>
description: |
  Triggering info goes HERE in the frontmatter, not in the body.
  Describe when and why Claude should apply this skill.
---

# Skill Name

[Brief purpose statement]

## Instructions

[Numbered steps, imperative form ("Analyze the input" not "You should analyze")]

## Examples

[Realistic input/output scenarios]

## Guidelines

[Best practices, gotchas, warnings]

## Reference

[Optional: command tables, API refs, schemas]
```

### Checklist

- [ ] Name is lowercase with hyphens only
- [ ] Triggering info is in YAML `description`, not the body
- [ ] Instructions use imperative form
- [ ] Examples are realistic scenarios (examples > descriptions)
- [ ] Content is under 5,000 words
- [ ] Degrees of freedom match the task risk level
- [ ] Resources (scripts/references/assets) documented if present
- [ ] One level of nesting max for references

---

> **Git workflow**: see the [/git skill](../../.mifune/skills/git/SKILL.md)

---

## Acceptance Criteria

- [ ] Skill directory exists at `.claude/skills/<skill-name>/`
- [ ] SKILL.md has valid YAML frontmatter
- [ ] Skill triggers correctly on matching user requests
- [ ] Does not trigger on unrelated requests
- [ ] PR targets `development` unless the git workflow rule says otherwise
