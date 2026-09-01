---
name: spec
description: >-
  Canonical decomposed build workflow and dispatcher. Routes the first token of
  $ARGUMENTS to one of four subcommands: ship, plan, execute, or retro. Each of
  plan/execute/retro is pointed at a .oh/tasks/<slug>/ folder (the universal
  interface) and is independently runnable and fan-out-able; ship composes plan
  then execute. This skill owns the ONLY build path; there is no all-in-one
  composer beside it. Full per-subcommand procedures live in
  references/{ship,plan,execute,retro}.md.
  TRIGGER when: an approved plan file should become a ready PR without further
  hand-holding, "/spec <plan-path>", "ship this plan", "build this plan end to end"
  -> ship (also the DEFAULT for an unrecognized first token); a topic/plan/issue
  needs to become a buildable task folder without building it, "plan <topic>",
  "scaffold the task for <issue>" -> plan; an approved .oh/tasks/<slug>/ folder
  needs building to a promotable PR, "execute <slug>", "build <slug>" -> execute; a
  build PASSed audit and its lessons should be captured, "retro the <slug> build",
  "capture lessons for <slug>" -> retro.
argument-hint: "<plan-path> | ship <plan-path|topic> [--issue <N>] [--slug <slug>] | plan <topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>] | execute <slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>] | retro <slug> [--dry-run]"
---

# /spec — canonical workflow dispatcher

`/spec <subcommand> [args]` is the single entry point to the decomposed
`spec-*` workflow nodes. The first whitespace-delimited token of `$ARGUMENTS`
selects the subcommand; everything after it is that subcommand's own argument
string. Each subcommand's full procedure lives in a reference doc under
`references/` — read that doc and follow it as the authoritative instructions.

**An unrecognized first token is not an error — it is `ship`.** `/spec <plan-path>`
is the ordinary way in: it scaffolds the task folder and then builds it through to a
ready-for-review pull request. Naming a node explicitly (`plan`, `execute`, `retro`)
runs only that node, which is what fan-out and recovery need.

This is the **only** spec pipeline; there is no all-in-one composer beside it.
`references/execute.md` holds the build mechanics in full — the issue, the branch,
the draft PR, the implementation, the `/eval` and wiki gates, the promotable
classification, and the undraft — so learning what the build does never sends a
reader to a second skill. The dispatcher splits the pipeline so each node can be
run independently or fanned out at scale via `/delegate`.

## Workflow contract

The canonical operative path is
`spec-plan → spec-execute → merge → reset|clean`.

There is no automated selection node. A human selects the work and approves
`prd.md`; that approval is the commitment gate. **Handing `/spec` an approved plan
file satisfies that gate** — writing the plan and passing it in *is* the operator's
approval, so `ship` carries it through to `execute` without a second prompt. A bare
topic with no plan file has no such approval behind it: `ship` stops after `plan` and
hands the operator the folder to approve. `/spec execute` runs
`build ⇄ audit → evidence → spec-retro → improve` and stops at a ready-for-review
pull request. **`/spec` never launches another coding-agent process to do that work** —
the agent invoking `execute` is the single implementation owner, from the isolated
worktree through the final PR gates. The human alone merges. The runner performs
`reset` or `clean`.

The `.oh/tasks/<slug>/` folder is the interface between all three subcommands.
`evidence.md` records plan requirements, build results, reasons for divergence,
and unverified work. `/spec execute` refuses to mark a pull request ready when that
evidence is absent or uncommitted.

## Subcommands

| Subcommand | Arg shape | Purpose | Procedure |
|---|---|---|---|
| `ship` | `<plan-path\|topic> [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>]` | **The default.** `plan` → `execute` in one invocation: an approved plan file becomes a ready-for-review PR. Selected by an unrecognized first token, so `/spec <plan-path>` works bare | `references/ship.md` |
| `plan` | `<topic> [--plan <path>] [--issue <N>] [--slug <slug>] [--prefix <type>] [--repo <o/n>] [--base <branch>]` | Turn a topic/plan/issue into a fully-scaffolded `.oh/tasks/<slug>/` four-file folder | `references/plan.md` |
| `execute` | `<slug> [--pr <N>] [--repo <o/n>] [--remote <name>] [--base <branch>]` | `implementation ⇄ audit → evidence → spec-retro → improve` to a ready PR, stopping at the human merge gate | `references/execute.md` |
| `retro` | `<slug> [--dry-run]` | Execution-side `/retro` scoped to a built `.oh/tasks/<slug>/` | `references/retro.md` |

