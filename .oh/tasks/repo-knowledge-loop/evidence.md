# evidence — `repo-knowledge-loop` (issue #926, PR #927)

Branch `feat/926-repo-knowledge-loop` · base `development` · planning base
`ecc49800` · repo `mifunedev/openharness`.

Contract: `.oh/skills/audit/references/reviewer-evidence-doc.md`.

---

## 0. Why this is better than not doing it

**Before.** `/spec` wrote durable knowledge more reliably than it read it. Nothing
in the planning contract required a session to recall what the repository already
knew, so each plan re-derived it — and re-derived it differently. The planner's
`Wiki Alignment` block was the *only* knowledge-impact oracle, even though
implementation reaches paths a planner never sees. Page validity was decided by
`updated > 90d`, which is unrelated to whether the page is still true. Knowledge
pages were gitignored-by-default and whitelisted one at a time, so one machine
could consume a page that a fresh clone could not see. And several `/spec`
surfaces carried a second copy of state that already existed elsewhere.

**After, with the numbers this run produced.**

| | Before | After | Observed by |
|---|---|---|---|
| Knowledge read before a plan exists | not in the contract | required step 2, recorded in `## Knowledge Context` | `spec-plan-knowledge-context.sh` |
| Knowledge-impact oracle | the planner's prediction | prediction **∪** actual diff **∪** declared dependencies | `spec-execute-knowledge-impact.sh`; this build's own run below |
| Pages this build would have missed on the old oracle | — | **2 of 6** (`document-ingestion`, `oh-cli-portable-lifecycle` were never predicted) | the gate run below |
| Validity test | `updated > 90d` | a declared source changed after `verified_at` | `knowledge-source-freshness.sh` |
| Unresolvable provenance found by the new check | unmeasured — no check existed | **5** (3 phantom snapshots, 2 bad pins), all repaired | the source-path check |
| Places completion is represented | 2 (`prd.json` + a prose sentinel) | 1 (`prd.json`) | `task-completion-structured-state.sh` |
| Writable knowledge locations | 1, gitignored-by-default | 1, tracked, with scratch physically separate | `knowledge-path-single-owner.sh`, `knowledge-tracked-query-boundary.sh` |
| `/spec` conceptual nodes | 4 (`ship` owned no mechanics) | 2 + a wrapper | `spec-family-contract.sh` |
| `/wiki lint` checks | 6, all report-only, 0 with an oracle | 6, **6 with a named oracle**; 2 unenforceable ones retired | `lint.md:23-33` |
| Execution states a caller can observe | 0 (a detached launch reported a ready PR) | 4, in `/tmp/agent-spec-<slug>.state` | `spec-execute-running-contract.sh` |

**The sharpest number is 2 of 6.** The Actual Knowledge Impact gate found six
pages this change touched. `prd.md`'s `Expected Knowledge Impact` — written by the
planner with the whole issue in front of it — named four of them and missed
`document-ingestion` and `oh-cli-portable-lifecycle`. Under the old model those
two would have shipped stale, silently. That is the loop closing on its first run.

**Cost paid.** 106 files, +3873/−1931. The `/spec` reference docs grew
(`SKILL.md` 138→235, `plan.md` 142→251, `execute.md` 603→742) because three real
gates were added; `lint.md` shrank 551→427 and `ship.md` (121 lines) was deleted.
The probe suite grew 117→127. One new executable, 179 lines
(`knowledge-impact.sh`), replaces logic that would otherwise have been duplicated
in `/wiki lint` and `/spec execute`.

**Claimed, unmeasured:** that recall makes *future* plans better. This run proves
the mechanism exists and fires; a capability-benchmark delta over several cycles
would be the measurement, and it does not exist yet.

---

## 1. What the plan asked for

Issue #926 asked for one thing in eighteen parts: make `/spec` a closed loop in
which accumulated repository understanding is consumed before work, re-verified
against current reality, spent, and replenished — and retire the surfaces that
had grown a second copy of state.

In the operator's terms:

1. Planning must **read** durable knowledge before it writes a PRD, and must
   re-check what it read against the repository rather than trusting it.
2. An approved plan that grounding materially changes must **stop**, not proceed.
3. The **diff**, not the planner, must decide what the change made untrue.
4. Freshness must be a fact about sources, not about the calendar.
5. Durable knowledge must own its own surface, and shared knowledge must be
   physically separate from per-machine scratch.
