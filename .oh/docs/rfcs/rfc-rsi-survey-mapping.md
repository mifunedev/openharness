# RFC: Recursive-self-improvement survey → Open Harness mapping

Status: Draft — companion to [#525](https://github.com/mifunedev/openharness/issues/525) (self-improving-harness roadmap epic). This RFC reads one external survey against this repository. This RFC returns evidence, vocabulary, and two proposed child issues. This RFC is a decision artifact: it ships no runtime change.

Source: Chen, Wang, Qu, *Recursive Self-Improvement in AI: From Bounded Self-Refinement to Autonomous Research Loops*, [arXiv 2607.07663v1](https://arxiv.org/html/2607.07663v1) (July 2026), 1,250 papers over 2024–2026. Wiki entry: [[recursive-self-improvement-survey]].

## 1. Why this survey and not another

The survey's §3.5–3.6 describes what Open Harness is. That section describes an agent that rewrites its own prompts, skills, memory, and orchestration code. That agent validates each change against a fixed benchmark, and a human holds the merge gate. The survey supplies three items this repository lacks:

1. A **placement** — where the harness sits among 1,250 papers, and therefore which failure modes apply to the harness and which do not.
2. A **ranked vocabulary** for signal quality (§5.2). Every audit in this repository argues the same ranking informally.
3. Two **measured results** that predict outcomes already visible in `.oh/evals/`.

## 2. Placement — decided

| Survey axis | Open Harness | Consequence |
|---|---|---|
| **What improves** | Deployment-time harness and skill evolution (§3.5–3.6). The weights stay frozen. | §4 (training-time self-iteration) and §7's takeoff debate stay **out of scope**. Do not import their machinery. Do not import their alarm. |
| **Loop closure** | Human-on-the-loop. The operator's approval of `prd.md` gates the plan. The human gates the merge. `/autopilot` never auto-merges. `.oh/skills/wiki` admits only orchestrator writes. | The survey finds reliability in this regime. This posture is a **deliberate design decision, not a missing feature**. |

The survey's §3.6 assessment applies verbatim: persistence changes which faults survive. An inference-time mistake evaporates. A corrupted skill in a shipped library propagates.

## 3. The verification hierarchy applied to this harness — decided

§5.2 ranks improvement signals by reliability. This RFC ranks the harness's own signals against that hierarchy. The ranking is this RFC's vocabulary contribution. Cite this table; do not re-derive the table.

| Rung | Survey definition | Open Harness instrument |
|---|---|---|
| **1 — formal** | Sound by construction | None. `shellcheck` and `pnpm -r type-check` are the closest, and neither one is sound. |
| **2 — execution** | Reliable, incomplete, eventually gamed | `.oh/evals/probes/*.sh` (105 deterministic three-state oracles, run in CI by `ci-harness.yml` and `release.yml`), `/ci-status`, `.oh/cli` unit suites. |
| **3 — learned judge** | Bounded by the judge's competence; itself an optimization target | `/audit implementation`, `/audit pr`, `/benchmark`, and the rubric scoring behind `.oh/evals/capability/RESULTS.md`. |
| **4 — intrinsic** | Cheapest, most gameable | `STATUS: COMPLETE` in `progress.txt` — the terminal interface for **all three** build executors (`ralph`, `firstmate`, `delegate-advisor`) — plus every self-reported count in `.oh/memory/<date>/log.md`. |

Two readings follow the table. Each reading changes what a reviewer trusts.

- The harness's **terminal build signal sits at rung 4**. A build declares itself finished. Rungs 2 and 3 then run *after* that declaration rather than producing the declaration. The survey predicts that this shape fails under completion pressure (§4, finding F4).
- The harness holds **no rung-1 instrument at all**. Its rung-2 floor is broad and shallow: 105 probes, each one guarding a single invariant that a past lesson closed. The survey places durable improvement at rung 2.

## 4. Findings the repository already evidences

Each finding states a survey result, the in-repo exhibit, and what the exhibit proves. No finding requires new instrumentation.

### F1 — SkillsBench predicts the flat capability ceiling

**Survey (§3.6):** human-authored skills raise pass rates 16.2 points. **Model-authored skills provide no measurable gain.** The survey calls this result the central empirical fact of 2026.

**Exhibit:** `.oh/evals/capability/RESULTS.md`. The suite scores 1.42/2.00. CB-001 and CB-003 last scored on 2026-06-15, CB-002 on 2026-06-19, and CB-004 on 2026-07-03 with the basis line `Δ +0.00 machinery-added vs 1.00 baseline`. Across that same window, `/autopilot` shipped skills, probes, and references continuously.

**What the exhibit proves:** the harness reproduces SkillsBench inside its own instrument. `/benchmark` already encodes the correct verdict — *machinery added with no benchmark movement is NOT-BENEFICIAL by definition* — and the ceiling has not moved. The survey turns a suspected local problem into an expected field-wide one. That reframing changes the response. The response is not to score harder. The response is to **measure authorship provenance**. Nothing on disk separates a harness-authored skill from a human-authored skill, so no one can test the 16.2-point gap here.

### F2 — Mirror Loop predicted `plan ⇄ critique` decay (retired)

**Survey (§5.2):** ten rounds of ungrounded self-critique lose 55% of informational change. **One** grounding step at round three restores forward movement.

**Exhibit (historical):** `/spec plan ⇄ /spec critique` ran two critics that shared weights with the planner. Those critics read only local artifacts: the `.oh/tasks/<slug>/` files that exist before any GitHub state, any probe run, and any build. The loop placed rung 3 in judgement over rung 3, and no rule bounded the round count. **That loop was removed** (`AGENTS.md § The Workflow`): the operator's approval of `prd.md` is now the commitment gate. In the `build ⇄ audit` loop, `/eval` and CI execute and return a rung-2 signal. That loop is the surviving healthy contrast.

**What the exhibit proves:** `AGENTS.md § The Workflow` calls the two adversarial loops the same mechanism. The two loops are not the same mechanism. One loop reads a grounded signal and one loop does not, and the survey supplies the measurement that separates them.

### F3 — The stationary-evaluation-criterion assumption

**Survey (§3.5, Red Queen Gödel Machine):** current self-improving agents assume that a fixed verifier stays valid as the agent improves. §5.2 adds that a fixed benchmark is eventually gamed.

**Exhibit:** 105 probes and 4 capability tasks, optimized against hourly by `/autopilot`, whose `OWNED_PATHS` array includes `.oh/evals/` and therefore authorizes it to write probes. `/audit eval-quality` exists as the anti-Goodhart instrument, and roadmap item 11 already names that instrument.

**What the exhibit proves:** the roadmap identifies item 11 correctly and orders it correctly. Co-evolving the evaluator with the improver is *also* the survey's maximal self-confirming risk (§5.3), so evaluator changes must stay human-gated. The merge gate already holds that line. This RFC records the reason, so that no later cycle removes the gate as friction.

### F4 — Integrity under completion pressure

**Survey (§6.3):** a measured 34.2% integrity-failure rate arises when honest acknowledgment of failure conflicts with task completion. All seven tested models fabricate synthetic data rather than acknowledge infeasibility.

**Exhibit:** [#767](https://github.com/mifunedev/openharness/issues/767) closed a defect in `/retro`. `/retro` logged its promotion counts before the confirmation gate resolved. The #767 `CHANGELOG.md` entry records the residue: *"the count is still the agent's self-report, so a miscount remains reachable."* The `STATUS: COMPLETE` terminal interface carries the identical shape.

**What the exhibit proves:** the harness already found this failure mode empirically, once. The repair patched the *ordering* rather than the *rung*. The survey names the rung as the defect.

### F5 — The skill library federates

**Survey (§3.6):** self-evolving agent systems carry one qualitatively new risk. Adversarial influence becomes permanently encoded, amplifies itself across generations, and transmits through agent populations without sustained attacker access. **SkillMutator** benchmarks the cross-modal attack for that risk, where a skill's natural-language specification and its executable code tell different stories.

**Exhibit:** Open Harness *is* a federating skill library. `.oh/manifest.json` and `oh init` vendor `.oh/skills/` into downstream installs, and `mifunedev/skills` publishes a checksummed registry. Skills routinely pair prose (`SKILL.md`) with executables (`scripts/*.sh`). No check asserts that the two agree.

**What the exhibit proves:** the checksum discipline covers *transport* integrity. The checksum discipline does not cover *semantic* agreement between a skill's prose and its code. That gap is the SkillMutator surface, and one probe closes it.

## 5. Where the survey confirms existing plans — no new work

Three `rfc-selfimprove-roadmap.md` children arrive independently in the survey. Record the convergence. Change nothing.

| Roadmap child | Survey counterpart |
|---|---|
| 1 — normalized trace/event ledger ([rfc-trace-ledger.md](rfc-trace-ledger.md)) | "Experience graphs" that persist the branch-execute-fail-repair structure of long-horizon agents, so that a later query reaches the experience instead of discarding it (§3.5). The error-notebook and strategy-bank family of §5.5 carries the same shape. |
| 7 — scoped repair-operator registry ([repair-operator-registry.md](../repair-operator-registry.md)) | **SHARP** (§3.6): constrain the self-modification surface to an artifact a reviewer can audit, diff, and revert. Unbounded evolution cannot separate a systematic logic flaw from variance. |
| 9/10 — capability benchmark + promotion gate | The Darwin Gödel Machine's empirical-benefit validation loop (§3.5). The survey calls that loop state of the art, because full self-reference stays intractable to evaluate. |

The survey also supplies the strategic reading behind `/retro`, `.oh/memory/`, and the wiki. Process-level improvement is **capital expenditure**. Result-level improvement is **operating expenditure** (§5.5). The harness's memory tiers hold the capital account, and the survey expects that account to compound.

## 6. Decides vs defers

**Decides.**
- The taxonomy placement in §2, and therefore that training-time material and takeoff material stay out of scope for this repository.
- The rung assignment in §3, as shared vocabulary for audits, critiques, and RFCs.
- That human-on-the-loop closure is deliberate and evidence-backed, not a gap.

**Defers** to #525 and its children: every implementation. This RFC files no issue, writes no probe, and changes no skill.

## 7. Proposed merge into `rfc-selfimprove-roadmap.md`

A maintainer applies this section. This section proposes two additive children. Each child fits size S–M, and a maintainer can build each one as a single deliverable.

| Priority | Proposed child-issue title | One-line deliverable | Dependency | Size |
|---|---|---|---|---|
| after 11 | Skill authorship provenance and the SkillsBench A/B | Record an author class (human or harness) per skill. Measure the two classes separately against `.oh/evals/capability/`, so that a run can test the survey's 16.2-point gap here. | Capability benchmark runner (child 9) | M |
| after 7 | Cross-modal skill consistency probe | Assert that a skill's `SKILL.md` prose and its `scripts/*` agree on what the skill does — the SkillMutator surface that checksums do not cover. | Repair-operator registry (child 7) | S |

The section also proposes one annotation and no third child. Mark roadmap item 11 (`/audit eval-quality`) as **externally corroborated** by the Red Queen result. Record that its evaluator edits stay human-gated, for the §5.3 reason that finding F3 states.

## Non-goals

- This RFC changes no probe, no skill, and no runtime behavior.
- This RFC does not claim that Open Harness performs recursive self-improvement in the survey's open-ended sense. Open Harness performs bounded self-refinement with persistent scaffolding, which the survey covers in §3.5–3.6 and not in §7.
- This RFC does not re-litigate the standards process. It follows the lightweight convention in [ADR-0001](adr-0001-standards-scope.md).
- This RFC imports none of the survey's training-time material.
