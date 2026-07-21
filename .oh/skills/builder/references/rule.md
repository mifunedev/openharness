# Path-Scoped Rule Builder

Author concise guidance that activates for a reliable file scope. Open Harness has
collapsed its former always-loaded rule tier into provider-portable skills: prefer
`.oh/skills/<name>/SKILL.md` with `paths:`. Treat `.oh/context/rules/` as a
compatibility-pointer surface, not a destination for new policy. Create a
`.claude/rules/<name>.md` file only when the user explicitly requests a
Claude-specific downstream artifact and local project instructions allow it.

## Contents

1. [Choose the artifact](#choose-the-artifact)
2. [Discover the scope](#discover-the-scope)
3. [Author a portable path skill](#author-a-portable-path-skill)
4. [Author an explicit Claude rule](#author-an-explicit-claude-rule)
5. [Write effective guidance](#write-effective-guidance)
6. [Validate](#validate)
7. [Report](#report)

## Choose the artifact

Apply this decision order:

1. **Open Harness or equipped project**: create or update a reference skill under
   `.oh/skills/<name>/SKILL.md` and use `paths:` for automatic loading.
2. **Existing policy already owned by a skill**: update that skill instead of
   adding another path-scoped artifact.
3. **Explicit provider compatibility pointer**: keep the pointer short and direct
   it to the canonical skill; do not duplicate the policy.
4. **Explicit Claude-only downstream project**: use
   `.claude/rules/<name>.md` only after confirming that path is the local source of
   truth and portability is not required.
5. **Project-wide identity or operating principle**: use the locally canonical
   `AGENTS.md` or `CLAUDE.md`, not an unconditional rule hidden in a provider
   directory.
6. **Multi-step workflow**: use `/builder command`; rules describe behavior, not a
   procedure with side effects.

Do not recreate the removed Open Harness always-on rules tier. The surviving
`.oh/context/rules/git.md`-style files are compatibility pointers only.

## Discover the scope

1. Read applicable project instructions and current path-scoped skills or rules.
2. Inspect representative files the guidance should govern.
3. Derive the narrowest globs that cover those files without activating on unrelated
   code.
4. Search for overlapping guidance, contradictions, and a more canonical owner.
5. Separate stable conventions from temporary implementation details. Do not encode
   a pattern merely because it appears once.
6. Define how a maintainer can verify each instruction from code, tests, docs, or
   configuration.

## Author a portable path skill

Use this self-contained path-skill shape, with frontmatter like:

```yaml
---
name: api-rules
description: |
  Apply this project's API handler conventions. TRIGGER when: creating or reviewing
  API routes, request validation, or endpoint tests.
paths:
  - "src/app/api/**/*"
---
```

Then write concise imperative guidance in SKILL.md. Keep matching information in
`description` and `paths:`. Add references only when the scoped guidance needs a
stable schema or detailed example; avoid making every matching-file read load a
large handbook.

Portable path skills are the default because `.oh/skills/` is exposed to supported
providers, while `.claude/rules/` is not.

## Author an explicit Claude rule

Only on an explicit provider-specific request, use:

```markdown
---
paths:
  - "src/components/**/*.tsx"
  - "src/components/**/*.test.tsx"
---

# Component Conventions

- Reuse project tokens from `<verified path>`.
- Preserve keyboard operation and visible focus for interactive controls.
- Test behavior through roles and user-visible outcomes.
```

Rules:

- Write `.claude/rules/<name>.md`, not `.oh/context/rules/<name>.md`.
- Use `paths:` as the only rule-specific frontmatter unless current Claude docs and
  local examples demonstrate otherwise.
- Omit `paths:` only when the user explicitly wants unconditional Claude-only
  guidance and project instructions do not provide a more portable owner.
- Keep one concern per file and normally 5-20 bullets, below 30 content lines.
- Do not duplicate the rule in `.oh/skills/`; select one canonical owner.
- State in the final report that the artifact is Claude-specific and why that trade-
  off was requested.

## Write effective guidance

Good guidance is:

- **specific**: names the actual pattern, API, component, test behavior, or quality
  boundary;
- **imperative**: says what to do or avoid;
- **scoped**: activates only where the instruction matters;
- **grounded**: cites verified project paths or conventions;
- **testable**: a reviewer can determine whether it was followed;
- **durable**: describes a maintained contract rather than a transient code shape.

Avoid vague bullets such as “write clean code,” restating formatter defaults,
provider-agnostic policy in provider-only files, long tutorials, and two artifacts
that own the same rule.

## Validate

- [ ] Artifact choice follows the decision order and local instructions.
- [ ] Open Harness guidance lives in `.oh/skills/<name>/SKILL.md` with `paths:`;
      `.oh/context/rules/` remains compatibility pointers only.
- [ ] `.claude/rules/` is used only for an explicit Claude-specific downstream
      request.
- [ ] Globs match representative intended files and exclude unrelated ones.
- [ ] No duplicate or contradictory owner exists.
- [ ] Each instruction is imperative, specific, grounded, and testable.
- [ ] Portable skill name matches its directory, description front-loads triggers,
      frontmatter is valid, and every declared path or resource exists.
- [ ] Portable skill is imperative and below 500 lines; any bundled reference is
      linked directly and any reference over 100 lines has a contents list.
- [ ] Claude rule has valid delimiters and supported frontmatter and stays under 30
      content lines.
- [ ] Final report names portability and loading behavior accurately.

## Report

For the default portable form:

```markdown
## Path-Scoped Skill Created: <name>

**File**: `.oh/skills/<name>/SKILL.md`
**Scope**: <paths globs>
**Loads through**: <provider exposure>
**Canonical owner**: portable skill
**Validation**: <checks and results>
```

For an explicit downstream exception:

```markdown
## Claude Rule Created: <name>

**File**: `.claude/rules/<name>.md`
**Scope**: <paths globs>
**Portability**: Claude-specific by explicit request
**Validation**: <checks and results>
```