6. `ship`, generated `prompt.md`, `STATUS: COMPLETE`, mandatory `/compact`, and
   the `.oh/memory` vocabulary must go — **atomically**, with every consumer.
7. Detached execution must have a real `RUNNING` state.
8. The single-Advisor executor model must survive all of it (pinned comment).

---

## 2. What was built

### The knowledge surface (US-001, US-002, US-003)

```
$ git log --diff-filter=R --name-status --format= origin/development..HEAD | grep -c '^R'
32
$ git ls-files -- .oh/skills/wiki | sed 's|.oh/skills/wiki/||'
SKILL.md
references/compile.md          references/official-docs-research-wiki.md
references/concurrent-ingest-worktrees.md   references/query.md
references/github-repo-research-wiki.md     references/schema.md
references/ingest.md           references/social-image-wiki-ingest.md
references/lint.md             scripts/knowledge-impact.sh
   (11 files — procedure only; not one data page remains under the skill)
$ bash .oh/evals/probes/knowledge-path-single-owner.sh
PASS: one writable knowledge surface at .oh/knowledge/ — the retired corpus path is gone
from disk, from git, and from every active reference, and the new surface ships and gates in CI
```

The ledger moved without being edited. Its old path is resolved from the base
tree rather than spelled out, because the guard above scans this document too:

```
$ BASE_LEDGER=$(git ls-tree -r --name-only origin/development | grep '/skill-impact\.md$')
$ diff <(git show "origin/development:$BASE_LEDGER") .oh/evals/decisions/skill-impact.md \
    && echo IDENTICAL
IDENTICAL
```

Scratch is physically separate and no read path touches it:

```
$ bash .oh/evals/probes/knowledge-tracked-query-boundary.sh
PASS: .oh/knowledge/local/ is ignored, holds nothing tracked but its anchor, is enumerated
by no read path, and has an explicit promotion path
```

### Source-change freshness (US-002)

`knowledge-impact.sh` is the single implementation. Its `--verified` mode is what
`/wiki lint` calls; the numbers below are real state, not a fixture:

```
$ bash .oh/skills/wiki/scripts/knowledge-impact.sh --verified | cut -f1 | sort | uniq -c
     11 NOT-APPLICABLE
      5 FRESH
      4 NEEDS-REVIEW
```

The four `NEEDS-REVIEW` rows — `audit-architecture`, `fresh-machine-setup`,
`managed-agents`, `release-versioning` — are pre-existing debt the old age rule
could not see: each names a `kind: repo` page whose declared sources moved after
its `verified_at` commit. Under `updated > 90d`, every one of them was "fresh".
The pages this change itself updated are absent from the list, because resolving
them advanced their pins — which is the check working, not the check being
silenced.

### The Actual Knowledge Impact gate (US-005) — run for real on this build

```
$ git diff --name-only origin/development...HEAD | wc -l
105
$ bash .oh/skills/wiki/scripts/knowledge-impact.sh --changed $(...105 paths...) \
    | grep NEEDS-REVIEW
NEEDS-REVIEW  document-ingestion            declared sources are in the changed set: .oh/skills/wiki/references/ingest.md
NEEDS-REVIEW  oh-cli-portable-lifecycle     declared sources are in the changed set: .oh/manifest.json .oh/README.md docs/oh-directory-layout.md docs/rfcs/rfc-brain-hands-boundary.md
NEEDS-REVIEW  plan-vs-built-reconciliation  declared sources are in the changed set: .oh/skills/spec/references/execute.md
```

Union with `prd.md`'s `Expected Knowledge Impact`, and the state each page ended in:

| Page | State | Why |
|---|---|---|
| `plan-vs-built-reconciliation` | **UPDATED** | every `execute.md` line and step anchor it cites moved; records the knowledge gate now beside the evidence gate |
| `oh-cli-portable-lifecycle` | **UPDATED** | the manifest it documents now ships `knowledge/**` |
| `wikiskill-experience-compilation` | **UPDATED** | its "the harness lacks the pattern layer, the impact ledger, and any wiki read on the proposer path" is now wrong on all three counts |
| `pattern-wiki-ungated-check-drift` | **UPDATED** | corroborating evidence appended per schema § 11a; this change applied its prescribed workaround to the whole check list |
| `pattern-wiki-external-model-over-mapping` | **UPDATED** | corroborating evidence appended; two exclusions written down alongside the structures that transferred |
| `document-ingestion` | **REVERIFIED** | `ingest.md` moved under it, but only paths and kind guidance changed; its conversion claims still hold. `verified_at` advanced, body untouched |
| `audit-architecture` | **NOT-AFFECTED** (no declared source is in the changed set; the audit subsystem is untouched by this change) | named in the prediction, not in the diff |

