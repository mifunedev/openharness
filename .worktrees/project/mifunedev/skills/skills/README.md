# `skills/`

One folder per published skill. Each subfolder name is the skill's canonical identifier (lowercase, hyphens, ≤ 64 chars) and must match the `name` field in that skill's frontmatter.

## Subfolder layout

| Path | Required | Purpose |
|------|----------|---------|
| `<name>/SKILL.md` | Yes | Main skill instructions and frontmatter |
| `<name>/README.md` | Recommended | Human-readable description for GitHub and skills.mifune.dev |
| `<name>/scripts/` | Optional | Executable code the skill invokes |
| `<name>/references/` | Optional | Reference docs loaded on demand by the agent |
| `<name>/assets/` | Optional | Static templates, schemas, sample data |
| `<name>/tests/` | Optional | Smoke tests for scripts |
| `<name>/LICENSE` | Optional | Per-skill license override (only when different from repo root) |

## Conventions

- Skill folder names are kebab-case, match `SKILL.md` `name` frontmatter, and match the `path` field in `registry.json`.
- `registry.json` is generated from these folders by `scripts/publish-registry.sh` — do not hand-edit it.
- `node_modules/`, `dist/`, and other build artifacts are prohibited here (enforced by root `.gitignore`).

See `01-architecture.md` in the spec for the full `SKILL.md` format and frontmatter rules.
