---
name: skill-builder
description: |
  Author and refine Claude Code skills (.claude/skills/*/SKILL.md) the harness
  way — the evolving pointer to skill best practices (replaces the deprecated
  skill-builder agent). Covers skill-vs-command-vs-agent, frontmatter, progressive
  disclosure, argument wiring, side-effect handling, and a validation checklist;
  defers the full field schema to references/skill-authoring.md.
  TRIGGER when: asked to create/build/scaffold a new skill, fix/review/audit an
  existing skill, "make a /command", convert an agent to a skill, or check a skill
  against best practices.
argument-hint: "[skill-name | description of the skill]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Skill Builder

The harness's pointer for authoring skills. Keep **this** file lean — the
exhaustive frontmatter schema and field reference live in
`references/skill-authoring.md`. (That split is itself the practice this skill
exists to enforce: concise SKILL.md, detail in `references/`.)

## Skill vs command vs agent

- **Skill** — `.claude/skills/<name>/SKILL.md` (+ optional `scripts/`,
  `references/`, `assets/`). Invocable as `/<name>`; Claude can also auto-invoke
  from the `description`. **Default choice.**
- **Command** — single `.claude/commands/<name>.md`. Merged into skills, same
  frontmatter; pick a skill unless you truly want one bare file.
- **Agent** — `.claude/agents/<name>.md`: a *forked sub-agent* with its own tool
  list and isolated context. Use only when you need an isolated context/persona,
  not just a playbook. (Skill *authoring* itself moved from an agent to this skill.)

## Protocol

1. **Scope** — one sentence: what it does, who invokes it (Claude vs user), what
   "done" looks like. Decide **task skill** (does a thing) vs **reference skill**
   (knowledge Claude consults inline).
2. **Survey** — `Glob .claude/skills/**/SKILL.md`; open the closest existing skill
   and match its shape and tone. Reuse conventions; don't reinvent.
3. **Frontmatter** — `name` (lowercase-kebab, ≤64), `description` with the TRIGGERs
   **front-loaded** (the description is what matching sees — *not* the body). Add
   only the optional fields the skill actually needs (see reference).
4. **Body** — imperative instructions *for Claude*, not prose for a human. Put the
   most critical rules first (they survive compaction). Examples beat description.
5. **Bundle, don't inline** — deterministic/repeated logic goes in a `scripts/` file
   the skill calls; long reference material goes in `references/`. SKILL.md < 500 lines.
6. **Validate** — run the checklist below. If it takes args, *wire* them. If it
   shells out, run the script once.

## Get these right (lessons we've paid for)

- **`argument-hint` must be real and accurate.** If the skill takes
  `up|down|restart`, say so — never `"(no args)"` on a skill that has args.
- **Wire `$ARGUMENTS`.** A task skill that takes an action must pass it through
  (e.g. `bash ${CLAUDE_SKILL_DIR}/run.sh $ARGUMENTS`), not merely *describe*
  commands a human would type.
- **Imperative body.** "Run X, then report Y" — not "This skill launches X."
- **Side effects → opt-in.** Skills that deploy/commit/send/destroy should consider
  `disable-model-invocation: true` (user must type `/name`) and narrow
  `allowed-tools` (`Bash(git commit *)`) rather than blanket `Bash`.
- **`model` only when justified.** Omit to inherit the session model; set `sonnet`/
  `haiku` only for clearly mechanical skills.
- **Self-contained > coupled.** Put logic inside the skill dir (a `scripts/` file),
  not in the harness `Makefile` or some sibling location.

## Validation checklist

- [ ] `.claude/skills/<name>/SKILL.md` exists; `name` lowercase-kebab, ≤64 chars
- [ ] `description` states WHEN to use, triggers front-loaded, combined (+`when_to_use`) ≤1,536 chars
- [ ] Body is imperative; most-critical rules first; ≥1 realistic example when behavior is non-obvious
- [ ] `argument-hint` matches the args the body consumes; `$ARGUMENTS`/`$N` actually wired
- [ ] SKILL.md < 500 lines; detail pushed to `references/`; repeated logic in `scripts/`
- [ ] Side-effecting? decided on `disable-model-invocation` + narrowed `allowed-tools`
- [ ] `model` / `context: fork` set only when justified (else omit/inherit)
- [ ] Matches the conventions and tone of neighboring skills

## Full reference

`references/skill-authoring.md` — complete frontmatter schema + per-field reference,
discovery priority & precedence, context lifecycle (compaction budget), shell
injection, string substitutions, operator access controls, and size-tiered templates.