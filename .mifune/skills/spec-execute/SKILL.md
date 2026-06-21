---
name: spec-execute
description: >-
  The execute node of the canonical workflow (AGENTS.md § The Workflow) — point
  it at an APPROVED tasks/<slug>/ folder and it runs build ⇄ audit → spec-retro →
  improve → groom up to a ready-for-review PR, then stops at the human merge gate
  (never auto-merges). build ⇄ audit is the second adversarial loop (FAIL → build).
  Composes the existing build mechanics of /ship-spec (Stages 5, 8–13: locate
  issue + branch + draft PR + worktree Advisor + /delegate + scripts/ralph.sh +
  /eval + /pr-audit) plus the spec-* tail (/audit, /spec-retro,
  compound/compress/benchmark, skill-lint/wiki-lint/drift-check).
  TRIGGER when: an APPROVED tasks/<slug>/ folder needs building to a promotable PR;
  the execute step of AGENTS.md § The Workflow; "execute <slug>", "build <slug>",
  "spec-execute <slug>".
argument-hint: "<slug> [--pr <N>] [--repo <owner/name>] [--remote <name>] [--base <branch>]"
---

# Spec Execute — build ⇄ audit → spec-retro → improve → groom

The **execute** member of the `spec-*` family (`AGENTS.md § The Workflow`). Pointed at an
**APPROVED** `tasks/<slug>/` folder (cleared by `/spec-critique`), it drives the build to
a ready-for-review PR and stops at the human merge gate. It contains the second adversarial
loop — `build ⇄ audit` — mirroring the `spec-plan ⇄ spec-critique` loop that vetted the plan.

**Core principle: compose the protected build machinery; own only the spec-* tail.** The
heavy build/finalize mechanics already live in `/ship-spec` Stages 8–13 (worktree Advisor
launched via `/goal`, `/delegate` workers each running `scripts/ralph.sh`, the `/eval`
gate, the `/pr-audit` promotable undraft). `spec-execute` **reuses those by reference** —
it does not re-implement or fork them, so `/ship-spec` stays the single source of build
literals (and its protected probes stay green). What `spec-execute` adds is the
folder-pointed `build ⇄ audit` loop and the post-PASS tail named in `AGENTS.md § The
Workflow`: `spec-retro → improve → groom`.

`/ship-spec` is still the all-in-one composer that runs `plan → critique → execute` in one
invocation (what `/autopilot` drives). `spec-execute` is the decomposed execute stage,
runnable on its own folder or fanned out at scale via `/delegate`.

---

## Inputs

| Arg | Meaning |
|-----|---------|
| `<slug>` | The task slug — reads the four-file contract in `tasks/<slug>/` and `prd.json`'s `branchName`. Required. |
| `--pr <N>` | Resume against an existing PR rather than creating one. |
| `--repo <owner/name>` | GitHub repo (default `mifunedev/openharness`; read from the folder if `/spec-plan` recorded it). |
| `--remote <name>` | Git remote (resolved from `--repo` if absent). |
| `--base <branch>` | PR base + branch start point (default `development`). |

Precondition: `/spec-critique <slug>` returned `SPEC-APPROVED`. If `tasks/<slug>/` is not
APPROVED (no `critique.md`, or its verdict is `DENIED`), refuse and route back to
`/spec-critique` — do not build an ungated spec (`AGENTS.md § The Workflow`
critic-before-commitment invariant).

---

## The pipeline

### 1. Commitment + build (`/ship-spec` Stages 5, 8–11 by reference)

Now that the spec is APPROVED, GitHub-side state may be created: **locate** the issue
(`prd.json`'s `branchName` already embeds `<N>` — in the canonical flow that is the issue
`/autopilot` selected and `/spec-plan` consumed; open one only in a standalone run that has
no issue yet), create the branch `<prefix>/<N>-<slug>`, commit the scaffold, push, and open
the **draft** PR (observability checkpoint). Then drive the build exactly as `/ship-spec` Stage 10
specifies — an expert `/worktrees` Advisor in a tmux session (`agent-ship-<slug>`) via
`/goal`, running `/delegate --plan tasks/<slug>/prd.json` workers that each run
`scripts/ralph.sh <slug>` in an isolated worktree, monitored to `STATUS: COMPLETE`. Use
that skill's stage text as the authority for the mechanics; do not duplicate them here.

