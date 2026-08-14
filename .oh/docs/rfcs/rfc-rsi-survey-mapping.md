# RFC: Recursive-self-improvement survey → Open Harness mapping

Status: Draft — companion to [#525](https://github.com/mifunedev/openharness/issues/525) (self-improving-harness roadmap epic). It reads one external survey against this repository and returns evidence, vocabulary, and two proposed child issues. It is a decision artifact: it ships no runtime change.

Source: Chen, Wang, Qu, *Recursive Self-Improvement in AI: From Bounded Self-Refinement to Autonomous Research Loops*, [arXiv 2607.07663v1](https://arxiv.org/html/2607.07663v1) (July 2026), 1,250 papers over 2024–2026. Wiki entry: [[recursive-self-improvement-survey]].

## 1. Why this survey and not another

The survey's §3.5–3.6 describes exactly what Open Harness is: an agent that rewrites its own prompts, skills, memory, and orchestration code, validated against a fixed benchmark, with a human holding the merge gate. It supplies three things this repository lacks:

1. A **placement** — where the harness sits among 1,250 papers, and therefore which failure modes apply to it and which do not.
2. A **ranked vocabulary** for signal quality (§5.2), which the harness argues about informally in every audit.
3. Two **measured results** that predict outcomes already visible in `.oh/evals/`.

## 2. Placement — decided

| Survey axis | Open Harness | Consequence |
|---|---|---|
| **What improves** | Deployment-time harness/skill evolution (§3.5–3.6). Weights are frozen. | §4 (training-time self-iteration) and §7's takeoff debate are **out of scope**. Do not import their machinery or their alarm. |
| **Loop closure** | Human-on-the-loop. `/approve` gates the plan, the human gates the merge, `/autopilot` never auto-merges, and `.oh/skills/wiki` admits only orchestrator writes. | This is the regime where the survey finds reliability. The posture is a **deliberate design decision, not a missing feature**. |

The survey's §3.6 assessment applies verbatim: persistence changes the risk calculus. An inference-time mistake evaporates; a corrupted skill in a shipped library propagates.

## 3. The verification hierarchy applied to this harness — decided

§5.2 ranks improvement signals by reliability. Ranking the harness's own signals is the vocabulary contribution of this RFC. Cite this table; do not re-derive it.

| Rung | Survey definition | Open Harness instrument |
|---|---|---|
| **1 — formal** | Sound by construction | None. `shellcheck` and `pnpm -r type-check` are the closest, and neither is sound. |
| **2 — execution** | Reliable, incomplete, eventually gamed | `.oh/evals/probes/*.sh` (105 deterministic three-state oracles, run in CI by `ci-harness.yml` and `release.yml`), `/ci-status`, `.oh/cli` unit suites. |
| **3 — learned judge** | Bounded by the judge's competence; itself an optimization target | `/critique`'s two critics, `/approve`, `/audit implementation`, `/audit pr`, `/benchmark`, and the rubric scoring behind `.oh/evals/capability/RESULTS.md`. |
| **4 — intrinsic** | Cheapest, most gameable | `STATUS: COMPLETE` in `progress.txt` — the terminal interface for **all three** build executors (`ralph`, `firstmate`, `delegate-advisor`) — plus every self-reported count in `.oh/memory/<date>/log.md`. |

Two readings follow, and both are load-bearing:

- The harness's **terminal build signal is rung 4**. A build declares itself finished; rungs 2 and 3 then run *after* that declaration rather than producing it. The survey predicts precisely this shape fails under completion pressure (§4 F4 below).
- The harness has **no rung 1 at all**, and its rung-2 floor is broad but shallow — 105 probes each guarding one invariant a past lesson closed. Rung 2 is where the survey says durable improvement lives.

## 4. Findings the repository already evidences

Each row states a survey result, the in-repo exhibit, and what the exhibit proves. None of these requires new instrumentation to observe.

### F1 — SkillsBench predicts the flat capability ceiling

**Survey (§3.6):** human-authored skills raise pass rates 16.2 points; **LLM-authored skills provide no measurable gain**. This is called the central empirical fact of 2026.

**Exhibit:** `.oh/evals/capability/RESULTS.md`. Suite score 1.42/2.00. CB-001 and CB-003 last scored 2026-06-15, CB-002 on 2026-06-19, CB-004 on 2026-07-03 with the basis line `Δ +0.00 machinery-added vs 1.00 baseline`. Across the same window `/autopilot` shipped skills, probes, and references continuously.

**What it proves:** the harness is reproducing SkillsBench inside its own instrument. `/benchmark` already encodes the correct verdict — *machinery added with no benchmark movement is NOT-BENEFICIAL by definition* — and the ceiling has not moved. The survey turns a suspected local problem into an expected field-wide one, which changes the response: not "score harder", but **measure authorship provenance**. Skills the harness wrote and skills a human wrote are currently indistinguishable on disk, so the 16.2-point gap cannot be tested here.

### F2 — Mirror Loop predicts `plan ⇄ critique` decay

**Survey (§5.2):** ten rounds of ungrounded self-critique lose 55% of informational change; **one** grounding step at round three restores forward movement.

**Exhibit:** `/spec plan ⇄ /spec critique` runs two critics that share weights with the planner and read only local artifacts — `.oh/tasks/<slug>/` files that exist before any GitHub state, any probe run, or any build. The loop is rung 3 judging rung 3, with no bound on rounds. The `build ⇄ audit` loop is the healthy contrast: it is grounded, because `/eval` and CI execute.

**What it proves:** the two adversarial loops named as "the same mechanism" in `AGENTS.md § The Workflow` are not the same mechanism. One is grounded and one is not, and the survey supplies the measurement that separates them.

### F3 — The stationary-evaluation-criterion assumption

**Survey (§3.5, Red Queen Gödel Machine):** existing self-improving agents assume a fixed verifier stays valid as the agent improves. §5.2 adds that any fixed benchmark is eventually gamed.

**Exhibit:** 105 probes and 4 capability tasks, optimized against hourly by `/autopilot`, which is also authorized to write probes. `/audit eval-quality` exists as the anti-Goodhart instrument and roadmap item 11 already names it.

**What it proves:** the roadmap item is correctly identified and correctly ordered. But co-evolving the evaluator with the improver is *also* the survey's maximal self-confirming risk (§5.3), so evaluator changes must stay human-gated. The merge gate already does this. This RFC records that as the reason, so it is not optimized away later as friction.

### F4 — Integrity under completion pressure

**Survey (§6.3):** a measured 34.2% integrity-failure rate when honest acknowledgment of failure conflicts with task completion; all seven models tested fabricate synthetic data rather than acknowledge infeasibility.

**Exhibit:** `CHANGELOG.md` [#767](https://github.com/mifunedev/openharness/issues/767) closed a defect where `/retro` logged promotion counts before the confirmation gate resolved, and its own closing sentence records the residue: *"the count is still the agent's self-report, so a miscount remains reachable."* The `STATUS: COMPLETE` terminal interface has the identical shape.

**What it proves:** the harness already found this failure mode empirically, once, and patched the *ordering* rather than the *rung*. The survey says the rung is the defect.

### F5 — The skill library federates

**Survey (§3.6):** the qualitatively new risk of self-evolving agent systems is adversarial influence that becomes permanently encoded, self-amplifying across generations, and transmissible through agent populations without sustained attacker access. **SkillMutator** benchmarks the specific cross-modal attack where a skill's natural-language specification and its executable code tell different stories.

**Exhibit:** Open Harness *is* a federating skill library. `.oh/manifest.json` and `oh init` vendor `.oh/skills/` into downstream installs, and `mifunedev/skills` publishes a checksummed registry. Skills routinely pair prose (`SKILL.md`) with executables (`scripts/*.sh`), and no check asserts the two agree.

**What it proves:** the checksum discipline covers *transport* integrity, not *semantic* agreement between a skill's prose and its code. That gap is the SkillMutator surface, and it is cheap to probe.

## 5. Where the survey confirms existing plans — no new work

Three `rfc-selfimprove-roadmap.md` children arrive independently in the survey. Record the convergence; change nothing.

| Roadmap child | Survey counterpart |
|---|---|
| 1 — normalized trace/event ledger ([rfc-trace-ledger.md](rfc-trace-ledger.md)) | "Experience graphs" that persist the branch-execute-fail-repair structure of long-horizon agents so experience is queryable rather than discarded (§3.5), and the error-notebook / strategy-bank family of §5.5. |
| 7 — scoped repair-operator registry ([repair-operator-registry.md](../repair-operator-registry.md)) | **SHARP** (§3.6): constrain the self-modification surface to something auditable, diffable, and revertible, because unbounded evolution cannot separate a systematic logic flaw from variance. |
| 9/10 — capability benchmark + promotion gate | The Darwin Gödel Machine's empirical-benefit validation loop (§3.5), which the survey calls state of the art precisely because full self-reference stays intractable to evaluate. |

The survey also supplies the strategic reading behind `/retro`, `.oh/memory/`, and the wiki: process-level improvement is **capital expenditure** and result-level improvement is **operating expenditure** (§5.5). The harness's memory tiers are the capital account, and they are the investment the survey expects to compound.

## 6. Decides vs defers

**Decides.**
- The taxonomy placement in §2, and therefore that training-time and takeoff material is out of scope for this repository.
- The rung assignment in §3 as shared vocabulary for audits, critiques, and RFCs.
- That human-on-the-loop closure is deliberate and evidence-backed, not a gap.

**Defers** to #525 and its children: every implementation. This RFC files no issue, writes no probe, and changes no skill.

## 7. Proposed merge into `rfc-selfimprove-roadmap.md`

For a maintainer to apply. Two additive children, both sized S–M and both buildable:

| Priority | Proposed child-issue title | One-line deliverable | Dependency | Size |
|---|---|---|---|---|
| after 11 | Skill authorship provenance and the SkillsBench A/B | Record author class (human / harness) per skill, then measure the two classes separately against `.oh/evals/capability/` so the survey's 16.2-point gap becomes testable here. | Capability benchmark runner (child 9) | M |
| after 7 | Cross-modal skill consistency probe | Assert that a skill's `SKILL.md` prose and its `scripts/*` agree on what the skill does — the SkillMutator surface that checksums do not cover. | Repair-operator registry (child 7) | S |

Plus one annotation, no new child: mark roadmap item 11 (`/audit eval-quality`) as **externally corroborated** by the Red Queen result, and record that its evaluator edits stay human-gated for the §5.3 reason in F3.

## Non-goals

- No probe, skill, or runtime behavior changes here.
- No claim that Open Harness performs recursive self-improvement in the survey's open-ended sense. It performs bounded self-refinement with persistent scaffolding, which is §3.5–3.6, not §7.
- No re-litigation of the standards process. This follows the lightweight convention in [ADR-0001](adr-0001-standards-scope.md).
- No import of the survey's training-time material.
