# The plan is the contract; the machinery between plan and merge shreds it

## Context

The plan handed to a compacted agent is **the operator's last known understanding
of the work.** After that handoff the operator's model stops updating, and nothing
in the pipeline reconciles what got built back against the plan they read.

The pipeline has ~10 verification nodes and **zero comprehension nodes**. Every
gate asks "is this correct?" None asks "is this still what you agreed to?" The
critique/approve gate is the clearest case: it halts the workflow, costs 2–4 critic
agents, and adds nothing to the operator's understanding.

Alongside that, the process carries surplus machinery that adds branching and
confusion without adding signal — two spec pipelines where v2 delegates into v1's
body, three parallel build executors, status tokens nothing routes on, and log
entries nothing reads.

So: remove the gate that stops without informing, collapse the duplicate paths to
one, and make the pipeline answer back to the plan.

---

## Diagnosis

### 1. The gate that stops the workflow adds no understanding

`critique.md` feeds the approve decision, then never surfaces to the operator
durably. The critic prompt is authored **twice** (`ship-spec/SKILL.md:132-168` and
`critique/SKILL.md:54-82`) despite `critique.md:47-48` mandating single authoring —
and the copies have drifted: ship-spec's critics carry a wiki-alignment item
`/critique`'s lack.

### 2. Duplicate paths to the same outcome

**Three build executors.** `ralph` (default), `delegate-advisor`, and `firstmate`
all reach the same terminal interface — the whole line `STATUS: COMPLETE` in
`progress.txt`. Every skill, probe, and doc that touches the build carries a
three-way toggle, and a reader has to work out which arm ran before anything else
makes sense. `ralph` was not causing failures; it is noise in a process we are
refining.

`firstmate` is the arm to keep. `.oh/scripts/firstmate.sh` validates the slug and
the task contract, claims an atomic lock, renders the session prompt, and creates
a **child session** through the herdr → tmux → foreground ladder, then watches for
the sentinel — the launcher stays unblocked for new work. The child session runs
the advisor/executor delegation workflow from that rendered prompt: it holds the
task graph, writes the briefings, fans out through `/delegate` without replacing
the story cycle (`session-prompt.md:213,219-227`), and flips `passes: true` itself
because *"delegates never self-certify"* (`:156`). The template is a zero-diff
derivative of `.oh/prompts/advisor/{implement,pr}.yml`, so that step order is
already the advisor pack's.

**Two spec pipelines.** `/ship-spec` is v1 — 541 lines, 18 stages — and `/spec` is
the decomposition of it. They coexist by deferral rather than replacement:
`execute.md:14-19` states *"the heavy build/finalize mechanics already live in
`/ship-spec` Stages 8–13… `execute` reuses those by reference… so `/ship-spec`
stays the single source of build literals."* So the current pipeline is a v2 shell
delegating into v1's body, and `/autopilot` drives v1 directly. Anyone reading
`/spec execute` to learn what the build does is sent to a different skill.

### 3. Nothing reconciles built-vs-plan after the handoff

`.oh/skills/spec/references/execute.md` contains **zero** occurrences of
*evidence*, *teach*, *summarize*, *explain*, *understand*, or *reconcile*, and no
PR body template. `/audit implementation` Gate 1 checks `prd.json` `passes: true`
booleans — not an account of divergence.

`/teach` — *"teach the operator the mental model, verification evidence, caveats,
and understanding checks"* — appears in the `AGENTS.md:191` table and **in no
pipeline**. **0 invocations in 550 sessions.**

### 4. Every artifact that could carry the delta is discarded

| Artifact | What happens to it |
|---|---|
| `evidence.md` — the reviewer proof doc | **Never produced on the `/spec` path.** `/audit` disclaims it: *"the orchestrating caller writes and commits it"* — `/spec execute` never does. It **is** ANCHOR 6 of firstmate's step order (from `pr.yml:28-32`), so the artifact exists on the advisor path and is simply not required by the pipeline |
| `progress.txt` narrative | Written every iteration, read by the next, then dead |
| groom tail (`/audit skills` 39×5, `/wiki lint`, `/audit drift`) | No file, no PR comment, no log schema |
| `/benchmark`'s `REDIRECT-FLAG` | *"The harness's single tap on a human's shoulder"* — printed into a turn nobody reads |
| `/audit`'s `evidence.json` + screenshots | `mktemp -d` with `trap cleanup EXIT`, `rm -rf`'d |
| Four `STATUS: SPEC-*` tokens | **Zero executable consumers repo-wide** |
| Mandatory `## spec-*` log entries | **No reader.** `/retro` is forbidden from reading prior logs |

