# `template/`

Boilerplate copied by `mifune skills new <name>` when scaffolding a new skill folder.

## Contents

| File | Purpose |
|------|---------|
| `SKILL.md` | Starter skill file with frontmatter fields pre-populated and placeholder body |
| `README.md` | Starter README for the new skill, referencing `skills.mifune.dev` conventions |

## Usage

The `mifune` CLI reads this directory when you run:

```bash
mifune skills new my-skill-name
```

It copies all files from `template/` into `skills/my-skill-name/`, then replaces placeholder values (e.g., `{{name}}`, `{{description}}`) with the values you supply interactively.

Edit these templates when you want to change the default structure for all future skills.
