---
name: spec
description: >-
  Dispatcher for the canonical decomposed workflow (AGENTS.md § The Workflow) —
  routes the first token of $ARGUMENTS to one of four subcommands: plan, critique,
  execute, or retro. Each is pointed at a tasks/<slug>/ folder (the universal
  interface) and is the same independently-runnable, fan-out-able node /ship-spec
  decomposes into. Full per-subcommand procedures live in
  references/{plan,critique,execute,retro}.md. Authority: AGENTS.md § The Workflow.
  TRIGGER when: a topic/plan/issue needs to become a buildable task folder, "plan
  <topic>", "scaffold the task for <issue>" -> plan; a planned tasks/<slug>/ folder
  needs adversarial review + a go/no-go decision, "critique <slug>", "vet the plan
  for <slug>" -> critique; an APPROVED tasks/<slug>/ folder needs building to a
  promotable PR, "execute <slug>", "build <slug>" -> execute; a build PASSed audit
  and its lessons should be captured, "retro the <slug> build", "capture lessons
  for <slug>" -> retro.
argument-hint: "plan <topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>] | critique <slug> [--auto] | execute <slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>] | retro <slug> [--dry-run]"
---

# /spec — canonical workflow dispatcher

`/spec <subcommand> [args]` is the single entry point to the decomposed
`spec-*` workflow nodes. The first whitespace-delimited token of `$ARGUMENTS`
selects the subcommand; everything after it is that subcommand's own argument
string. Each subcommand's full procedure lives in a reference doc under
`references/` — read that doc and follow it as the authoritative instructions.

This is the decomposed form of `/ship-spec`. `/ship-spec` remains the all-in-one
composer that runs the same `plan → critique → execute → retro` pipeline in one
invocation (what `/autopilot` drives) and is the single source of the protected
build mechanics each `/spec` node composes. The dispatcher is the same pipeline
split so each node can be run independently or fanned out at scale via `/delegate`.

## Subcommands

| Subcommand | Arg shape | Purpose | Procedure |
|---|---|---|---|
| `plan` | `<topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>]` | Turn a topic/plan/issue into a fully-scaffolded `tasks/<slug>/` four-file folder | `references/plan.md` |
| `critique` | `<slug> [--auto]` | Run the two adversarial critics (`/critique`) + the commitment gate (`/approve`); the `plan ⇄ critique` loop | `references/critique.md` |
| `execute` | `<slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>]` | `build ⇄ audit → spec-retro → improve → groom` to a ready PR, stopping at the human merge gate | `references/execute.md` |
| `retro` | `<slug> [--dry-run]` | Execution-side `/retro` scoped to a built `tasks/<slug>/` | `references/retro.md` |

## Dispatch

1. Split `$ARGUMENTS`: `SUB` = the first token; `REST` = everything after it.
2. Read `references/<SUB>.md` and follow it, treating `REST` as that doc's
   `$ARGUMENTS` (e.g. for `/spec plan <topic> --issue 7`, the plan procedure
   sees `<topic> --issue 7`).
3. Any unrecognized or empty `SUB` → print the Subcommands table as usage and stop.

```bash
SUB="${ARGUMENTS%% *}"                          # first token (subcommand)
REST="${ARGUMENTS#"$SUB"}"; REST="${REST# }"    # remainder = subcommand arguments
case "$SUB" in
  plan|critique|execute|retro)
    # read references/$SUB.md and execute it with REST as its $ARGUMENTS
    ;;
  *)
    echo "usage: /spec <plan|critique|execute|retro> [args]  — see the Subcommands table"
    ;;
esac
```

## Shared rules (apply to every subcommand)

- **Authority is `AGENTS.md § The Workflow`** — the canonical operative path
  (`select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean`),
  the single designated runner (`/autopilot`), and the `/ship-spec` caveat all
  live there. Defer to it; do not redefine the workflow here.
- **The `tasks/<slug>/` folder is the universal interface** — `plan` produces it;
  `critique`, `execute`, and `retro` are each pointed at it. The `<slug>` is the
  universal key (task directory, branch second segment, tmux session name).
- **Compose, don't fork** — each node reuses existing loop-node skills rather than
  re-implementing them: `plan` composes `/prd` + `/ralph`; `critique` composes
  `/critique` + `/approve`; `execute` composes `/ship-spec` build mechanics +
  `/audit`; `retro` composes `/retro`. `/ship-spec` stays the single source of the
  protected build literals (and its probes stay green).
- **Two adversarial loops** — `plan ⇄ critique` vets the plan (`critique` routes
  `DENIED` back to `plan`); `build ⇄ audit` inside `execute` vets the build
  (`AUDIT-FAIL` routes back to build). Critic-before-commitment: nothing
  GitHub-side exists until `critique` returns `SPEC-APPROVED`.
- **Honest STATUS tokens** — each subcommand prints exactly one bare token as its
  final line on success: `plan` → `STATUS: SPEC-PLANNED`; `critique` →
  `STATUS: SPEC-APPROVED` or `STATUS: SPEC-DENIED`; `execute` →
  `STATUS: SPEC-EXECUTED` or `STATUS: SPEC-BLOCKED`; `retro` →
  `STATUS: SPEC-RETRO-DONE`. Never infer success from silence — a missing
  artifact, crashed build, or undecided gate emits no `STATUS:` line.
- **Memory Improvement Protocol** — every invocation of every subcommand appends
  a log entry to `memory/<UTC-date>/log.md` under `## spec-<sub> -- HH:MM UTC`,
  then runs the qualify/improve pass per `.mifune/skills/retro/references/memory-protocol.md`. No exceptions.

## When NOT to use

- **`/ship-spec`** — when you want the all-in-one composer that runs the whole
  `plan → critique → execute → retro` pipeline in one invocation (what
  `/autopilot` drives).
- **`/autopilot`** — selection (which issue to build) is the runner's job; `/spec`
  builds the one folder it is handed.

## See Also

- `references/plan.md`, `references/critique.md`, `references/execute.md`,
  `references/retro.md` — the full per-subcommand procedures (authoritative).
- `AGENTS.md § The Workflow` — the canonical workflow this dispatcher decomposes.
- `.mifune/skills/ship-spec/SKILL.md` — the all-in-one composer + protected build
  mechanics each node reuses.
- `.mifune/skills/retro/references/memory-protocol.md` — Memory Improvement Protocol governing the log step.
