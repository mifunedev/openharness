# critic-prd-alignment — implementer-lens audit

**Date:** 2026-08-01 01:43 UTC
**Compared:** `.oh/tasks/pm2-pi-supervision/prd.json` against `.oh/tasks/pm2-pi-supervision/prd.md`, the Ralph contract in `.oh/skills/ralph/SKILL.md`, and the user's latest hard gate.
**Verdict:** **FAIL** — 5 unresolved high-severity findings.
**Finding count:** H5 / M6 / L0.

## Severity rule

- **H:** can violate the user's hard gate, permit implementation out of order, or make the Ralph unit structurally unsafe to execute; must be remediated before the planning gate passes or the draft PR is treated as implementation-ready.
- **M:** does not by itself authorize premature implementation, but leaves schema, verification, or scope enforcement incomplete.
- **L:** editorial/non-blocking.

## Exhaustive alignment inventory

### Root fields and Ralph core

| Item | Result | Evidence |
|---|---|---|
| JSON syntax | Aligned | `jq empty prd.json` succeeds. |
| `schemaVersion` | Aligned | Value is `1`, matching the Ralph output contract. |
| `project` | Aligned | `Open Harness`. |
| `branchName` | Aligned | `feat/677-pm2-pi-supervision`, matching issue #677, folder slug, and PRD branch. |
| Root description | Aligned | Faithfully summarizes a credential-free, disposable PM2 7.0.3 study with no adoption/runtime mutation. |
| Story IDs | Aligned | Six sequential IDs, US-001 through US-006. |
| Priorities | Aligned | Unique priorities 1–6 in markdown table order and dependency-first order. |
| Initial pass state | Aligned | Every story has `passes: false`. |
| Initial notes | **Not aligned** | Ralph requires empty initial `notes`; all six contain dependency/delegate metadata. See M-02. |
| Extra `taskGraph` | Partially aligned | It accurately mirrors most markdown edges, but it is a non-core extension ignored by the Ralph selector and incompletely models final reviewers. See M-01. |

### Story-by-story content

Text differences below are only markdown punctuation/format normalization (`+` → `plus`, backticks removed, checklist markers removed) unless a finding says otherwise.

| Story | Title | Description | Acceptance criteria | Priority | Delegate | Dependency | Result |
|---|---|---|---:|---:|---|---|---|
| US-001 | Exact | Exact | 6/6 semantically exact | 1 | `first-mate-gate` exact | Both initial critics exact | **Hard-gate conflict despite JSON↔markdown parity**; see H-01, H-02, H-03. |
| US-002 | Exact | Exact | 6/6 semantically exact | 2 | `implementer-baseline` exact | US-001 exact | Aligned, with scope/verifiability ambiguity; see M-04 and M-05. |
| US-003 | Exact | Exact | 7/7 semantically exact | 3 | `implementer-rpc` exact | US-002 exact | Aligned, but oversized and missing authoritative scope terms; see H-05 and M-03. |
| US-004 | Exact | Exact | 6/6 semantically exact | 4 | `implementer-controls` exact | US-002 exact | Aligned, but oversized; see H-05. |
| US-005 | Exact | Exact | 6/6 semantically exact | 5 | `implementer-benchmark` exact | US-003 + US-004 exact | Aligned, but oversized and source/runtime comparison is ambiguous; see H-05 and M-06. |
| US-006 | Exact | Exact | 7/7 semantically exact | 6 | `implementer-analysis` exact | US-005 exact | Final reviewer intent is present but not represented as dependency nodes; see M-01. |

### Dependency and delegate graph

- The implementation diamond is correctly copied: US-001 → US-002 → parallel US-003/US-004 → US-005 → US-006.
- Initial critic names and assignments are exact.
- US-006 carries `reviewDelegates: [critic-evidence, critic-scope]`, matching the markdown table's prose.
- The markdown Mermaid graph contains two terminal nodes after US-006, but JSON omits those nodes and any auditable completion state for them. This is M-01.
- The latest kickoff gate is not a node or dependency and is instead embedded inside US-001. This is H-01.

### Scope-boundary coverage