`/eval` runs **3× per cycle on the same commit — 318 probe executions**; each
AUDIT-FAIL retry adds 106. PR classification runs 2–3×. Wiki README index 4×.

### 5. Memory is the cross-session version of the same failure

| Measurement | Value |
|---|---|
| Entries citing `probe: <id>` | 73 / 102 |
| Those probe files that exist | **0 / 73** |
| Probes sourced from a lesson currently in MEMORY.md | **0 / 106** |
| Entries restating an IDENTITY.md principle | **49 / 102 (48%)** |
| Entries ever deleted for being wrong or stale | **0** |
| MEMORY.md share of the always-on tier | **55%** (46.3 KB of 84 KB) |

`memory-protocol.md:206` already requires removing a lesson from MEMORY once it
reaches IDENTITY; applied zero times. Dedup is `grep -Fqi` fixed-string. No size
cap. Verified dead: 9 obsolete/falsified, 17 one-time narratives, 4 out-of-domain,
6 repo-derivable. Recoverable with no information loss: **~47%**.

---

## Approach

### Move 1 — Remove the critique/approve gate

Path becomes `select → plan → execute → merge → reset`.

- `AGENTS.md § The Workflow` — prose, table, mermaid diagram
- `.oh/skills/spec/SKILL.md` — drop the `critique` subcommand; delete `references/critique.md`
- `.oh/skills/ship-spec/SKILL.md` — remove Stages 3–4 and their halt-table rows
- `.oh/skills/spec/references/execute.md:39-42` — remove the APPROVED precondition
- Retire `/critique` and `/approve`; update `.oh/evals/probes/spec-family-contract.sh`

*Critique's redesign stays a separate ticket. This removes it from the path.*

### Move 2 — Collapse to one build executor

Retire **both** `ralph` and `delegate-advisor`. `firstmate` becomes the single
build path — no executor toggle survives, so `--executor`, `SHIP_SPEC_EXECUTOR`,
and `AUTOPILOT_EXECUTOR` are removed rather than reduced to one value.

Delete `.oh/scripts/ralph.sh`, `.oh/scripts/__tests__/ralph.test.ts`, and
`.oh/skills/ship-spec/templates/prompt.md` (ralph's per-iteration prompt;
firstmate has its own at `.oh/skills/firstmate/templates/session-prompt.md`).

Flip the default and remove the `ralph` arm in:
`.oh/skills/ship-spec/SKILL.md` (Stage 10, `--executor`, `SHIP_SPEC_EXECUTOR`),
`.oh/skills/autopilot/SKILL.md` (toggle + the `ralph` fallback section),
`.oh/skills/spec/references/execute.md`, `.oh/agents/advisor.md`
(lines 26, 98, 212 — the "Monitored async ralph loop" variant), `AGENTS.md:194`.

**Keep** `prd.json` and the `/ralph` skill that produces it. The runner goes; the
task contract stays — it has 15 consumers including `firstmate.sh`,
`task-contract.sh`, `.oh/cli/src/commands/init.ts`, both advisor prompts, and 7
probes. Consider renaming `/ralph` once the runner is gone.

