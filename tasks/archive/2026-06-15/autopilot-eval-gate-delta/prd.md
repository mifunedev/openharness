# PRD: Harden Autopilot Eval-Gate (regression delta + exit code)

## Introduction

The autopilot loop's §6 "Eval gate" is the last correctness check before a PR is promoted to ready-for-review (`gh pr ready`). Today that gate says **"Any `REGRESSION` → leave the PR draft"** — it blocks on the bare presence of a `REGRESSION` row in `evals/RESULTS.md`. `MEMORY.md` (2026-06-11, tagged `eval-gate · triage:proceduralize`) established this rule is wrong: it must key on the eval runner's **exit code** and the green→red **delta**, not on any red row.

The failure mode is concrete: the `next-dev-prod` probe is a *runtime-state* oracle that flips red whenever a live `next dev` process runs on the host — wholly unrelated to a harness-infra doc edit. Under the current rule, that pre-existing red would permanently jam the autopilot loop, holding every PR in draft even though recent runs (#14/#17/#18) demonstrably should have proceeded. This PRD proceduralizes the corrected decision rule into the skill and pins it with a deterministic probe, converting a fragile memory-dependent judgment into an enforced invariant.

## Goals

- Rewrite the autopilot §6 eval-gate so it distinguishes a **pre-existing** red probe (proceed) from a **new green→red regression** (keep draft).
- Make the gate key on three explicit PROCEED conditions: runner exit 0, regressed-probe delta `unchanged` vs base, and PR file-scope disjoint from the probe's reads.
- Keep the change honest: any pre-existing red is posted on the PR rather than hidden behind an all-green claim.
- Add the `eval-gate` probe — one of four `triage:proceduralize` probes named in `MEMORY.md` but never created — so the corrected rule cannot silently regress.

## User Stories

### US-001: Rewrite §6 eval-gate decision rule

**Description:** As the autopilot loop, I want my eval gate to proceed on a pre-existing red probe so that an unrelated host-state regression does not permanently block every PR from reaching ready.

> **Critic-driven revision (2026-06-11):** the original draft made "the PR touches no file the probe reads" a third hard PROCEED condition. Two SEVERITY: H critic findings showed this is (a) unverifiable — no "read-set" is defined or emitted by the runner — and (b) self-defeating: a PR that edits `autopilot/SKILL.md` itself (like this one) touches the file the new `eval-gate` probe reads, which would wrongly keep it draft. Resolution: **the green→red delta is the authoritative causation signal** — an `unchanged` delta means the red predates this PR regardless of file overlap — so file-scope is demoted from a gate condition to a *diagnostic note*. This keeps the 2026-06-11 lesson's intent (don't dismiss a red the PR actually caused) while fixing the mechanism.

**Acceptance Criteria:**

- [ ] In `.claude/skills/autopilot/SKILL.md` §6, the gate **PROCEEDS** (to §7) when BOTH of: (a) the `/eval` runner exits `0`, AND (b) every regressed probe's delta is `unchanged` vs the base (already-red on `origin/development` — not a NEW green→red transition).
- [ ] The gate keeps the PR **draft** (status `PR-DRAFT-EVAL-RED`) only on a **NEW (green→red) regression OR a non-zero runner exit**.
- [ ] §6 states, as a non-gating diagnostic note, that if a regressed probe reads a file this PR changed the runner-exit + delta signal still governs (a self-referential probe such as `eval-gate` on an autopilot edit does NOT block).
- [ ] The rule requires posting any pre-existing red as a PR comment for honesty (do not claim an all-green board).
- [ ] The phrase "Any `REGRESSION`" no longer appears as the gate condition in §6.
- [ ] The two PROCEED conditions are stated explicitly as a bulleted/numbered decision list (not buried in prose) so a future agent cannot elide one.

### US-002: Align the PR-DRAFT-EVAL-RED status-token description