| Markdown boundary | JSON coverage | Result |
|---|---|---|
| Exactly PM2 7.0.3 | US-003 and US-004 criteria | Covered. |
| Explicit RPC + LF JSONL | US-003 criteria | Covered. |
| No live Slack credentials | US-002/US-005 criteria | Covered. |
| No production bridge/config in controls | US-004 criterion | Covered. |
| Disposable isolation and teardown | US-002 criteria | Covered, but PM2-home/global-install details are absent. |
| Common rubric/fault sequence | US-004/US-005 criteria | Covered. |
| Source/live evidence labels | US-006 criterion | Covered. |
| No adoption decision | Root description + US-006 criterion | Covered. |
| Preserve production scripts/config/manifests/lockfiles/image/session/runtime | US-006 final-state criterion, partially US-002 | Covered only as a late final-state check; not an explicit invariant on US-003–US-005. |
| No persistent PM2 daemon/startup service/process dump/global install/added dependency | Not explicit in JSON | Missing; see M-03. |
| No tmux replacement/removal | Not explicit in JSON | Missing; see M-03. |
| No throughput/load-balancing/cluster-mode work | Not explicit in JSON | Missing; see M-03. |
| No prototype/benchmark during planning | Implicit through US-001 dependency | Conflicts with current planning status and kickoff placement; see H-01 and H-04. |
| Protected paths | PRD proposes no deletion/deprecation | No protected-path violation found. |

## Findings

### H-01 — Explicit kickoff is attached to the wrong gate

**Story:** US-001 / task graph
**Evidence:** Both files require “The progress ledger records the explicit human kickoff and both critic verdicts” before US-001 passes; US-002 depends only on US-001. The latest user gate says critics and artifact validation happen now and **only US-002 onward** waits for explicit kickoff.
**Impact:** Planning cannot complete its critic/validation/draft-PR phase before kickoff under the current graph. Conversely, there is no distinct kickoff edge that can be checked immediately before US-002.
**Exact remediation:** In both `prd.md` and `prd.json`, remove explicit kickoff from US-001 completion. Make US-001 own critics, artifact validation, finding resolution, and creation of the artifact-only draft PR. Add an `explicit-human-kickoff` gate after US-001 and before US-002 (or add a first US-002 criterion with equivalent dependency semantics), require a dated kickoff entry in `progress.txt`, and state that US-002 through US-006 cannot start without it. Update the graph/policy so US-002 depends on both passed US-001 and recorded kickoff.

### H-02 — The mandated critic output cannot satisfy US-001

**Story:** US-001 criteria 1–2
**Evidence:** Both PRD forms require each critic to record evidence in `assessment.md`; the current user instruction requires this critic's full standalone report **only** in `critique-prd.md` and forbids editing `assessment.md`.
**Impact:** A compliant critic run necessarily fails the written acceptance criterion, making the gate impossible to validate honestly.
**Exact remediation:** Change criterion 1 in both PRD forms to require `critic-prd-alignment` evidence and verdict in `.oh/tasks/pm2-pi-supervision/critique-prd.md`. Give the safety critic its own explicit task-local report path. If `assessment.md` needs a summary, assign that synthesis to `first-mate-gate` after both standalone reports exist; do not require critics to violate their bounded write contracts.

### H-03 — “Artifact validation happens now” has no acceptance criterion

**Story:** US-001
**Evidence:** US-001 asks for two topical critic verdicts, finding resolution, draft PR, kickoff ledger, and typecheck. It does not require validation of JSON syntax/core schema, the required task files, branch/base, artifact-only diff, all-false pass state, or cross-artifact gate consistency.
**Impact:** US-001 can be marked passed and a draft PR opened while malformed/stale execution artifacts remain. This is especially material because `prd.json` is authoritative to Ralph.
**Exact remediation:** Add mirrored US-001 criteria requiring: `jq empty prd.json`; required task artifacts exist; branch is `feat/677-pm2-pi-supervision`; every initial `passes` is false; PRD/JSON story and graph alignment has no unresolved H; prompt/assessment gate wording matches the latest kickoff order; and the draft PR diff is confined to `.oh/tasks/pm2-pi-supervision/` and targets `development`.

### H-04 — Planning is declared complete before its mandatory draft PR