### The `/spec` contract (US-004, US-005, US-006)

```
$ for p in spec-plan-knowledge-context spec-plan-reconciliation-gate \
           spec-execute-knowledge-impact spec-execute-running-contract \
           spec-no-generated-prompt-contract task-completion-structured-state \
           retired-memory-vocabulary spec-family-contract advisor-monitored-loop \
           spec-ready-finalization; do
    printf '%-34s ' "$p"; bash .oh/evals/probes/$p.sh 2>&1 >/dev/null | head -1
  done
spec-plan-knowledge-context        PASS: /spec plan recalls tracked knowledge and re-grounds it before the PRD, and records Knowledge Context
spec-plan-reconciliation-gate      PASS: a materially changed approved intent stops for re-approval and cannot flow into /spec execute
spec-execute-knowledge-impact      PASS: /spec execute derives knowledge impact from the actual diff through the shared primitive and resolves every page to one explicit state
spec-execute-running-contract      PASS: detached execution reports RUNNING against a real status file and never promises a synchronous READY
spec-no-generated-prompt-contract  PASS: the durable task contract is prd.md + prd.json + progress.txt; the launch prompt is rendered, never persisted
task-completion-structured-state   PASS: task completion derives from prd.json structured state; the prose sentinel survives only in marked historical records
retired-memory-vocabulary          PASS: the retired memory tier appears in no current architecture doc, and its ignore rule is a labelled tombstone with a removal horizon
spec-family-contract               PASS: /spec owns the workflow, dispatches plan/execute/retro with an approved plan path as the default, ...
advisor-monitored-loop             PASS: one /spec Advisor owns implementation and gates; /delegate is bounded fan-out; retired handoff is absent
spec-ready-finalization            PASS: /spec execute treats the draft PR as a checkpoint, refuses the undraft without a tracked evidence.md, ...
```

The last two matter most for the pinned execution requirement: the lifecycle
change did **not** cost the single-Advisor model or the human merge boundary.

### This run dogfooded the contract it built

`prd.md` carries `## Knowledge Context` (base commit, queries, 8 slugs read,
grounded-against list, 4 conflicts), `## Expected Knowledge Impact`, and
`## Plan Reconciliation`. The task folder is three files plus `evidence.md` and
`eval-result.json` — no `prompt.md`. Completion is `prd.json`:

```
$ jq -e 'all(.userStories[]; .passes == true)' .oh/tasks/repo-knowledge-loop/prd.json && echo COMPLETE
COMPLETE
```

`/tmp/agent-spec-repo-knowledge-loop.state` was kept current at every phase, which
is how the orchestrator observed `RUNNING` rather than inferring it.

### The regression floor

```
$ bash .oh/skills/eval/run.sh
ran 127 probe(s); wrote .oh/evals/RESULTS.md
   (runner exit 0; zero green->red transitions; 4 SKIPPED — the same 4 as base ecc49800)
$ bash .oh/scripts/link-providers.sh --check
Providers OK: .pi/.claude/.codex skills -> .oh/skills (vendored pack present)
$ git diff --check && echo clean
clean
```

---

## 3. Fault injection — every new probe's REGRESSION branch was driven

A probe that has never failed has an unverified oracle
(`[[pattern-evals-unexercised-oracle]]`). Each injection below was applied,
observed, and reverted; each probe was re-run after revert and returned to PASS.