**Description:** As a reviewer reading the autopilot reference table, I want the `PR-DRAFT-EVAL-RED` token description to match the new gate semantics so the doc is internally consistent.

**Acceptance Criteria:**

- [ ] The `PR-DRAFT-EVAL-RED` row in the §Reference status-token table reads that the PR was left draft because `/eval` reported a **NEW (green→red) probe regression or a non-zero runner exit**.
- [ ] No other status-token rows are changed.

### US-003: Add the eval-gate probe

**Description:** As the eval suite, I want a probe that asserts the autopilot §6 rule is the corrected one so the lesson cannot silently regress.

**Acceptance Criteria:**

- [ ] `evals/probes/eval-gate.sh` exists and is executable (`chmod +x`).
- [ ] It follows the existing probe pattern (`evals/probes/devtcp-hook.sh`): header comments `# tier: A`, `# source: memory/MEMORY.md 2026-06-11 (eval-gate)`, `# desc:`; root resolution `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"`; `set -euo pipefail`.
- [ ] It is a 3-state oracle: exit `0` = PASS, exit `1` = REGRESSION, exit `2` = SKIPPED.
- [ ] It SKIPs (exit 2) if `.claude/skills/autopilot/SKILL.md` is absent.
- [ ] It uses **positive assertions** (AND-logic), not a brittle absence check: PASS (exit 0) requires the §6 region to contain BOTH the corrected-vocabulary tokens (e.g. the literal `delta` and `unchanged`, and a NEW-green→red phrasing) AND to NOT contain the bare "Any `REGRESSION`" gate phrasing. REGRESSION (exit 1) if either assertion fails.
- [ ] `bash evals/probes/eval-gate.sh` exits 0 with `PASS` against the corrected skill. The reverted-text check (old §6 → exit 1) is verified **inside a throwaway git worktree** (`git worktree add`), never by editing the live main-checkout skill file (MEMORY.md 2026-05-19 / 2026-05-29: stale-view edits on tracked files compose badly).

### US-004: Refresh the eval benchmark

**Description:** As the autopilot run, I want the eval benchmark refreshed so the new probe is recorded green with no new regressions.

**Acceptance Criteria:**

- [ ] `/eval` runs; `evals/RESULTS.md` contains an `eval-gate` row with status PASS.
- [ ] The runner exits `0`; no previously-**PASS** probe changes to REGRESSION/TIMEOUT/ERROR (a probe going PASS→SKIPPED for an absent-environment dependency is permitted and not a regression).
- [ ] Because `eval-gate` has no prior row on its first run, its green status is ALSO confirmed by a direct `bash evals/probes/eval-gate.sh` → exit 0 (the `/eval` delta alone is vacuous for a brand-new probe).
- [ ] The refreshed `evals/RESULTS.md` is committed on the work branch via the single §6 `/eval` invocation — no separate second `/eval` run or duplicate benchmark commit.

## Functional Requirements

- FR-1: The autopilot §6 gate MUST proceed when runner-exit=0 AND every regressed probe's delta is `unchanged` vs base (no NEW green→red transition). File-scope overlap is a non-gating diagnostic note only — the delta is the authoritative causation signal.
- FR-2: The autopilot §6 gate MUST hold the PR draft (`PR-DRAFT-EVAL-RED`) on any NEW green→red regression OR a non-zero `/eval` runner exit.
- FR-3: The §6 text MUST instruct posting pre-existing reds on the PR (honesty), and MUST NOT use "Any `REGRESSION`" as the gate condition; the two PROCEED conditions MUST appear as an explicit decision list.
- FR-4: The §Reference `PR-DRAFT-EVAL-RED` row MUST match FR-2 semantics; the status-token table MUST retain its existing row count (no other rows added, removed, or reworded).
- FR-5: `evals/probes/eval-gate.sh` MUST be an executable Tier-A 3-state oracle that PASSes via positive AND-logic assertions (corrected-vocabulary tokens present AND the bare "Any `REGRESSION`" gate phrasing absent), REGRESSes when either assertion fails, and SKIPs when the skill file is absent.
- FR-6: `/eval` MUST record `eval-gate` as PASS in `evals/RESULTS.md`, committed on the branch via the single §6 invocation, with no new green→red transitions; `eval-gate`'s green status MUST additionally be confirmed by a direct probe run.

