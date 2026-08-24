---
name: spec
description: >-
  Dispatcher for the canonical decomposed workflow (AGENTS.md § The Workflow) —
  routes the first token of $ARGUMENTS to one of three subcommands: plan,
  execute, or retro. Each is pointed at a .oh/tasks/<slug>/ folder (the universal
  interface) and is independently runnable and fan-out-able. This is the ONLY
  build path: there is no all-in-one composer beside it. Full per-subcommand procedures live in
  references/{plan,execute,retro}.md. Authority: AGENTS.md § The Workflow.
  TRIGGER when: a topic/plan/issue needs to become a buildable task folder, "plan
  <topic>", "scaffold the task for <issue>" -> plan; an approved .oh/tasks/<slug>/
  folder needs building to a promotable PR, "execute <slug>", "build <slug>" ->
  execute; a build PASSed audit and its lessons should be captured, "retro the
  <slug> build", "capture lessons for <slug>" -> retro.
argument-hint: "plan <topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>] | execute <slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>] | retro <slug> [--dry-run]"
---

# /spec — canonical workflow dispatcher

`/spec <subcommand> [args]` is the single entry point to the decomposed
`spec-*` workflow nodes. The first whitespace-delimited token of `$ARGUMENTS`
selects the subcommand; everything after it is that subcommand's own argument
string. Each subcommand's full procedure lives in a reference doc under
`references/` — read that doc and follow it as the authoritative instructions.

This is the **only** spec pipeline; there is no all-in-one composer beside it.
`references/execute.md` holds the build mechanics in full — the issue, the branch,
the draft PR, the build launch, the `/eval` and wiki gates, the promotable
classification, and the undraft — so learning what the build does never sends a
reader to a second skill. The dispatcher splits the pipeline so each node can be
run independently or fanned out at scale via `/delegate`.

## Subcommands

| Subcommand | Arg shape | Purpose | Procedure |
|---|---|---|---|
| `plan` | `<topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>]` | Turn a topic/plan/issue into a fully-scaffolded `.oh/tasks/<slug>/` four-file folder | `references/plan.md` |
| `execute` | `<slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>]` | `build ⇄ audit → evidence → teach → spec-retro → improve` to a ready PR, stopping at the human merge gate | `references/execute.md` |
| `retro` | `<slug> [--dry-run]` | Execution-side `/retro` scoped to a built `.oh/tasks/<slug>/` | `references/retro.md` |

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
  plan|execute|retro)
    # read references/$SUB.md and execute it with REST as its $ARGUMENTS
    ;;
  *)
    echo "usage: /spec <plan|execute|retro> [args]  — see the Subcommands table"
    ;;
esac
```

## Shared rules (apply to every subcommand)

- **Authority is `AGENTS.md § The Workflow`** — the canonical operative path
  (`select → spec-plan → spec-execute → merge → reset|clean`),
  and the single designated runner (`/autopilot`) both
  live there. Defer to it; do not redefine the workflow here.
- **The `.oh/tasks/<slug>/` folder is the universal interface** — `plan` produces it;
  `execute` and `retro` are each pointed at it. The `<slug>` is the
  universal key (task directory, branch second segment, tmux session name).
- **Compose, don't fork** — each node reuses existing loop-node skills rather than
  re-implementing them: `plan` composes `/prd` + `/ralph`; `execute` composes
  `.oh/scripts/firstmate.sh` + `/audit implementation` + `/eval` + `/audit pr`;
  `retro` composes `/retro`. The build **literals** — the `gh` invocations, the
  branch and PR shapes, the Advisor launch — live in `references/execute.md`,
  which is the single source for them and is a protected path.
- **One adversarial loop** — `build ⇄ audit` inside `execute` vets the build
  (`AUDIT-FAIL` routes back to build). The plan itself is vetted by the operator
  who approves it: **approving `prd.md` is the commitment gate**, and nothing
  GitHub-side exists until `execute` starts.
- **Honest terminal reports** — each subcommand reports what it actually produced: `plan`
  the folder path and story count; `execute` `READY` or `DRAFT-BLOCKED (<gate>)` with the PR
  URL; `retro` the promotion counts. There are no `STATUS: SPEC-*` tokens — all four had
  **zero executable consumers repo-wide**, so printing them was ceremony. The rule they
  encoded still holds and is what matters: never infer success from silence. A missing
  artifact, a crashed build, or an undecided gate is reported as blocked, never as done.
- **Memory Improvement Protocol** — each subcommand appends **one** entry per run to
  `.oh/memory/<UTC-date>/log.md` under `## spec-<sub> -- HH:MM UTC`, in the three-field
  `Result` / `Action` / `Observation` shape the heartbeat cron reads
  (`.oh/crons/heartbeat.md`), then runs the qualify/improve pass per
  `.oh/skills/retro/references/memory-protocol.md`. One entry per run, not one per node:
  nothing consumed the extra structure.

## When NOT to use

- **`/autopilot`** — selection (which issue to build) is the runner's job; `/spec`
  builds the one folder it is handed.

## See Also

- `references/plan.md`, `references/execute.md`,
  `references/retro.md` — the full per-subcommand procedures (authoritative).
- `AGENTS.md § The Workflow` — the canonical workflow this dispatcher decomposes.
- `.oh/skills/retro/references/memory-protocol.md` — Memory Improvement Protocol governing the log step.