| Probe | Injection | Observed |
|---|---|---|
| `spec-plan-knowledge-context` | delete the `## Knowledge Context` block line | `REGRESSION: plan.md no longer specifies the block: ## Knowledge Context` |
| | reorder so grounding follows `/prd` | `REGRESSION: plan.md orders the pipeline wrong — recall and grounding must precede /prd` |
| | re-add a `## Wiki Alignment` heading | `REGRESSION: the retired Wiki Alignment planning block reappeared as a section heading` |
| `spec-plan-reconciliation-gate` | downgrade the stop to a warning | `REGRESSION: plan.md's reconciliation gate does not stop before execution` |
| | delete the `## Plan Reconciliation` block line | `REGRESSION: plan.md no longer specifies the ## Plan Reconciliation block` |
| `spec-execute-knowledge-impact` | rename the gate heading | `REGRESSION: execute.md has no Actual Knowledge Impact gate` |
| `knowledge-tracked-query-boundary` | comment out the `local/` ignore rule | `REGRESSION: .oh/knowledge/local/ is not gitignored — a scratch page would enter the shared set` |
| `knowledge-source-freshness` | make `dep_matches` always return false | `REGRESSION: changing a declared dependency did not mark the page needs-review (got: 'none')` |
| | point a pin at a path absent from a present commit | `REGRESSION: pinned source does not resolve at ce7b7db2 (basename hits: 0)` |
| | point a pin at an unreachable commit | `PASS ... (1 pin(s) unverifiable in this clone depth)` — deliberately not a failure |
| `spec-execute-running-contract` | remove the status file | `REGRESSION: execute.md defines no status file, so RUNNING is not observable` |
| `spec-no-generated-prompt-contract` | reintroduce a generated task prompt | `REGRESSION: .oh/skills/spec/references/plan.md still names a task-folder prompt artifact` |
| `task-completion-structured-state` | re-add the sentinel to the cleanup cron | `REGRESSION: active surface still keys on the retired completion sentinel: crons/cleanup-tasks.md:170` |
| `retired-memory-vocabulary` | list `memory/` in the `.oh/` contents table | `REGRESSION: .oh/README.md still lists memory/ in its contents table` |
| `knowledge-path-single-owner` | create a file under the retired path | `REGRESSION: the retired corpus directory still exists on disk` |

**The single-owner guard fired on this document.** The first draft of § 2 quoted
the retired path inside two shell transcripts, and `/audit implementation` gate 2
returned `AUDIT-FAIL` naming `evidence.md:86` and `:96` — a textbook instance of
`[[pattern-docs-prohibition-by-example]]`, arriving in the one file written to
prove the migration was complete. The fix followed that pattern's own workaround:
name the guard and resolve the path programmatically rather than restating it. The
oracle was **not** widened to exempt `evidence.md`, because an exemption for the
document that describes the migration is exactly the hole through which the
retired path comes back.

**The simplify gate deleted a mode nobody called.** `/audit implementation`
gate 5 found `knowledge-impact.sh --since <ref>` with zero call sites, contradicting
the script's own stated contract of two consumers. The Advisor deleted the branch
rather than arguing for it (round 1 of 3): 179 → 172 lines, and `--since` is now
rejected with the usage line. `--verified` and `--changed` are unchanged and still
exercised by `knowledge-source-freshness.sh` and `spec-execute-knowledge-impact.sh`.

**Fault injection changed the work, which is the point.** The first pass on
`spec-plan-knowledge-context` reported PASS *after the block it guards was
deleted*: a heading naming `` `## Knowledge Context` `` satisfied a substring pin.
Both planning probes were rewritten to assert the block by exact line
(commit `786920fd`). Two probes that looked green were not.

---

## 4. Where they diverged from the plan, and why

1. **`depends_on:` was collapsed into `sources:`.** Requirement E illustrates
   freshness with a separate `depends_on:` list ("for example"); requirement F
   normatively puts repository paths in `sources:`. Two lists of the same paths
   is the duplication `AGENTS.md` forbids. `sources:` is the single declaration
   and `verified_at:` pins the check. The behavior E asks for is unchanged.
   Declared in `prd.md` before implementation.
2. **`/spec retro` took option 1 of requirement K** (compatibility wrapper), not
   option 2 (delete). `references/retro.md` is a `protected-paths.txt` entry and
   an `audit-stale-references.sh` coverage path; deleting it needs a
   protected-path removal #926 does not ask for. The wrapper carries no second
   ontology — `spec-family-contract.sh` now fails if it grows one.
3. **No `/spec ship` alias survives.** Zero callers repository-wide outside the
   skill's own two files, so the non-goal against compatibility abstractions
   applies. A two-line redirect for a literal `ship` first token remains, for a
   correctness reason rather than a compatibility one: without it,
   `/spec ship <plan>` would derive the slug `ship`.
4. **`.oh/knowledge/raw/` is tracked, not ignored.** This PRD's US-001 criterion 4
   as first written required `raw/` to be ignored. It holds the immutable
   snapshots `kind: external` pages cite, and an untracked snapshot is provenance
   a fresh clone cannot verify — problem 4 of the issue, wearing a new name. The
   criterion was corrected mid-build; the issue's own layout comment annotates
   only `local/` as ignored, so this moves toward the issue, not away. Recorded
   in `prd.json`'s US-001 `notes` and in `prd.md`'s Plan Reconciliation.