## Non-Goals

- Fixing the unrelated `next-dev-prod` probe (it is a runtime-state oracle by design).
- Adding `autopilot` to `.claude/protected-paths.txt` (separate concern; out of scope).
- Creating the other three named-but-missing `triage:proceduralize` probes (`rl-delegation`, `cron-activation`, `continual-learning`).
- Changing the `/eval` runner itself — it already computes exit code + per-probe delta; this PRD only changes the autopilot skill's *interpretation* of that output.
- Any sandbox application code, compose, or entrypoint changes.

## Technical Considerations

- `.claude/skills/autopilot/SKILL.md` is **not** on `.claude/protected-paths.txt`, so editing it is unobstructed.
- Editing the autopilot skill does not affect the live autopilot run: the running session reads the main-checkout `.claude/` already loaded in context; the branch edit only takes effect on the next run (MEMORY.md 2026-06-10).
- The eval runner (`.claude/skills/eval/run.sh`) already exits 0 with per-probe delta even when a row is red, so US-001's rule is implementable purely as a doc/decision change.
- The probe is a grep-based oracle over the skill text — the same proceduralize pattern as `devtcp-hook.sh` (which asserts a hook's behavior). It tests that the *lesson is encoded in the skill*, which is exactly what "proceduralize" means here. It is a **doc-as-spec** check: it validates the corrected vocabulary is present, not the runtime gate behavior (which is interpreted prose).
- **Protected-paths coupling (accepted risk):** this change makes `autopilot/SKILL.md` §6 wording load-bearing — the `eval-gate` probe IS the protection mechanism (a reversion flips the probe red at the next `/eval`). Adding `autopilot` to `.claude/protected-paths.txt` is deferred to a follow-on (kept a Non-Goal) so this PR stays focused; the probe is the substitute safeguard in the meantime.
- **Escape hatch:** if the new gate ever misbehaves, restore the pre-change §6 text — the autopilot loop runs hourly and resumes immediately on revert (blast radius is low for this single-developer harness); the `eval-gate` probe will flip red, surfacing the reversion at the next `/eval`.

## Success Metrics

- A future autopilot run with a pre-existing-red `next-dev-prod` but exit-0 runner reaches `gh pr ready` instead of jamming.
- `eval-gate` probe is green in `evals/RESULTS.md` and would flip red if the §6 rule were reverted **verbatim** (the probe is a vocabulary oracle; a semantic-only paraphrase that preserves the old behavior is out of its coverage — accepted for a single-developer harness).

## Open Questions

- None — the corrected rule is specified in the 2026-06-11 MEMORY lesson; the file-scope sub-condition was demoted to a diagnostic note per critic review (delta is authoritative).

## Critic Synthesis (Stage 4 — PROCEED)

Two critics reviewed this PRD before any issue/branch/commit. They raised **2 high-severity findings**, both on the original "file-scope disjoint" PROCEED sub-condition (undefined read-set; self-defeating for PRs that edit the probed file). The PRD was **revised in place** to resolve them — the file-scope check was demoted from a hard gate condition to a non-gating diagnostic, with the green→red **delta** made the authoritative causation signal (US-001, FR-1). Six medium findings were folded into the ACs: positive-assertion (AND-logic) probe, direct-run + worktree-isolated revert verification, single-invocation benchmark commit, SKIPPED carve-out wording, explicit escape hatch, and explicit risk-acceptance of the protected-paths coupling. No high-severity findings remain unmitigated and no `[PROTECTED-PATH]` violation was raised (`autopilot` is not on the protected list; editing it is in-scope). **Recommendation: PROCEED.**
