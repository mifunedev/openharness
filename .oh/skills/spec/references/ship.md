# `/spec ship` — an approved plan to a ready pull request

> Detail doc for the **`ship`** subcommand of the `/spec` skill
> (`.oh/skills/spec/SKILL.md`). Argument form:
> `ship <plan-path|topic> [--issue <N>] [--slug <slug>] [--prefix feat|bug|task|audit|skill|agent] [--repo <owner/name>] [--base <branch>]`.
> `ship` is the **default** node: the dispatcher routes any non-empty `$ARGUMENTS`
> whose first token is not `ship`/`plan`/`execute`/`retro` here, passing the whole
> string. Authority: `.oh/skills/spec/SKILL.md`.

`ship` runs the canonical operative path — `plan → execute` — in one invocation, so
handing `/spec` a plan file produces a ready-for-review pull request. It produces no
artifact of its own: `plan` writes the `.oh/tasks/<slug>/` folder that is the universal
interface, and `execute` builds from it.

**Core principle: `ship` composes, it does not build.** Every artifact it produces is
produced by `plan` or `execute` under their own procedures. `ship` adds no mechanics of
its own — no `gh` invocation, no branch shape, no gate. It decides one thing: whether
the commitment gate is already satisfied, and therefore whether to continue into
`execute`.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<plan-path>` | A readable path to a plan file (`.claude/plans/*.md`, `/imagine` output, any markdown spec). **Its presence is the operator's approval** — see the gate below. |
| `<topic>` | Free-text description, when no plan file exists. Carries no approval; `ship` stops after `plan`. |
| `--issue <N>` | Issue this builds. Passed to `plan` (which embeds it in the branch name via `/ralph`). When absent, `execute`'s standalone-run path opens one. |
| `--slug <slug>` | Override slug derivation. `[a-z0-9-]+`, ≤5 hyphen-words, not `archive`. |
| `--prefix <type>` | Branch/issue prefix, default `feat`, per `.claude/skills/git/SKILL.md`. |
| `--repo <owner/name>` | Default `mifunedev/openharness`. Recorded by `plan`, acted on by `execute`. |
| `--base <branch>` | Default `development`. Same. |

The first token is a plan path when it resolves to a readable file; otherwise it is
treated as the start of a free-text topic.

---

## The commitment gate

`.oh/skills/spec/SKILL.md` makes approving `prd.md` the commitment gate — nothing
GitHub-side exists until it is crossed. `ship` does not remove that gate; it recognizes
when the operator has already crossed it.

| Input | Gate | Behavior |
|---|---|---|
| A plan file (`<plan-path>` or `--plan <path>`) | **Satisfied.** The operator wrote the plan and handed it in; requiring a second approval of a `prd.md` derived from it asks the same question twice | `plan`, then `execute` — through to a ready PR |
| A bare topic, no plan file | **Not satisfied.** Nothing has been approved; the PRD is the first artifact anyone could approve | `plan` only. Report the folder path and stop with the `/spec execute <slug>` invocation to run after approval |

An operator who wants the folder without the build asks for the node by name:
`/spec plan <plan-path>`. That is the escape hatch, and it is why `plan` stays a public
subcommand.

---

## The pipeline

1. **Resolve the input.** Determine plan-path vs topic; derive or accept `<slug>`.
   Report both before doing anything, so a wrong slug is caught before files exist.

2. **Run `plan`.** Follow `references/plan.md` with
   `<topic-or-plan> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix ...] [--repo ...] [--base ...]`.
   A plan-path first token is passed to `plan` as `--plan <path>` with the topic derived
   from the plan's own title. Verify the four-file contract
   (`prd.md`, `prd.json`, `prompt.md`, `progress.txt`) before continuing — an incomplete
   folder is a failure, not a clean plan, and `ship` must not build on one.

3. **Decide at the gate** (table above). Not satisfied → report and stop. This is a
   complete, honest outcome, not a blocked one.

4. **Run `execute`.** Follow `references/execute.md` with
   `<slug> [--repo ...] [--remote ...] [--base ...]`, which owns the issue, branch, draft
   PR, Advisor build, `implementation ⇄ audit` loop, evidence, `/eval` and wiki gates,
   and the undraft. `ship` neither reimplements nor relaxes any of it: a
   `DRAFT-BLOCKED (<gate>)` from `execute` is `ship`'s outcome verbatim.

5. **Stop at the human merge boundary.** `ship` never merges, and never marks a PR ready
   that `execute`'s own gates left draft.

---

## Output

Whatever the node it stopped at produced:

| Stopped at | Report |
|---|---|
| `plan` (gate not satisfied) | The folder path, the story count, and `/spec execute <slug>` as the next command |
| `execute` | `READY` or `DRAFT-BLOCKED (<gate>)` with the PR URL |

Report which node it stopped at and why. A run that stopped after `plan` because the
input was a bare topic is a success; a run that stopped after `plan` because the
four-file contract was incomplete is a failure. Never report them the same way, and
never infer success from silence.

---

## What this node does NOT do

- **Add a build step.** Every mechanic belongs to `plan` or `execute`. If `ship` needs
  new build behavior, the behavior belongs in `execute.md` — the protected single source
  for build literals — not here.
- **Merge.** The human alone merges (`.oh/skills/spec/SKILL.md`).
- **Select the work.** It builds the one plan it is handed.
- **Skip a gate.** It reads the commitment gate as already satisfied when an approved
  plan was passed in. Every other gate — evidence, audit, `/eval`, wiki — is `execute`'s
  and is untouched.

## Pipeline position

Within the workflow owned by `.oh/skills/spec/SKILL.md`, `ship` is the entry point —
the node an operator reaches by typing nothing but a plan path. It occupies no position
of its own in `spec-plan → spec-execute → merge → reset|clean`; it walks the first two
and stops at the human merge boundary, exactly where `execute` stops.

## See Also

- `.oh/skills/spec/SKILL.md` — the dispatcher and workflow contract; the authority.
- `references/plan.md` — the folder-scaffolding node.
- `references/execute.md` — the build node and the single source for its literals.