**Story:** US-001 / current gate state
**Evidence:** `progress.txt` currently says `STATUS: PLANNING COMPLETE — AWAITING EXPLICIT KICKOFF`, while it records no critic verdicts, artifact-validation result, draft PR number/URL, target branch, or artifact-only diff proof. The latest hard gate says planning must **end** with that draft PR.
**Impact:** A downstream operator could treat the task as kickoff-ready although planning's terminal artifact is absent.
**Exact remediation:** Treat the existing status as superseded, not terminal. After all H findings are repaired and both critics plus artifact validation pass, create the draft PR, verify base `development` and task-folder-only changed paths, then append a new planning-complete entry containing both verdicts, validation evidence, PR URL/number, base, and changed-path proof. Do not record explicit kickoff until the user separately provides it.

### H-05 — Multiple stories violate Ralph's one-iteration sizing rule

**Stories:** US-003, US-004, US-005, US-006 (US-002 is also near the limit)
**Evidence:** Ralph's “number one rule” requires each story to fit one fresh context window. US-003 combines install/version/integrity, PM2 lifecycle, an RPC client, JSONL/frame parsing, extension authoring/injection, turn evidence, and full lifecycle measurements. US-004 contains two controls. US-005 runs five faults across every candidate and builds a complete evidence matrix. US-006 performs multidimensional ranking plus two independent critic reviews.
**Impact:** A fresh iteration can exhaust context or mark a broad story passed with partial evidence; final critics cannot independently run after their own deliverable is authored within the same atomic unit.
**Exact remediation:** Split stories into one-iteration units with explicit edges, at minimum: baseline fixture; baseline measurement; PM2/RPC launch and framing; extension API probe; direct-launch control; optional PTY control; fault-matrix automation/capture (split per candidate if evidence volume demands); comparative ranking; and a separate final-evidence/scope critic gate. Preserve dependency-first priorities and keep every `passes` false after regeneration.

### M-01 — Final critics are labels, not executable dependency nodes

**Story:** US-006 / task graph
**Evidence:** Markdown Mermaid has `US-006 → critic-evidence` and `US-006 → critic-scope`; JSON has only `reviewDelegates` on US-006 and `unlocks: []`. Ralph selects only `userStories` by priority and does not interpret `taskGraph` or `reviewDelegates`.
**Impact:** The First Mate can enforce this manually, but the authoritative machine task list has no independently passable final review step or terminal gate.
**Exact remediation:** After splitting H-05, make final review a separate user story/gate depending on the ranking story, with both named delegates, separate evidence paths/verdicts, resolution criteria, and First Mate validation before terminal completion. If `taskGraph` remains, include those nodes and their unlock/gate target.

### M-02 — Initial `notes` violate the Ralph converter contract

**Stories:** US-001–US-006
**Evidence:** `.oh/skills/ralph/SKILL.md` conversion rule 4 says all initial stories have `passes: false` and empty `notes`. All six `notes` fields are pre-populated.
**Impact:** The JSON is parseable and the runner does not reject it, but it is not schema-conformant initialization and leaves no clean distinction between planning metadata and iteration completion notes.
**Exact remediation:** Set every initial `notes` value to `""`. Keep dependency/delegate metadata solely in the graph (or explicit supported fields) and reserve `notes` for First Mate/Ralph completion summaries.

### M-03 — Critical non-goals are absent from authoritative story criteria

**Stories:** US-003–US-006 / scope
**Evidence:** Markdown forbids a persistent PM2 daemon, startup service, process dump, global install, added dependency, tmux replacement/removal, and cluster/load-balancing work. JSON does not state these boundaries; US-006 checks only a subset after experiments have already run.
**Impact:** A delegate following authoritative `prd.json` can broaden scope or cause persistence before the late final-state check.
**Exact remediation:** Add the relevant invariant to each execution story or an artifact-contract block: disposable `PM2_HOME`; local temporary install only; no startup/save/dump/global install/manifest edit; no cluster mode; no tmux removal; production paths and runtime immutable throughout, not merely clean at US-006.

### M-04 — Verification commands and evidence locations are under-specified

