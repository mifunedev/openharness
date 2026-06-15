# The Loop — Executable Decision-Tree of Skills

The harness self-improves by walking a **decision-tree of skills**: each node runs a skill (or a tool
the Advisor wields), emits a terminal `STATUS:` token, and hands off to the next node based on that
token. This file is the **single source of truth** for that tree — the objective it serves, the nodes,
the routing tokens, the handoff convention, and the invariants every handoff must preserve.

`AGENTS.md` "The Loop" is the human-facing summary; **this file is the executable spec** the `/autopilot`
runner walks. Where they disagree, the truth-up of `AGENTS.md` is a separate, eval-gated change — this
file leads.

> **Build state is incremental.** A node's row below is its *contract*. Until § 7 marks a node wired,
> the contract is not yet the behavior. Do not read this file as a description of what runs today —
> read § 7 for that. (The previous 8-phase ring drew edges that did not exist; this file refuses to.)

---

## 1. Objective anchor — capability as OUTCOMES, not machinery

The loop's primary objective is **harness capability**, defined as *what the harness can DO, not what
it HAS*. Adding machinery is not progress; moving the capability benchmark is. The harness's own probe
suite already leans inward (a majority guard its own internals) — this anchor is the counterweight.

| Lever | Rule |
|-------|------|
| **Capability benchmark** | A small, stable, held-out set of *representative end-to-end harness tasks*, scored on **success rate · cost/time-to-ship · unattended reliability**. It is the progress **ceiling** ("got better"); `evals/probes/*.sh` is the regression **floor** ("don't break"). Distinct instruments. |
| **Selection** | `ideate`/`brainstorm` rank candidate work by *projected capability-benchmark impact*, not recency ("oldest ticket"). |
| **benchmark** | "benefit vs. counterfactual" anchors to the **capability-benchmark delta**. Machinery added with no benchmark movement is `NOT-BENEFICIAL` by definition. |
| **Redirect signal** | If the benchmark does not move over N cycles while machinery grows, the loop flags itself for human redirect. This is the one external vote allowed to say "you are building the wrong thing." |

---

## 2. The decision tree

```
ideate → brainstorm → plan → critique → approve
  approve → implement → audit → retro → compound → compress → benchmark → repeat → ideate
  deny ─────────────────────↩ plan (revise)
  audit FAIL ───────────────↩ implement (resume)
  benchmark NOT-BENEFICIAL ↩ revert (change not worth it)
```

| Node | Driver | `STATUS` → next |
|------|--------|-----------------|
| **ideate** | `Explore` fan-out + `/imagine` → spec sketch | `IDEA-READY` → brainstorm |
| **brainstorm** | `Explore` + `/strategic-proposal` → ranked candidate | `CANDIDATE-PICKED` → plan |
| **plan** | `/prd` → `/ralph` → `prd.json` | `PLAN-READY` → critique |
| **critique** (`/critique`) | 2× `critic` agents (parallel, implementer + user lens) → `critique.md` | `CRITIQUE-DONE` → approve |
| **approve** (`/approve`) | critic SEVERITY gate (auto) + optional human, runs before any GitHub-side state | `APPROVED` → implement · `DENIED` → plan |
| **implement** | **Advisor** orchestrates `/delegate` (decompose `prd.json` → weighted task graph + dependency-wave fan-out, `Task*` tracking) ∥ `ralph` serial (worktree, `STATUS: COMPLETE` + liveness) | `IMPL-COMPLETE` → audit · `IMPL-INCOMPLETE` → resume |
| **audit** (`/audit`) | verdict-owner: task-graph conformance (`prd.json` items vs. impl) + `/eval` green→red gate + `/ci-status` (CI poll) + `/pr-audit` (PR-state) + `/agent-browser` | `AUDIT-PASS` → retro · `AUDIT-FAIL` → implement |
| **retro** | `/retro` | `RETRO-DONE` → compound |
| **compound** | `/wiki-ingest` + `MEMORY.md` + mint probes from this cycle's lessons | `COMPOUND-DONE` → compress |
| **compress** | distill for **clarity** (not just fewer tokens): `/context-audit` + `/compact` + `/caveman` | `COMPRESS-DONE` → benchmark |
| **benchmark** | capability-benchmark delta vs. counterfactual (driven by `/eval` machinery; probe suite = regression floor) + groom the instrument (`/eval-lint`) | `BENEFICIAL` → repeat · `NOT-BENEFICIAL` → revert |
| **repeat** | freshness gate (caps + queue re-entry) | → ideate |

Branch targets are part of the contract: `DENIED` → `plan`, `AUDIT-FAIL`/`IMPL-INCOMPLETE` → `implement`,
`NOT-BENEFICIAL` → revert-then-`repeat`. Every emitted token MUST have a target here; a node that can
emit a token absent from its row is a bug the `/autopilot` runner rejects.

---

## 3. Terminal-status convention

Every node's skill prints, as the **final line of its output**, exactly one line:

```
STATUS: <TOKEN>
```

The token is the **only** routing signal the `/autopilot` runner reads. It extends the sentinels already in
use — `scripts/ralph.sh`'s `STATUS: COMPLETE` and autopilot's exit tokens (`PR-READY`,
`HALT-CRITIC-GATE`, …). Rules:

- Tokens are `SCREAMING-KEBAB-CASE`, drawn from the node's row in § 2.
- Exactly one `STATUS:` line per run, and it is the last line — the runner reads the tail, not the body.
- The token is the *honest exit* (invariant 5): a node that crashed or stalled emits no token and the
  runner treats silence as failure, never as success.

---

## 4. The `## Handoff` convention

Every skill that is a loop node carries a `## Handoff` section near the end of its `SKILL.md`:

