# Evidence — spec-simplification

- **PR**: [#817](https://github.com/mifunedev/openharness/pull/817) (`mifunedev/openharness`, base `development`) · **Branch**: `feat/spec-simplification`
- **Issue**: #816
- **Audit run**: **none — no lifecycle `AUDIT_RUN_ID` exists for this build.** See *Correlation* below; this is a disclosed gap, not an omission.
- **Verdict**: `AUDIT-PASS` (gates 1, 2, 4) + `PR-AUDIT-PROMOTABLE` (gate 3, recorded below).
- **Commit under test**: `a8ae4d0f` (`a8ae4d0fd76422ae4c2617411517d576f5365230`)

## Correlation — read this before trusting the verdict

The audit gates below were run **directly**, as
`AUDIT_ROOT="$PWD" bash .oh/skills/audit/scripts/implementation-gates.sh …` and
`bash .oh/skills/eval/run.sh`, **not** through the `/audit` lifecycle boundary
(`.oh/skills/audit/scripts/audit-run.sh` + `route-driver.sh`). Consequences, stated plainly:

- There is **no `AUDIT_RUN_ID`** to correlate this doc to, and no `evidence.json` was published,
  so nothing was appended to `$AUDIT_LOG_ROOT/.oh/memory/<date>/log.md`. Confirmed absent:
  `grep -n 'audit-2026' /home/sandbox/harness/.oh/memory/2026-08-2*/log.md` → no matches.
- The verdict below is therefore **the orchestrator's reading of real gate output**, not a
  boundary-published machine verdict. The gate output itself is genuine and reproducible by the
  commands quoted; the missing piece is the lifecycle record, not the observation.

`reviewer-evidence-doc.md` asks for the run id verbatim. Writing one that does not exist would
be exactly the failure US-007 removed from `MEMORY.md` — a claim of enforcement that nothing
backs — so the field is recorded as `none` instead.

## What the plan asked for

The plan's complaint was not that the pipeline was incorrect but that it was **unaccountable to
the operator**: ~10 verification nodes, zero comprehension nodes. Every gate asked *is this
correct?* and none asked *is this still what you agreed to?* Around that sat surplus machinery
that added branching without signal — a critique/approve gate that halted the workflow and cost
2–4 critic agents while surfacing nothing durable, two spec pipelines where v2 delegated into
v1's body, three build executors behind three separate toggles, status tokens nothing routed on,
and log entries nothing read. The ask: **remove the gate that stops without informing, collapse
the duplicate paths to one, and make the pipeline answer back to the plan.**

## What was built

| Story | Observable behavior that now holds |
| --- | --- |
| US-001 | The critique/approve gate is gone from the path. Approving `prd.md` **is** the commitment gate; `AGENTS.md § The Workflow` states it and the mermaid graph has no critic node. |
| US-002 | Exactly one build executor. `--executor`, `SHIP_SPEC_EXECUTOR`, and `AUTOPILOT_EXECUTOR` were **removed, not narrowed to one accepted value**; `.oh/scripts/ralph.sh`, its test suite, and the ralph prompt template are deleted. Three live launch defects fixed in passing (below). |
| US-003 | `/spec execute` holds the build mechanics in full — 157 → 500+ lines, no "see `/ship-spec`" deferral. `.oh/skills/ship-spec/` is deleted and ~40 consumers repointed. |
| US-004 | `.oh/prompts/`, `.pi/prompts/advisor/`, and `.oh/context/rules/first-mate.md` are deleted. The zero-diff derivative (`session-prompt.md`) became the source, so the workflow is discoverable in exactly one place. |
| US-005 | `.oh/tasks/<slug>/evidence.md` is a **gate condition**: the undraft refuses without it, and refuses an *untracked* one. `/teach` is wired into step 7. `progress.txt` is promoted into the PR body instead of dying at the sentinel. |
| US-006 | Four `STATUS: SPEC-*` tokens with no consumer are gone; the groom triad left the per-cycle path; `/eval` runs once per cycle (318 → 106 probe executions). |
| US-007 | `MEMORY.md`'s 76 unbacked `probe:` claims are rewritten to explicit `probe: none` and marked; the relative-`MEMORY_DIR` shadow is fixed; the duplicate checker now catches rephrasings. |

### Gate 1 — task graph + artifact contract: **PASS**

```
$ AUDIT_ROOT="$PWD" bash .oh/skills/audit/scripts/implementation-gates.sh gate1 spec-simplification
task-graph: 7/7 stories pass
GATE1-EXIT=0
```

No `artifact_contract` block is declared in `prd.json` (keys present:
`schemaVersion`, `project`, `branchName`, `description`, `userStories`), so that sub-check
passes unchanged rather than vacuously — recorded here so a reader does not read it as verified.

### Gate 2 — regression floor (`/eval`): **PASS**

```
$ bash .oh/skills/eval/run.sh
ran 110 probe(s); wrote …/.oh/evals/RESULTS.md
RUNNER_EXIT=0

$ awk -F'|' '/^\| / {gsub(/ /,"",$5); if($5!="")c[$5]++} END{for(k in c) print k, c[k]}' .oh/evals/RESULTS.md
SKIPPED 4
PASS 106
```

**0 REGRESSION.** Published to `.oh/tasks/spec-simplification/eval-result.json`, keyed to commit
`a8ae4d0f`. The suite was re-run at that exact commit rather than reusing the earlier run at
`dcef9085`, because the record's `commit` field is the freshness key and reusing a green
measured against a different tree is how a pipeline starts reporting a floor it never measured.

The 4 `SKIPPED` are pre-existing and `unchanged`, each disclosed with its reason:
`autopilot-preflight-gate` (issue #194), `debugmcp-availability` (issue #297), `next-dev-prod`
(MEMORY.md 2026-06-04), `registry-portability` (issue #758). `SKIPPED` does not count toward
pass-rate (`.oh/evals/RESULTS.md` header).

Language/type gates, same commit:

```
$ pnpm -s typecheck        → tsc --noEmit, exit 0
$ pnpm -s test             → Test Files 41 passed (41) · Tests 577 passed (577)
```

### Gate 3 — promotable / CI

Recorded at the end of this doc, after the push. At the time the graph was certified this gate
was `NO-RUN` (branch unpushed, `gh pr list --head feat/spec-simplification` → `[]`), which is
**not** a pass; the run continued into the tail rather than claiming one.

### Gate 4 — UI verification: **N/A**

```
$ AUDIT_ROOT="$PWD" bash .oh/skills/audit/scripts/implementation-gates.sh browser-required …
→ exit 1
```

No story declares browser verification, so `agent-browser` was not invoked at all.

### Wiki alignment (`prd.md` says `Impact: REQUIRED`)

```
$ bash .oh/evals/probes/wiki-readme-index.sh
PASS: .oh/skills/wiki/corpus/README.md Index matches the git-tracked corpus/*.md frontmatter
```

`build-executor-ladder` revised (its disambiguation note still pointed at
`.oh/context/rules/first-mate.md` and `.oh/prompts/advisor/*`, both deleted by US-004 — so the
entry was routing readers to the very second path that story removed). New entry
`plan-vs-built-reconciliation` added for the gap the PRD named, with raw provenance capture.
The required DeepWiki comparison **was run** (2026-08-24, `deepwiki.com/mifunedev/openharness`)
and is recorded in both entries: upstream is **stale, not contradictory** — it still lists
`scripts/ralph.sh` among the implementation skills and still glosses `/ship-spec` as *"Convert
specs into executable tasks via a critic"*, and has no reconciliation concept at all.

The probe was **RED on first run** and that is the useful part: it reads `git ls-files`, so a
new entry that exists on disk but is untracked produces a README row with no file behind it.
Curated corpus entries land with `git add -f` (`.gitignore:85`).

## Where it diverged from the plan, and why

1. **The audit ran outside the lifecycle boundary** (see *Correlation*). The gate observations
   are real; the correlated run id and `evidence.json` do not exist. Re-running through
   `audit-run.sh` + `route-driver.sh` would produce them.
2. **US-007 AC-2's semantic verdicts were not produced** — see *unverified* below. This is the
   one acceptance criterion whose flag rests on a partial: the mechanical half (strip, mark,
   worksheet) is done and observable; the classification half is not, and I declined to
   generate it.
3. **US-002 grew beyond "delete the toggles."** Reading the launch path to remove the arms
   exposed three defects in the arm being kept: a `--print` flag and a stdin-delivered prompt
   (the harness answers once and exits), and a `| tee` on the launch command (the child loses
   its TTY, starts, prints warnings, and never advances). Collapsing to one executor while
   leaving that one unable to launch would have satisfied the letter of the story and shipped a
   broken build path, so all three were fixed in the same change and pinned by probes.
4. **A fourth instance of the same `| tee` defect was fixed outside any story's criteria** — the
   Advisor tmux launch carried it too, and transcribing it verbatim into the surviving path
   would have re-shipped the bug US-002 had just removed.
5. **`MEMORY.md`'s edits appear in no diff.** The ledger is gitignored and untracked, so
   AC-1/AC-2's output cannot travel in this PR. Reconciled by landing a *tracked* idempotent,
   dry-run-by-default script plus a timestamped backup, so the change is reviewable, repeatable,
   and undoable even though its output is not in the diff.
6. **`memory-dir-absolute-or-unset` warns rather than gates on one of its three checks.** The
   ambient `MEMORY_DIR` is inherited from a container started before the fix, and **no commit
   can change a running process's environment** — gating on it would leave the probe red on
   every existing sandbox forever, and a permanently-red probe is how a whole board stops being
   read. It gates on the two commit-fixable facts (no compose file declaring a relative default;
   the resolver still anchoring `memory` to the main worktree) and warns loudly on the third.
7. **§2 of the build contract (a `/compact` at every story boundary) was not satisfied for the
   last stories.** `/compact` failed with a server-side `529 Overloaded`. Noted and continued
   because budget was ample; the mandated hygiene step did not run.
8. **A prior session of this build died self-inflicted**, having run
   `firstmate.sh --kill spec-simplification` against its own live slug while verifying the kill
   path. Recovery was a resume, not a restart. Destructive verification now uses a throwaway
   decoy session.
9. **The DeepWiki comparison was removed from the workflow after the PR went ready**, on
   operator instruction: the public DeepWiki for this repo regenerates on no schedule the gate
   could depend on. This build's own comparison is the evidence — it found `scripts/ralph.sh`
   still listed a day after deletion, and `/ship-spec` still glossed with the critic gate US-001
   removed. A gate answerable only by an unreliable third party measures upstream lag, not the
   build. Dropped from `/spec plan` step 3, the `/spec execute` wiki gate, its failure-mode row,
   the issue-body template, and the finalization contract; the wiki schema's standard is now
   named for what it requires (source files, line-cited claims, relationships, navigation)
   rather than for DeepWiki. The two corpus entries keep the observation as rationale. Probes:
   the 10 that read the edited files all PASS.

## What remains unverified

1. **US-005 AC-7 — a human read of the merge-gate output.** Marked *human, not a probe* in the
   spec. The output exists and is structurally verified; whether it actually informs a reader is
   the reader's verdict, and self-certifying it would defeat the criterion's purpose.
2. **US-007 AC-2, semantic half — the 32 verified-dead and 49 IDENTITY-restating
   classifications.** Set-overlap flagged **0 of 105 entries in both ratio directions**, because
   an `IDENTITY.md` principle is abstract where a ledger entry is a concrete incident: they share
   almost no vocabulary. A script asserting those 81 verdicts would be inventing evidence — the
   exact failure this story exists to remove. `.oh/memory/MEMORY-audit-worksheet.md` lays each
   entry beside the five principles with a **blank `verdict:`** for the operator's read.
3. **The herdr rung of the runner ladder has never been run end to end here.** The environment
   fingerprint gate refuses it (herdr panes are host processes; `AGENTS.md` requires in-sandbox
   execution). Verified only that it is *refused*, with the reason logged — not that it works.
4. **`build-executor-ladder` is 1157 words against schema § 2's ≤ 900 cap** for architecture
   entries. It was already over at 1058 before this change. Schema § 2's remedy is a sub-article
   split; trimming live-verified detail to meet a word cap is an operator's call, not a drive-by.
5. **The four `SKIPPED` probes** are carried forward unchanged, not made to pass.
6. ~~**CI has never run on this branch.**~~ Resolved in this run: all four checks green and
   `pr-classify` returned `promotable: true`. See *Gate 3* below.

## Gate 3 — promotable / CI: **PASS (`PR-AUDIT-PROMOTABLE`)**

PR [#817](https://github.com/mifunedev/openharness/pull/817) (`mifunedev/openharness`, base
`development`). Branch pushed to `upstream` — `origin` is a stale fork.

All four required checks settled green on `e1a75d42`:

```
$ gh pr checks 817 --repo mifunedev/openharness
Boot Path Lint (shellcheck + hadolint)      pass  16s
Eval Probe Regression Gate                  pass  25s
Lint, Typecheck, Build & Test               pass  43s
Validate sandbox compose and image build    pass
```

Classified by the production seam, not by eyeballing the checks:

```
$ bash .oh/skills/audit/scripts/pr-acquire.sh pr --repo mifunedev/openharness --pr 817 \
    | bash .oh/skills/audit/scripts/pr-classify.sh
{"ci":"PASS","draftStatus":"promotable","evidenceComplete":true,"flags":["size-convention"],
 "mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","promotable":true,"readyForReview":true,
 "readyToMerge":false,...}
```

The evidence gate was checked before the undraft, both halves:

```
$ git ls-files --error-unmatch .oh/tasks/spec-simplification/evidence.md
.oh/tasks/spec-simplification/evidence.md
TRACKED-OK
```

Two notes a reviewer should not have to infer:

- **`flags: ["size-convention"]` is advisory and did not gate.** The promotable classification
  never reads `flags`; the diff is large (108 files) because six of the seven stories are
  deletions. Recorded, not dismissed.
- **`readyToMerge: false` is correct and expected.** There is no review yet, and the human owns
  the merge — `AGENTS.md § The Workflow`: *human merge — final gate, no auto-merge*. Nothing in
  this run merges anything.
- **`issueReferences` lists 194, 297 and 758 alongside 816.** Those three are the tracking
  issues for the four pre-existing `SKIPPED` probes, mentioned in the PR body's *unverified*
  section. Only #816 carries a closing keyword.

**Undraft correlation.** This section, the CI observation, and the classification above were
committed and pushed *before* the undraft, which re-triggered CI on the new head. The undraft
was performed only after a **fresh** classification on that final commit — a green measured
against an earlier tree is not evidence about the tree being reviewed.