### 2. `build ⇄ audit` — the second adversarial loop

When the build reports complete, run the per-unit verdict gate:

```
/audit <slug> --pr <N> --branch <prefix>/<N>-<slug>
```

`/audit` composes `prd.json` task-graph conformance + the `/eval` regression floor +
`/pr-audit` promotable classification (+ `/agent-browser` for UI stories) into one verdict:

- `AUDIT-FAIL` → loop back to **build**: resume the Advisor / `scripts/ralph.sh <slug>` to
  finish the unmet stories, then re-audit. This is the build-side adversary — keep looping
  until the build satisfies its own task graph.
- `AUDIT-PASS` → the build is promotable; continue to the tail.

The wiki-revision gate (`/ship-spec` Stage 11.25) applies inside this loop when
`prd.md`'s `## Wiki Alignment` is `Impact: REQUIRED`: required `wiki/*.md` entries are
revised against the implemented behavior + DeepWiki comparison and `wiki/README.md` is
refreshed before the audit can PASS.

### 3. `spec-retro` — capture the lessons

On `AUDIT-PASS`, run `/spec-retro <slug>` (the execution-side retro). It turns the run's
signals into falsifiable, evidence-tested lessons and promotes the supported ones behind a
propose-then-confirm gate. Always logs.

### 4. `improve` — compound · compress · benchmark

The self-improvement tail (`AGENTS.md § The Workflow`):

- **compound** — promote durable knowledge so it is reused, not re-derived (`/wiki-ingest`,
  `memory/MEMORY.md`, mint a probe from any guardrail lesson).
- **compress** — keep the always-loaded context lean and clear (`/context-audit`).
- **benchmark** — confirm the change earned its complexity (`/benchmark`): the `/eval`
  regression floor stays green AND the capability-benchmark ceiling held or moved.

### 5. `groom` — pre-merge health checks

Before handing to the human, run the grooming triad named in `AGENTS.md § The Workflow`:
`/skill-lint` · `/wiki-lint` · `/drift-check`. These are report-only health checks; surface
findings, do not block the merge on advisory output.

### 6. Undraft → human merge gate

Mark the PR ready (`gh pr ready <N>`) **only** when `/audit` PASSED and an immediately
preceding `/pr-audit` classifies it promotable (CI green + mergeable + clean) — exactly the
`/ship-spec` Stage 12–13 gate. Then **stop**. The human owns the merge (`AGENTS.md § The
Workflow`: *human merge — final gate, no auto-merge*). Never `gh pr merge`.

---

## What this skill does NOT do

- **Re-implement the build machinery.** It composes `/ship-spec` Stages 8–13; that skill is
  the single source of worktree/delegate/ralph/eval/pr-audit literals.
- **Merge.** The terminal state is a **ready** PR. Merge is the human's gate; reset/clean is
  the runner's job after merge.
- **Select work.** Selection is `/autopilot`'s; `spec-execute` builds the one folder it is
  handed.

---

## Memory Protocol

The composed skills each log their own entries. `spec-execute` adds one roll-up to
`memory/<UTC-date>/log.md` per `context/rules/memory.md`:

```markdown
## spec-execute -- HH:MM UTC
- **Result**: OP | PARTIAL | FAIL
- **Slug / PR**: <slug> / #<N>
- **Audit**: AUDIT-PASS | AUDIT-FAIL (loop count <n>)
- **Tail**: spec-retro <done> · improve <done> · groom <findings>
- **Terminal**: READY (pending human merge) | DRAFT-BLOCKED (<gate>)
- **Observation**: <one sentence>
```

---

## Pipeline position

Within `AGENTS.md § The Workflow` (`select → spec-plan ⇄ spec-critique → spec-execute →
merge → reset|clean`), `spec-execute` is the **execute** node — it ends at the human merge
gate (next step: the human merges; the runner then resets/cleans). When a gate blocks the
undraft, the next step is to resume the build or fix the named gate. Print one of these bare
tokens as the final line:

    STATUS: SPEC-EXECUTED

    STATUS: SPEC-BLOCKED

The `spec-*` family's authority is `AGENTS.md § The Workflow`. Never infer a
promotable PR from silence — a build that crashed or an unrun CI is `SPEC-BLOCKED`, not
`SPEC-EXECUTED`.