5. **A fourth provenance form was added: a bare upstream URL.** Not in the issue.
   Forced by real state: three pages (`managed-agents`,
   `molt-agentic-reinforcement-learning`, `recursive-self-improvement-survey`)
   cited `raw/` snapshots that exist in **no commit** — the new source-path check
   found them. Repaired without fabricating provenance: two carry the arXiv URL
   their own bodies state; `managed-agents`, whose upstream URL is recorded
   nowhere in the repository, is reclassified `kind: repo` against the five
   repository documents it actually reasons over, with its unrecoverable external
   seed stated in the page. The URL form is documented as the weakest, and
   `/wiki ingest` can never produce it.
6. **Two pattern pins were re-pointed.** `pattern-wiki-ungated-check-drift` and
   `pattern-wiki-external-model-over-mapping` cited knowledge pages at
   pre-migration shas, where the new path does not exist. Re-pinned to a revision
   where the cited path is real. Historical precision is slightly reduced; the
   alternative was writing the retired path into a tracked file, which the
   single-owner guard forbids.
7. **`/eval` ran three times, not once.** Run 1 found a self-inflicted regression
   (`wiki-compile-contract` pinned schema sections I renumbered). Run 2 was clean.
   Run 3 followed the shallow-clone fix below. The once-per-cycle rule exists to
   stop three runs against the *same* commit telling us the same thing once; each
   of these ran against a different commit after a real change.
8. **`.oh/tasks/compose-env-boundary/prompt.md` was deleted.** A tracked artifact
   of the retired contract in another task's folder. Retiring the artifact from
   the durable contract while leaving a tracked instance behind would not be
   atomic.

---

## 5. What remains unverified

- **`shellcheck` was not run locally** — it is not installed in this worktree, so
  US-002's "passes shellcheck" clause was not observed here. CI's *Boot Path Lint
  (shellcheck + hadolint)* job covers it and is green on this branch.
- **Four pages are `NEEDS-REVIEW` against their own `verified_at`** —
  `audit-architecture`, `fresh-machine-setup`, `managed-agents`,
  `release-versioning`. This is pre-existing debt the new check made visible for
  the first time, not something this change caused: no declared source of any of
  the four is in this diff. Clearing it means re-reading four pages against
  sources that moved over months, which is a separate unit of work. `/wiki lint`
  reports it; nothing blocks on it. `managed-agents` is on the list *because* this
  change reclassified it `kind: repo` against real repository sources — before
  that it cited a snapshot that exists in no commit and could not be checked at
  all.
- **Two probes SKIP in CI**, `wiki-pattern-persistence` and
  `wiki-skill-impact-append-only`, because a depth-1 checkout has no merge-base.
  They SKIP identically on the scaffold commit `dc8043da`, before any of this
  change existed, so the behavior is pre-existing. Both PASS locally against a
  full clone, and both were made rename-aware in this change so the migration
  itself did not silence them.
- **One pin is unverifiable at CI clone depth** by design (see the fault-injection
  table). The check reports the count rather than failing; a reviewer who wants
  full-history verification runs the probe against a full clone.
- **`kind: external` and `kind: pattern` freshness is not modelled.** Their
  provenance is immutable, so no source-change test applies. A paper that is
  superseded upstream is invisible to every check here; that is a deliberate
  scope boundary, not an oversight.
- **The `/spec plan` recall step is a procedure, not an executable.** The probes
  assert that the contract requires recall and ordering; they cannot assert that a
  future session actually performed it. The `## Knowledge Context` block is the
  artifact a reviewer checks.
- **Claimed, unmeasured:** that recalling knowledge improves plan quality over
  time. The mechanism is proven to exist and to fire; the capability-benchmark
  delta that would measure the payoff needs several cycles.
- **`eval-result.json` can never satisfy its own freshness key.** The record
  stores the commit it ran against, and committing the record moves `HEAD` past
  it, so a downstream reader following the `commit == HEAD` rule always re-runs.
  `/audit implementation` did exactly that on this build and was right to. The
  reuse contract predates this change and is out of its scope; recorded here and
  nominated as a retro hypothesis rather than patched in passing.