## Dispatch

1. Split `$ARGUMENTS`: `SUB` = the first token; `REST` = everything after it.
2. When `SUB` names a node (`ship`, `plan`, `execute`, `retro`), read
   `references/<SUB>.md` and follow it, treating `REST` as that doc's `$ARGUMENTS`
   (e.g. for `/spec plan <topic> --issue 7`, the plan procedure sees
   `<topic> --issue 7`).
3. **Any other non-empty `$ARGUMENTS` is `ship`, with the whole string — `SUB`
   included — as its argument.** `/spec .claude/plans/x.md` and
   `/spec ship .claude/plans/x.md` are the same invocation. Do not print usage for an
   argument that merely fails to name a node; a plan path is the expected input.
4. Empty `$ARGUMENTS` → print the Subcommands table as usage and stop. There is
   nothing to ship.

```bash
SUB="${ARGUMENTS%% *}"                          # first token
REST="${ARGUMENTS#"$SUB"}"; REST="${REST# }"    # remainder
case "$SUB" in
  ship|plan|execute|retro)
    # read references/$SUB.md and execute it with REST as its $ARGUMENTS
    ;;
  "")
    echo "usage: /spec [ship] <plan-path|topic> | plan <topic> | execute <slug> | retro <slug>"
    ;;
  *)
    # DEFAULT: not a node name -> ship, keeping the full argument string
    # read references/ship.md and execute it with "$ARGUMENTS" as its $ARGUMENTS
    ;;
esac
```

## Shared rules (apply to every subcommand)

- **This skill owns the workflow** — keep the operative path, human selection,
  plan-approval gate, evidence gate, and human merge boundary in this skill and its
  four direct references. Do not duplicate the workflow in root instructions.
- **The `.oh/tasks/<slug>/` folder is the universal interface** — `plan` produces it;
  `execute` and `retro` are each pointed at it. The `<slug>` is the
  universal key (task directory, branch second segment). It is never a terminal
  identifier — not a multiplexer session, not a Herdr tab or pane, not any runtime handle.
- **Compose, don't fork** — each node reuses existing skills rather than
  re-implementing them: `ship` composes `plan` then `execute` and owns no build
  mechanics of its own; `plan` composes `/prd` + `/ralph`; `execute` is owned by the
  agent running it, uses `/delegate` only for bounded fan-out,
  and composes `/audit implementation` + `/eval` + `/audit pr`; `retro` composes
  `/retro`. The build **literals** — the `gh` invocations, the branch and PR shapes,
  and the handoff-free implementation rules — live in
  `references/execute.md`, which is the single source for them and is a protected path.
- **One adversarial loop** — `implementation ⇄ audit` inside `execute` vets the
  implementation (`AUDIT-FAIL` routes back to the same owner). The plan
  itself is vetted by the operator who approves it: **approving `prd.md` is the
  commitment gate**, and nothing GitHub-side exists until `execute` starts.
- **Honest terminal reports** — each subcommand reports what it actually produced: `plan`
  the folder path and story count; `execute` `READY` or `DRAFT-BLOCKED (<gate>)` with the PR
  URL; `ship` the same terminal report as whichever node it stopped at; `retro` the
  promotion counts. There are no `STATUS: SPEC-*` tokens — all four had
  **zero executable consumers repo-wide**, so printing them was ceremony. The rule they
  encoded still holds and is what matters: never infer success from silence. A missing
  artifact, a crashed build, or an undecided gate is reported as blocked, never as done.

## When NOT to use

- **selection** — choosing which issue to build is the human's job; `/spec`
  builds the one plan or folder it is handed. `ship` automates the hop from plan to
  execute, never the choice of what to work on.

## See Also

- `references/ship.md`, `references/plan.md`, `references/execute.md`, and
  `references/retro.md` — the authoritative per-subcommand procedures.
