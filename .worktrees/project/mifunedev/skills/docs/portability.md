# Mifune Portability Policy

## Why Mifune Enforces a Stricter Frontmatter Deny-list

The [Agent Skills spec](https://anthropic.com/skills-spec) defines a set of
optional top-level frontmatter keys that are specific to Claude Code:

```
disable-model-invocation
user-invocable
paths
context
agent
argument-hint
arguments
hooks
```

The upstream spec marks these as "allowed but discouraged at the top level"
for skills that aim to be portable. Mifune goes further: **these keys are
banned at the top level in this library**. This document explains why.

---

## The Problem: Invisible Divergence Across Clients

Claude Code processes these keys and changes its behaviour accordingly. Every
other compliant client — Copilot, Codex, Pi, and any future Agent-Skills
consumer — silently ignores them. The result is a skill that appears to work
fine under all clients but actually behaves differently on each one, with no
warning at install time or at runtime.

Examples of the failure modes:

| Key | Claude Code behaviour | All other clients |
|-----|-----------------------|-------------------|
| `disable-model-invocation` | Prevents the agent from calling external models | Ignored — invocation proceeds |
| `user-invocable` | Hides the skill from the slash-command menu | Ignored — skill appears |
| `paths` | Limits the files the skill can read/write | Ignored — no restriction |
| `hooks` | Runs shell commands before/after skill execution | Ignored — hooks never fire |
| `argument-hint` | Populates argument autocomplete in the UI | Ignored — no autocomplete |

A skill that relies on `hooks` for cleanup or `paths` for sandboxing is not
portable — it is a Claude-Code-only skill wearing a portable disguise. That
is worse than an honest Claude-Code-only skill, because the portability
failure is invisible.

---

## The Solution: Namespace, Then Adapt

When a skill genuinely needs Claude-Code-specific behaviour, place the keys
under `metadata.mifune.claude-code.*`:

```yaml
---
name: my-skill
description: "..."
license: Apache-2.0
metadata:
  mifune:
    version: "0.1.0"
    category: dev-workflow
    requires-tools: ["gh"]
    claude-code:
      argument-hint: "<feature description>"
      user-invocable: true
---
```

An install adapter (planned for V1) can promote these keys to the top level
when copying the skill into a Claude Code `.claude/skills/` directory. Other
clients receive the skill without the keys and are not affected.

This approach makes the Claude-Code dependency explicit and visible, without
polluting the portable skill surface.

---

## Enforcement

`scripts/validate.sh` rejects any `SKILL.md` that contains a deny-listed key
at the top level of its YAML frontmatter. The check runs on every PR via
`.github/workflows/ci.yml`.

If a skill author believes a top-level key is justified (e.g., the skill is
intentionally Claude-Code-only), they must:

1. Move all Claude-Code-specific keys to `metadata.mifune.claude-code.*`.
2. Document the client restriction in the `compatibility` field.
3. Update the skill's `clients` list in `registry.json` to reflect the
   tested client set.

---

## References

- Agent Skills spec — `allowed-tools`, `compatibility`, `metadata` fields
- `docs/checksum.md` — checksum algorithm
- `scripts/validate.sh` — enforcement logic and full deny-list
- `01-architecture.md` § *Frontmatter rules* — the upstream "allowed but
  discouraged" policy this document overrides