**Stories:** all
**Evidence:** Criteria say “Tests pass” and “Typecheck passes” without exact commands; several measurements say “recorded” without naming an evidence file/section or fixture test command. The optional artifact-contract schema supports `verification_commands`, but none is declared.
**Impact:** Different delegates can run different checks, and the First Mate lacks a deterministic command-to-criterion map.
**Exact remediation:** Name exact repo/fixture commands and expected exit codes for each story, identify the task-local evidence section/file for every measurement, and add them to `artifact_contract.verification_commands` or mirrored criteria. Do not use `... || true` as pass evidence.

### M-05 — “All commands run in a disposable directory” is over-broad

**Story:** US-002 criterion 1
**Evidence:** Literal wording includes repo typecheck/tests, task-artifact writes, and draft-PR inspection, which cannot all occur inside a disposable benchmark directory.
**Impact:** The criterion is either impossible literally or inconsistently interpreted.
**Exact remediation:** Change it to “all benchmark, process-launch, fault-injection, and PM2 commands run with cwd and mutable homes inside the disposable directory”; explicitly exempt read-only source inspection, repo quality checks, task-artifact writes, and GitHub draft-PR validation.

### M-06 — Current-surface comparison can be read as permission to inspect production runtime files

**Story:** US-005 criterion 4 versus US-002 criterion 1
**Evidence:** US-002 prohibits reading existing gateway state/log/lock/config except read-only source inspection; US-005 asks to compare PM2 output/logs with “current state/heartbeat/log surfaces” without saying the current side is source-derived or a disposable baseline.
**Impact:** A benchmark delegate may read production heartbeat/state/log files to satisfy the comparison, violating isolation.
**Exact remediation:** State that the current side is derived only from inspected source and the disposable baseline fixture; explicitly prohibit reading live production session/state/heartbeat/log/lock files.

## Exact pass conditions for re-review

A subsequent `critic-prd-alignment` run may return PASS only when:

1. H-01 through H-05 are resolved in both `prd.md` and `prd.json` (and the gate text in the other task artifacts is consistent).
2. The regenerated JSON is valid, all initial notes are empty, all pass flags are false, priorities are dependency-first, and final critics have an executable terminal gate.
3. Every markdown story/description/criterion/dependency/priority/delegate has a semantically identical authoritative JSON representation.
4. Critical scope boundaries are enforceable before and during execution, not checked only at the end.
5. Planning is not declared complete until both critics, artifact validation, and the task-artifacts-only draft PR to `development` are evidenced; kickoff remains a separate later gate for US-002 onward.

**Final verdict: FAIL (H5 / M6 / L0).**

## Re-review — 2026-08-01 02:07 UTC

**Scope:** Bounded re-review of the current `prd.md`, `prd.json`, `prompt.md`, `assessment.md`, both existing critic reports, and `progress.txt`; the original failure report above is preserved.

### Prior H/M remediation

| Prior finding | Result | Current evidence |
|---|---|---|
| H-01 kickoff attached to wrong gate | Resolved | US-001 closes critics, remediation, validation, commit/push, and the artifact-only draft PR. Distinct US-002 records a new explicit human kickoff, depends on US-001, and transitively blocks US-003–US-019. `prompt.md`, `assessment.md`, and `progress.txt` use the same order and prohibit inference. |
| H-02 critic output contract impossible | Resolved | US-001 assigns bounded full reports to `critique-prd.md` and `critique-safety.md`; only the First Mate synthesizes into shared artifacts. |
| H-03 artifact validation absent | Resolved | US-001 criteria now require exact branch/files, JSON syntax/schema/branch, all-false/all-empty initialization, sorted priorities, cross-artifact semantic parity, task-folder-only staging, and exact draft-PR verification. |
| H-04 premature planning-complete state | Resolved | `assessment.md` and the latest `progress.txt` entry explicitly supersede the historical status; both state planning remains incomplete pending both re-reviews, First Mate validation, and the artifact-only draft PR. No kickoff is recorded. |
| H-05 stories too large | Resolved | The former six broad stories are split into 19 dependency-first units: planning; kickoff; fixture contract; manifest; baseline; direct RPC feasibility; conditional wrapper; extension probe; two controls; five candidate-bounded fault runs; comparison; two terminal critics; and First Mate synthesis. Each unit has one principal deliverable/candidate and a bounded command/evidence path suitable for one fresh Ralph iteration. |
| M-01 terminal critics not executable | Resolved | US-017 and US-018 are independently passable stories after US-016; US-019 depends on both. The same nodes and edges exist in markdown, `taskGraph`, and `userStories`. |
| M-02 non-empty initial notes | Resolved | All 19 `notes` values are exactly `""`; all 19 `passes` values are `false`. |
| M-03 non-goals absent from authoritative JSON | Resolved | `artifactContract.executionContract` makes disposable homes/PM2 state, production immutability, no global/default PM2 operations, no tmux replacement, no cluster/modules/startup/save/resurrect, no added dependency, and no persistent daemon/service/dump mandatory throughout execution. |
| M-04 verification/evidence under-specified | Resolved | Every story names bounded verification commands and exact evidence paths; the root contract supplies shared code gates, exit-code policy, and `verification.jsonl` recording. |
| M-05 disposable-directory wording over-broad | Resolved | The contract confines benchmark/process/fault/PM2 work to the runtime root while explicitly allowing task-artifact work and read-only source inspection. |
| M-06 live-current-surface ambiguity | Resolved | The immutable boundary and US-005/US-016 restrict comparison to cited source and the disposable baseline and prohibit reading production runtime content. |

