# Evidence — spec-simplification

- **PR**: [#817](https://github.com/mifunedev/openharness/pull/817) (`mifunedev/openharness`, base `development`) · **Branch**: `feat/spec-simplification`
- **Issue**: #816
- **Audit run**: `audit-20260824T073818Z-1888450` · target `implementation` · state `complete` · exit 0
- **Verdict**: `AUDIT-PASS`, boundary-published (gates 1, 2, 4) + `PR-AUDIT-PROMOTABLE` (gate 3, recorded below).
- **Commit under test**: `2fa20a3e` (`2fa20a3e4a9f6bf59e932f44feaad8b2059363bb`)

## Correlation — the audit that counts, and the one that did not

**The real audit:** `audit-20260824T073818Z-1888450`, run through the lifecycle boundary
(`audit-run.sh implementation spec-simplification --pr 817 --repo mifunedev/openharness --
route-driver.sh`) with an inline agent, which published schema-v1 `evidence.json` and made the
single locked terminal append. Verified in the log:

```
$ sed -n 1,8p /home/sandbox/harness/.oh/memory/2026-08-24/log.md
## audit -- 07:43 UTC
- **Run-ID**: audit-20260824T073818Z-1888450
- **Target**: implementation
- **State**: complete
- **Verdict**: AUDIT-PASS
- **Exit**: 0
```

**What was wrong before this, stated because it is the more useful record.** Every earlier
verdict in this document was produced by running the gate *scripts* by hand
(`AUDIT_ROOT="$PWD" bash .oh/skills/audit/scripts/implementation-gates.sh …`,
`pr-acquire.sh | pr-classify.sh`) and reading their output. Those checks were real and
reproducible — but `/audit` is not its scripts. It is the boundary that mints the run id,
drives the route, requires a final `AUDIT-EVIDENCE:` line, publishes `evidence.json`, and logs
once. None of that had happened; `grep -c 'audit-2026'` over the memory logs returned **0**.

The document nonetheless carried `AUDIT-PASS` and `PR-AUDIT-PROMOTABLE` — tokens only the
boundary is entitled to emit — with `Audit run: none` beside them. That pairing was a
disclosure where the skill requires a **fail-closed**: a protocol that cannot publish valid
evidence yields *no verdict*, not a verdict with a caveat. So `/spec execute` step 5 was never
satisfied by the thing it names, and the step-10 undraft rested on a verdict no audit had
produced. **The workflow was not followed at the audit node.** It has now been run properly and
the result stands on its own; this paragraph remains because a reader who only saw the corrected
version would learn the wrong lesson about how the gap happened.

**What the real audit found that the hand-run gates did not.** Its own `/eval` run exited **1**,
on `audit-run-root-contract` (#645) — a probe that exits 0 for me and REGRESSION for it.
Reproduced both ways:

```
$ bash .oh/evals/probes/audit-run-root-contract.sh            # plain
exit=0
$ AUDIT_ROOT="$PWD" AUDIT_RUN_ID="audit-20260824T073818Z-1888450" \
    bash .oh/evals/probes/audit-run-root-contract.sh
audit: inherited run requires both roots
REGRESSION: canonical production route driver did not publish correlated evidence
```

The probe inherits the ambient `AUDIT_*` bindings and takes them for a child-mode run with an
incomplete environment. It is **not attributable to this change**: the diff touches neither the
probe, nor `.oh/skills/audit/scripts/`, nor `locked-append.sh`, and it fails identically from
the `development` checkout. Non-gating and pre-existing — but worth naming, because a probe
that asserts the audit's root contract goes red *when run from inside an audit* is a real
defect in the probe, and it is invisible to anyone who only runs the suite by hand.

## Why this is better

The repo without this change still worked. Here is what was worse, and what it cost to fix.

| Without this change | With it | Measured |
| --- | --- | --- |
| **The build executor could not launch a working session.** `firstmate.sh` built `cat <prompt> \| claude --print`: `--print` makes the harness answer once and exit, and a piped prompt means stdin is not a TTY. Observed 2026-08-23: the child started, printed warnings, never advanced. A fourth instance sat in the Advisor tmux launch. | The prompt travels as argv, no arm carries `--print`, nothing pipes the launch command. Two new probes fail if any of it returns. | broken → works; `executor-launch-interactive`, `executor-kill-clears-session` verified by rejection |
| **`--kill` failed silently** — exit 1, no output, session left running, lock left claimed, no `FIRSTMATE-INCOMPLETE` line. A prior session of this build killed itself with it and the failure was invisible. | Teardown completes and records. | broken → works |
| **Reading the build path meant resolving which of three executor arms ran first.** Every skill, probe, and doc carried a three-way toggle. | One arm. The other two are deleted, not defaulted. | live references to a toggle or `ralph.sh`: **100 → 3**, and all three are assertions of absence |
| **The build mechanics lived in two skills**, with `/spec execute` deferring into `/ship-spec`'s body — and the copies had drifted (ship-spec's critics carried a wiki-alignment item `/critique` lacked). | One file, read top to bottom, no hop. | 2 files / 701 lines → **1 file / 633 lines**, `/spec` family bytes **86,528 → 53,009** |
| **A gate stopped the workflow to spend 2–4 critic agents whose output never reached the operator.** | No halt, no critic spend. The operator's read of `prd.md` is the gate. | **2–4 agents per plan → 0** |
| **`/eval` ran three times per cycle on the same commit** — in `/spec execute`, `/audit implementation` Gate 2, and `/benchmark` Signal 1 — to learn the same thing three times. | Runs once; the two downstream gates read a commit-keyed record. | **318 → 110 probe executions**; suite wall-clock measured at **22s**, so ~**44s of redundant execution removed per cycle** |
| **Every session loaded 8,161 B of `.oh/context/rules/`** on top of everything else. | 414 B. | **−95%**, paid by every session forever |
| **`MEMORY.md` asserted 76 lessons were probe-guarded. Zero of the 76 ids resolved to a file.** Every one read "this is enforced" while nothing enforced it — worse than claiming nothing, because it stops you looking. | All 76 read `probe: none`, explicitly. | **76 false enforcement claims → 0**, via a tracked idempotent script |
| **The reviewer got a diff and a green check.** Nothing said where the build departed from the plan they approved. | `evidence.md` ships in the diff and the undraft refuses without it. | this document; **benefit to review quality is claimed, unmeasured** |

**What it cost, stated as plainly as the gains:**

- **No fallback executor.** Removing every alternative removes the recovery path: a
  misbehaving ladder is now fix-forward only.
- **No adversarial check on the plan.** The deleted critics also read
  `.claude/protected-paths.txt` and hard-halted on a protected deletion. Nothing in the
  surviving path reads that list — and this change is exactly the shape it guarded, deleting
  three listed paths while amending the list in the same commits. The compensating control is
  the operator's read.
- **One file is now 633 lines.** Fewer places to look, more to read in the place that is left.
- **The comprehension benefit is unproven.** Every number above is a count of code, config,
  or execution. Whether a reviewer actually understands a change better because of
  `evidence.md` and `/teach` is not measured here, and the two human-only criteria
  (US-005 AC-7, US-007 AC-2) are where that would show up.

**How you would falsify the headline claim.** If the pipeline is genuinely simpler, the next
build should touch one executor path, run one suite, and produce one document a reviewer can
act on. If the next task instead reintroduces a branch, re-runs the suite in a downstream
gate, or ships an `evidence.md` whose divergence section says "None" while the diff shows
otherwise, this change did not hold.

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
| US-006 | Four `STATUS: SPEC-*` tokens with no consumer are gone; the groom triad left the per-cycle path; `/eval` runs once per cycle (318 → 110 probe executions). |
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
A DeepWiki comparison **was run** (2026-08-24, `deepwiki.com/mifunedev/openharness`) while the
gate still required one — see divergence 9, which removed that requirement
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

## Audit council — five lenses, and what they changed

After the PR reached ready-for-review, five auditors reviewed the branch against its
pre-change state (`60f8c12d`), one lens each: deletion safety, claims-vs-reality,
enforcement strength, operator comprehension, and the final commit + reversibility. **All
five returned `PASS-WITH-CONCERNS`.** Nothing was found fabricated; the recurring shape was
*true underneath, tightened in the retelling*. Their defect findings are fixed in
`635f67cd` — a dangling `## Wiki Alignment` pointer with no block behind it, the build
session prompt still teaching the deleted critic gate, `REPO_MAP.md` still describing the
removed model, the `318 → 106` arithmetic, the missing CHANGELOG entry, an internal
contradiction in this document, a live corpus entry still calling the DeepWiki comparison
required, a probe a one-line historical note could defeat, and `AGENTS.md` being absent from
every CI path filter.

**Benchmark against the previous state.** The suite was run in three isolated worktrees:
old tree + its own 106 probes → 101 PASS / 5 SKIPPED; new tree + its 110 → 105 PASS / 5
SKIPPED; and the controlling comparison, **today's 110 probes against the old tree → 88 PASS
/ 17 REGRESSION**. Those 17 are the behaviors the pre-change state could not satisfy. Live
surfaces carrying an executor toggle or a `ralph.sh` reference: **100 → 3**, and all three
survivors are assertions of absence. `.oh/context/rules/` 8,161 B → 414 B. The `/spec`
family 86,528 B → 53,009 B while absorbing a deleted skill.

Three findings were deliberately **not** actioned, and a reviewer should weigh them:

1. **The protected-paths check lost its automated enforcement.** The deleted critics read
   `.claude/protected-paths.txt` and escalated any `[PROTECTED-PATH]` hit to a hard halt
   before any GitHub state existed. No node in the surviving path reads that list; it
   appears once, as a passive row in a primitives table. This PR is itself the shape the
   check existed to catch: it deletes `ship-spec`, `.oh/scripts/ralph.sh` and
   `critique.md` — all three on the list at `60f8c12d` — while amending the list in the
   same commits (`a1f64de2`, `ac8aa433`, `e0a98940`), which keeps
   `protected-paths-resolve` green. The removal is deliberate and documented; the
   compensating control is the operator's read, i.e. this document.
2. **`evidence.md`'s undraft refusal is an instruction, not machine enforcement.** The
   refusal lives in `execute.md`'s step 10 as a bash block an agent is asked to run;
   `pr-classify.sh`'s `evidenceComplete` reads PR *body* completeness, not this file. The
   probe guards the wording, and the wording is section-scoped, so it fails when the gate
   text is deleted — but nothing stops an agent from running `gh pr ready` anyway.
3. **Two claimed invariants have no probe at all** — the absence of `STATUS: SPEC-*`
   tokens, and the absence of the DeepWiki comparison. Both are prose-only today.

**One rule this PR ships cannot be fully satisfied by the record that ships it.**
`eval-result.json` is keyed to `635f67cd`, the tree the suite actually ran against; the
commit that adds the record necessarily moves `HEAD` past it. A reader applying the
freshness key literally (`commit == HEAD`) will always see the final record as stale. The
honest reading is *the record keys the last commit that changed testable state*, and a
reader whose comparison fails runs the suite — which is still the safe direction. Recorded
here rather than papered over by re-keying to a commit the suite never saw.

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