```markdown
## Handoff

Emit `STATUS: <TOKEN>` as the final line of output. Routes (must match `context/rules/loop.md` § 2):

| STATUS | Next node |
|--------|-----------|
| `<TOKEN-A>` | `<node>` |
| `<TOKEN-B>` | `<node>` |
```

A skill **declares** its successor; it does **not** call it — the `/autopilot` runner routes. This is the
core model: **distributed declaration, centralized execution** (§ 6). The declared routes MUST match
§ 2 exactly; a tier-A consistency probe (`evals/probes/loop-handoff-consistency.sh`) and `/eval-lint` guard
the match so a renamed token or a route that points off the tree is caught before it runs.

---

## 5. Invariants — what every handoff must preserve

The six load-bearing components distilled from the autopilot system. They share one move: **convert an
absence or staleness into an explicit assertion.** Every node and handoff must preserve them.

| # | Invariant | Asserts | Anchor |
|---|-----------|---------|--------|
| 1 | **Done-sentinel** — `STATUS: COMPLETE` whole-line grep + dual-channel self-heal + self-kill | "done" (not looping/ambiguous) | `scripts/ralph.sh` |
| 2 | **Ownership isolation** — `OWNED_PATHS` *array*-scoped check/restore + worktree-by-default | "mine vs. foreign" | `.claude/skills/autopilot/SKILL.md` |
| 3 | **Single-owner handoff** — one component owns the build; the parent only reconciles its terminal status | "outcome already decided downstream" | autopilot ↔ ship-spec |
| 4 | **Freshness gate** — FF-only base sync + caps + dedupe-before-select | "base is fresh, not already in flight" | `.claude/skills/autopilot/SKILL.md` |
| 5 | **Honest exits** — a `STATUS:` token on every exit path; never infer green from silence; gate on green→red *delta + exit code* | "I reached state X (not crashed/silent)" | autopilot · `evals/probes/eval-gate.sh` |
| 6 | **Critic-before-commitment** — HALT the spec before any GitHub-side state exists | "unsafe spec — fail cheap" | `.claude/skills/ship-spec/SKILL.md` |

---

## 6. Execution model — distributed declaration, Advisor-centralized execution

- **Declaration is distributed.** Each skill owns its `## Handoff` routes and its `STATUS:` emission.
  Skills are independently refinable; no skill hard-codes a call to its successor.
- **Execution is Advisor-centralized.** A single **Advisor** owns each run. `/delegate` (parallel
  fan-out), `scripts/ralph.sh` (serial story loop), `Explore` (read-only search), and the `Task*` tools
  (tracking) are **tools the Advisor reaches for** — not rival orchestrators competing for control.
- **The runner routes, it does not decide.** `/autopilot` reads the current node's `STATUS:` and moves to the
  target in § 2. All judgment lives in the nodes; the runner is mechanical. (Resolves the
  centralized-vs-distributed tension: decisions are distributed into the skills, control flow is central.)

See `context/rules/advisor-model.md` (the 5-field briefing the Advisor hands an executor) and
`context/rules/recursive-delegation.md` (multi-level fan-out bounds).

---

## 7. Build state

Honest status of each node — contract vs. wired. Updated as layers land (see the build plan).

| Node | Skill exists | `## Handoff` wired | Notes |
|------|:---:|:---:|-------|
| ideate | partial (`/imagine`) | ☑ | `STATUS: IDEA-READY` → brainstorm (`Explore` front end: Layer 2) |
| brainstorm | yes (`/strategic-proposal`) | ☑ | `STATUS: CANDIDATE-PICKED` → plan (`Explore` front end: Layer 2) |
| plan | yes (`/prd`,`/ralph`) | ☑ | `/ralph` (terminal step) emits `STATUS: PLAN-READY` → critique |
| critique | yes (`/critique`) | ☑ | `STATUS: CRITIQUE-DONE` → approve; 2× `critic` agents (implementer + user lens) → `critique.md` |
| approve | yes (`/approve`) | ☑ | `STATUS: APPROVED` → implement · `DENIED` → plan; reads `critique.md`, gates before any GitHub-side state (invariant 6) |
| implement | yes (Advisor+`/delegate`+`ralph`) | ☑ | `/delegate` (the implement driver) carries the `## Handoff`: `IMPL-COMPLETE` → audit · `IMPL-INCOMPLETE` → implement, from its Delegation Report + `prd.json` conformance; `ralph` serial path = `STATUS: COMPLETE` sentinel |
| audit | yes (`/audit`) | ☑ | `STATUS: AUDIT-PASS` → retro · `AUDIT-FAIL` → implement; composes `/pr-audit`,`/ci-status`,`/eval`,`/agent-browser` + prd.json conformance |
| retro | yes (`/retro`) | ☑ | `STATUS: RETRO-DONE` → compound |
| compound | yes (`/wiki-ingest`) | ☑ | `STATUS: COMPOUND-DONE` → compress (probe-minting: Layer 2) |
| compress | yes (`/context-audit`…) | ☐ | clarity metric (new) |
| benchmark | `/eval` machinery | ☐ | + capability benchmark + `/eval-lint` (new); tokens depend on Layer 2 |
| repeat | yes (autopilot caps) | ☐ | |
| **runner** | `/autopilot` (evolve — gated) | ☐ | walks this tree; today walks phases 1–4 only (select → `/ship-spec` → reconcile) |

---

## See Also

- `AGENTS.md` — human-facing "The Loop" summary (truth-up to point here is a separate, eval-gated change).
- `context/rules/advisor-model.md` · `context/rules/recursive-delegation.md` — the execution primitives.
- `scripts/ralph.sh` — the done-sentinel + serial story loop (invariant 1).
- `evals/` — the probe suite (regression floor) and the future capability benchmark (progress ceiling).
