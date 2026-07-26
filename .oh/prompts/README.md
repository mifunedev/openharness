# `prompts/`

Provider-neutral prompt packs consumed by harness sessions — versioned
workflow prompts an operator feeds to an agent session, kept as plain
YAML so no single provider owns them.

| Dir        | Purpose                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `advisor/` | The First Mate workflow prompts, in increasing scope: `plan.yml` (plan only) → `implement.yml` (plan + build) → `pr.yml` (plan + build + PR tail) |

## Prompt schema

Each `.yml` is a single `advisor:` document with these fields:

- `role` — the First Mate role framing (charter reference inline).
- `agents` — crew agents the session delegates to (each must resolve to
  `.oh/agents/<name>.md`).
- `warning` *(optional)* — delegation guardrails. Present in
  `implement.yml` and `pr.yml`, absent in `plan.yml`, by operator design.
- `query` — the ordered workflow steps for the session.

## Conventions

- Prompt content is **operator-authored**: land edits byte-identical;
  do not reword `role`, `warning`, or `query` steps in passing.
- A provider may keep a rendered mirror of a pack (e.g.
  `.pi/prompts/advisor/pr.md`); when one exists, edit the yml here
  first, then re-render the mirror.

## Pointers

- `.oh/context/rules/first-mate.md` — the First Mate role charter these
  prompts reference (on-demand doc; owns the role definition and
  Effort Scaling).
- `.oh/context/directory-readme.md` — the README convention this file
  follows.