- **`SIMPLICITY-RESIDUAL: 2`** — gate 5 stopped blocking on the monotone rule
  (`netAdded` 4113 did not fall below the previous round's 4112), so two findings
  are disclosed for the operator to judge rather than acted on:
  1. `knowledge-impact.sh --format slugs` has no production call site — both
     documented consumers use the default tsv, and only the probes that test it
     call it. Deleting it would remove ~8 lines and push a `awk -F'\t'` filter
     into five probe call sites. Left in place because the flag exists so an
     oracle can assert the finding *set* rather than parse a report, which is the
     shape `[[pattern-wiki-ungated-check-drift]]` argues for; the operator may
     disagree.
  2. The nine new probes repeat the ~10-line preamble every probe in the suite
     uses. Extracting a shared `lib.sh` is a repo-wide refactor across 119
     existing probes, not something this unit can absorb; recorded so the decision
     is made once, globally.
- **Public-documentation mirror to `mifunedev/openharness-web`** is not done here.
  Repository docs (`docs/oh-directory-layout.md`, `docs/glossary.md`, the RFCs,
  `.oh/README.md`) are updated in this change; the external site mirror is the
  separate follow-up the issue's last acceptance criterion asks for.

---

## 6. What this run compounded back

`/retro --task repo-knowledge-loop` tested 9 hypotheses (8 supported, 1
inconclusive) and `/wiki compile` turned the durable ones into knowledge:

| Page | Action | Lesson |
|---|---|---|
| `pattern-evals-pipefail-early-exit` | **created** | under `pipefail`, a reader that exits on first match SIGPIPEs the writer, so a successful match reports as a failed pipeline |
| `pattern-spec-self-staling-reuse-record` | **created** | a commit-keyed record committed into the repository it measures can never satisfy `commit == HEAD`, so the fallback is the only path |
| `pattern-evals-prose-literal-pinning` | patched | the same matcher fails the other way too: a short pin can be satisfied by a heading that merely names the block it guards |
| `pattern-docs-prohibition-by-example` | patched | the guard fired on this document; resolve a retired path programmatically, and never exempt the file that describes the migration |

Two probe candidates were **nominated and not minted**: a `pipefail`/`grep -q`
lint over shell scripts (12 files repo-wide carry the shape) and a doc-lint on the
reuse-record contract. Both are guardrails worth having and neither is asked for
by #926; minting them here would widen a diff gate 5 already flagged for size.
The knowledge pages above carry the workarounds, so the lessons are durable
whether or not the probes land.

Context compaction was **not run**. It is optional and non-gating in the new
contract, and every durable artifact above was written at full resolution first,
which is the ordering the change exists to guarantee.

---

## 7. Benchmark verdict

`/benchmark` — **`BENEFICIAL` (justified hold)**.

- **Floor**: the record was stale against HEAD, so the suite was re-run rather
  than inherited: 127 probes, exit 0, zero new `green→red`, four SKIPPED that are
  the same four skipped on base.
- **Ceiling**: suite score **held at 1.44/2.00** against the counterfactual. That
  is a *justified* hold rather than "machinery without movement", because the
  disqualifier for the latter is no capability task crediting the change — and
  CB-005 credits it directly: its success signal asks for a tracked pattern page
  with a `path:line` root cause and pinned `<path>@<short-sha>` provenance, and
  this run produced two and patched two more.
- **`REDIRECT-FLAG` raised.** The suite has **no task that measures
  recall-before-plan**, which is the capability this change adds, so the ceiling
  cannot see it in either direction. This is the shape CB-004 was retired for — a
  row that held at `Δ +0.00` because nothing was ever measured. Recommended
  redirect: author a CB task scoring whether a plan consumed tracked knowledge
  before its PRD existed.
- **No ledger write.** `/benchmark` writes an `SI-nnnn-V` record only for a
  `/builder` proposal under evaluation; none covers #926.
- Instrument grooming (`/audit eval-quality`) was not run — that follow-on does
  not exist yet, and is named rather than silently skipped.

---

## Correlation

| Field | Value |
|---|---|
| Audit run id | `audit-20260901T014837Z-1436087` |
| Native verdict | `AUDIT-PASS` · `SIMPLICITY-RESIDUAL: 2` (gates: graph 7/7 · eval rc=0 · promotable true · ui n/a · slop non-blocking) |
| PR audit verdict | `<PR-AUDIT-VERDICT>` |
| Eval record | `.oh/tasks/repo-knowledge-loop/eval-result.json` (commit-keyed) |
| Task graph | `.oh/tasks/repo-knowledge-loop/prd.json` — 7/7 stories passing |