### Nineteen-story semantic parity

Automated extraction found exactly 19 markdown stories and 19 JSON stories. For every US-001–US-019 entry, ID, title, description, acceptance-criterion count and meaning, dependency list, assigned delegate, evidence path list, priority, and dependency-table row are semantically identical. Formatting-only differences are limited to markdown backticks/path qualification, `Section 3.x` references represented by `artifactContract`, and prose normalization such as `+` to `plus`. `taskGraph` story dependencies/delegates match `userStories`; priorities are unique, sequential 1–19, and topological. Every dependency is represented before its dependent, including the parallel terminal critics and US-019 join.

### Required gate checks

- **Ralph initialization:** `schemaVersion` is `1`; branch is `feat/677-pm2-pi-supervision`; IDs are sequential; all 19 `passes` are `false`; all 19 `notes` are empty; priorities are sorted dependency-first.
- **Kickoff sequencing:** no `KICKOFF issue=#677` record exists. US-002 requires a new post-US-001 human statement with quote/source/author/UTC and cannot infer authorization; US-003 depends on US-002, so all implementation remains blocked.
- **Exact US-001 planning gate:** both bounded critic PASS reports and remediation precede First Mate validation; only task-folder files may be staged; commit/push are branch-specific; the draft PR must be non-empty, draft, head `feat/677-pm2-pi-supervision`, base `development`, and contain only `.oh/tasks/pm2-pi-supervision/` paths. Planning is not currently represented as complete.
- **One-iteration sizing:** each story owns one bounded planning gate, authorization gate, fixture/protocol artifact, candidate/topology/control run, candidate-specific fault run, comparison, critic report, or synthesis. Conditional infeasibility is an explicit safe `NOT RUN`, preventing a story from silently expanding into fallback work.
- **Artifact consistency:** `prompt.md`, `assessment.md`, and the latest `progress.txt` state agree with the PRD/JSON gate order, isolation contract, candidate separation, evidence rules, and no-decision boundary. `jq` parsing and `git diff --check -- .oh/tasks/pm2-pi-supervision` succeeded during re-review.

No unresolved high-, medium-, or low-severity alignment finding remains. This PASS approves planning-artifact correctness only; it does not mark US-001 passed, create/approve the draft PR, record kickoff, or authorize implementation.

Final verdict: PASS (H0 / M0 / L0).

## Final re-review — 2026-08-01

Verified all 19 stories in `prd.md` and `prd.json`: each now contains exactly one objective, semantically matching `Typecheck passes` criterion requiring `timeout 180s pnpm typecheck` to exit `0` from the worktree root and recording stdout/stderr, UTC start/end, and exit code in the story evidence path. Comparison with the preserved 02:07 re-review inventory confirms the addition changed no story IDs, titles, descriptions, dependencies, delegates, priorities, `passes`, or `notes`.

Final verdict: PASS (H0 / M0 / L0).