**Three probes will go red by design** and must be *rewritten in the same change*,
not deleted to green:
- `autopilot-executor-toggle.sh` — ~8 assertions pinned to ralph literals
  (`.oh/scripts/ralph.sh "$SLUG"`, `SHIP_SPEC_EXECUTOR:-ralph`, `` #### `ralph` fallback ``)
- `advisor-monitored-loop.sh` — asserts the variant name "Monitored async ralph loop"
- `firstmate-executor-contract.sh` — asserts a `ralph` arm exists *and* that
  `ralph.sh` still exists

Deleting probes to make a removal pass is the exact Goodhart failure this repo's
own memory warns about. Each rewritten probe must be verified by rejection.

### Move 3 — Retire the secondary implementation paths

`/spec` becomes the single primary method of implementation. A removed path must
leave **no residue discoverable in the file layout** — an agent exploring the repo
mid-task will find a secondary path and follow it, which is exactly how a
long-horizon run gets polluted. Deletion here means gone, not deprecated.

#### 3a. Absorb `/ship-spec` into `/spec execute`

This is an **absorption, not a deletion**. `/spec execute` currently owns only the
`build ⇄ audit` loop and the post-PASS tail; the mechanics live in v1. Inline them
so `/spec execute` is self-contained and reads top-to-bottom:

- Stage 5 (issue), 8–9 (branch, scaffold commit, draft PR), 10 (build launch),
  11 (`/eval`), 11.25 (wiki revision), 12–13 (`/audit pr` → undraft)
- Delete `.oh/skills/ship-spec/` and remove the `execute.md:14-19` deferral
- Repoint `/autopilot` and `.oh/crons/autopilot.md` from `/ship-spec --issue` to
  `/spec`; drop `--executor=ship-spec` and `SHIP_SPEC_EXECUTOR`
- Update `.oh/agents/advisor.md:98`, `.oh/crons/prompt-miner.md`,
  `.oh/docs/glossary.md`, `.oh/docs/oh-directory-layout.md`,
  `.oh/evals/datasets/README.md`, `.oh/docs/integrations/pi-autoresearch.md`
- Rewrite the capability benchmark tasks that script v1 —
  `CB-001-ship-harness-change.md`, `CB-002-walk-the-workflow.md` — these are the
  ceiling instrument, so they must be re-authored, not dropped

**Sequence this after Moves 1–2.** Those remove Stages 3–4 and the ralph arm
first, so the surface to absorb is materially smaller and the "protected build
literals" probes get repointed once rather than twice.

#### 3b. Remove the advisor prompt pack

Delete `.oh/prompts/advisor/implement.yml` and `pr.yml`, and the Pi mirror
`.pi/prompts/advisor/pr.md`. The step order they define is already **recorded
verbatim** in `.oh/skills/firstmate/templates/session-prompt.md:42-52`, so the
derivative becomes the source and nothing is lost.

Consequences to handle in the same change:

- `firstmate-executor-contract.sh` — assertion 5 (`git diff --quiet -- .oh/prompts/`,
  lines 146-151) becomes meaningless and must be **removed**, not stubbed. The
  anchor-order assertion (4) still works because the list is in the template.
  Rewrite the provenance comments at `:8-9,103-106` to name the template as owner.
- `.oh/skills/audit/references/pr.md:9` and `reviewer-evidence-doc.md:17,24` —
  repoint the `evidence.md` contract at `/spec execute` (Move 4 makes it a gate
  condition there).
- `.oh/skills/retro/SKILL.md:229` — the `auto-approve` "common invocation path"
  cites both yml files; repoint at `/spec`.
- `.oh/skills/firstmate/SKILL.md:29`, `session-prompt.md:34-35`, `AGENTS.md:31`,
  `.oh/prompts/README.md:27`.

**`plan.yml` goes too.** Remove the whole `.oh/prompts/advisor/` directory, which
also retires the First Mate role charter `.oh/context/rules/first-mate.md`, its
probe `first-mate-charter.sh`, and the `architect` agent's entry point
(`.oh/agents/architect.md:8` — repoint or retire the agent with it). `/spec plan`
is the planning method; a second plan-side advisor is the same pollution as a
second implementation path.

### Move 4 — Make the plan the contract the build answers to

Move 2 already inherits most of this: firstmate's step order carries `evidence.md`
(ANCHOR 6), `/audit implementation` (5), `/retro` (7), and `Ready PR` (8). The gap
is that the pipeline never *requires* the artifact or surfaces it. So:

1. **Require `evidence.md` at the merge gate** and give it a stated shape: what
   the plan asked for, what was built, **where they diverged and why**, what
   remains unverified. Today it is a step in a prompt, not a gate condition.
2. **Wire `/teach` in before the merge gate.** It already does this job and is
   invoked nowhere.
3. **Promote the build narrative into the PR body** instead of discarding it at
   the sentinel.
4. **Give `execute.md` a PR body template** carrying plan → built → divergence →
   unverified.

The First Mate re-briefs delegates from the plan, and `/compact` is ANCHOR 2 —
so the briefing is exactly where the operator's understanding stops updating.
Requiring the reconciliation closes that loop rather than adding a new artifact.

### Move 5 — Delete the ceremony that emits nothing readable

1. Remove the four `STATUS: SPEC-*` tokens.
2. Drop the mandatory per-node log append, or narrow it to the shape the heartbeat
   cron actually reads.
3. Cut the groom tail from `/spec execute` — `/audit drift` already runs hourly.
4. Collapse `/eval` from 3 runs to 1: run once; Gate 2 and `/benchmark` read it.
5. Fix the silent `git add` inherited from `ship-spec/SKILL.md:294` — it stages a
   gitignored dir without `-f`; `.oh/tasks/README.md:22-24` contradicts
   `.gitignore:12`.

### Move 6 — Make memory's claims true

**This pass annotates; the next pass deletes.** `MEMORY.md` is gitignored and
untracked, so a deletion leaves no diff and no undo. Mark the condemned entries
in place with their verdict and evidence so they are readable before removal.

1. Strip every unbacked `probe:` field. Highest-value single change, and safe —
   it removes a false claim, not a lesson.
2. Annotate the 32 verified-dead entries and the 49 IDENTITY restatements with
   their verdict; delete them in a follow-up pass once you have read the marks.
3. Add two probes that enforce something real: every `probe:` id resolves to a
   file, and `MEMORY_DIR` is absolute or unset (currently the relative
   `.oh/memory`, shadowing the `oh-path` resolver #772 added).
4. Move `MEMORY.md:89`'s auto-close rule into `.oh/skills/git/SKILL.md` —
   #768 closed as fixed, but #772 moved the memory *path*, not the *content*.
5. Replace fixed-string dedup; add a tier size budget.

---

## Execution

Approving this plan **is** the commitment gate — there is no separate critique or
approve node, which is the point of Move 1. On approval:

1. Scaffold `.oh/tasks/spec-simplification/` from this plan (`/spec plan --plan`),
   producing the task contract `firstmate.sh` requires — it validates the slug and
   the four-file contract before it will launch.
2. `firstmate spec-simplification` claims the lock, renders the session prompt,
   and **creates the child session** through the herdr → tmux → foreground ladder.
   The launcher stays unblocked.
3. The child session runs the advisor/executor delegation workflow over the task
   graph — the six moves, ordered 1 → 6 — and lands a PR at the human merge gate.

**Bootstrapping hazard.** The child session edits the skills that define its own
behavior while running: Move 3 absorbs `/ship-spec` and deletes the advisor pack
its own prompt derives from. Two consequences to plan for — the session must be
launched from a rendered prompt captured *before* Move 3 executes, and Move 3
should land last among the pipeline moves within the run, or in a second session
against the already-changed tree. This is the strongest argument for open
decision 5's staged sequencing.

## Workspace

`pid 9602` is actively writing the semver run's tail — 17 uncommitted files
including `.oh/context/IDENTITY.md` and `.oh/evals/RESULTS.md`, both touched by
Move 5. Work in an isolated worktree under `.oh/worktrees/` off `development`;
rebase after PR #815 lands.

---

## Verification

The acceptance test for Move 4 is a person, not a probe: **someone who did not
watch the build reads the merge-gate output and can state what changed, why it
differs from the plan, and what is still unverified.**

- **Move 1**: `/spec plan` → `/spec execute` runs with no intervening node; no
  dangling `critique`/`approve` references in workflow docs or the spec probe.
- **Move 2**: build one small slug end-to-end on firstmate with ralph absent; the
  three rewritten probes fail against a deliberately broken copy before they pass.
- **Move 3**: `/spec execute` reads top-to-bottom with no reference to a deleted
  skill; a full build runs with `.oh/skills/ship-spec/` and `.oh/prompts/advisor/`
  absent; `/autopilot` completes a run on the repointed path; CB-001 and CB-002
  score against the new pipeline.
- **No-residue check (every removal)**: a repo-wide grep for the removed name
  returns nothing outside `CHANGELOG.md` — no orphaned reference an agent could
  discover and follow mid-task. Run it after each of Moves 1, 2, 3, 5.
- **Move 4**: confirm `evidence.md` is on the branch, the PR body carries
  plan→built→divergence, `/teach` ran. Cold-read it.
- **Move 5**: negative greps confirm removed tokens have no definitions left;
  probe executions drop 318 → 106 while the PR still reaches ready-for-review.
- **Move 6**: new probes must **fail** against today's MEMORY.md and pass after the
  strip — verify by rejection, not exit 0. Confirm `$MEMORY_DIR` and
  `bash .oh/scripts/oh-path memory` agree.
- **Suite**: `/eval` genuinely re-run (it is 7 days stale — `RESULTS.md` was
  touched today, not run), 0 REGRESSION.

---

## Risks I have not retired

- **Removing `/critique` deletes a capability on indirect evidence.** My case is
  that its output never reaches you and its prompt silently drifted across two
  copies — not a measurement of defects it caught versus missed.
- **`firstmate` has never been the default.** It is probe-pinned and bounded, but
  the 4h `FIRSTMATE_TIMEOUT_MS` replaces ralph's 50-iteration ceiling, and a
  wedged child session takes its whole delegate fan-out with it. Its `/delegate`
  runner policy is also **instruction only** — `session-prompt.md:223` states
  there is no mechanical enforcement, so the briefing has to carry it. Making it
  the sole executor makes both the ladder and that unenforced instruction
  load-bearing.
- **Move 3 is the one that can break the build outright.** Absorbing 18 stages
  means transcription errors land in the only remaining path, with v1 deleted and
  no fallback. It is also the move where "protected build literals" probes are
  most likely to be quietly relaxed to pass.
- **Removing every executor toggle removes the fallback.** With `ralph` and
  `delegate-advisor` both gone there is no second build path to switch to if the
  ladder or a child session misbehaves. Recovery is fix-forward only.

## Settled decisions

1. **`delegate-advisor` goes** with `ralph` — exactly one build path, no toggle.
2. **Move 3 absorbs and deletes in a single change.**
3. **The whole `.oh/prompts/advisor/` directory goes**, including `plan.yml`, the
   First Mate charter, and `first-mate-charter.sh`. Cleaner is better.
4. **Move 6 annotates this pass, deletes the next.**

## Order

`1 → 2 → 3 → 4 → 5`, then `6`. Move 3 must precede 4 and 5 because it rewrites
`execute.md`, which both then edit. Move 6 is independent of the pipeline and can
run at any point.

The bootstrapping hazard is handled by this order: the child session's prompt is
rendered at launch, before Move 3 deletes the advisor pack it derives from, and
the step order it needs is recorded verbatim in the template header — so the
session never has to re-read the deleted files.

Move 6's `probe:` strip (step 1) is safe to land early; its annotation pass
(step 2) should land last so the marks reflect what the rest of the run learned.

---

## Wiki Alignment

**Impact: REQUIRED**

The canonical workflow is a wiki-documented concept and this task changes its
shape: the node list, the executor set, and the primary implementation method all
change. Entries to revise under `.oh/skills/wiki/corpus/`:

- `build-executor-ladder` — currently describes three executors reaching one
  terminal interface. After US-002 there is one. The ladder itself (herdr → tmux →
  foreground) is unchanged and stays.
- Any entry describing `/ship-spec` as the all-in-one composer or the single
  source of build literals — after US-003 that role belongs to `/spec execute`.

**DeepWiki comparison**: not run at plan time. The reviser must run it before
claiming alignment, and must record the comparison in the entry.

New entry to consider: the plan-vs-built reconciliation contract introduced by
US-005 (`evidence.md` as a gate condition, and its required shape) has no wiki
entry today.

## Out of scope

- **Critique's redesign.** US-001 removes it from the path. Rethinking what
  adversarial review should look like is a separate ticket.
- **Notification and alerting.** No webhook, no paging. The fix is that runs
  finish and explain themselves, not that someone is told sooner.
- **Deleting the annotated memory entries.** US-007 annotates; a later pass
  deletes, once the marks have been read.
