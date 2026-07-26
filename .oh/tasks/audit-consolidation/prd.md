# PRD: Consolidate Audit Surfaces Under `/audit`

## 1. Introduction

Open Harness has a coherent audit family but a fragmented public interface. The current `/audit` command is a one-implementation verdict gate, while `/pr-audit`, `/harness-audit`, `/context-audit`, `/skill-lint`, `/eval-lint`, and `/drift-check` expose adjacent audit targets through unrelated names. A separate `auditor` agent already acts as an informal dispatcher, but its seven-surface registry omits `/eval-lint`, contains stale redirects, and duplicates routing knowledge that belongs in a user-facing command.

Consolidate these surfaces behind a thin target dispatcher:

```text
/audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> <request>
```

The dispatcher must route rather than merge semantics. Each target retains one authoritative reference, its native verdict vocabulary, its existing safety boundary, and its target-specific resources. The migration is a clean breaking replacement: remove superseded audit entry points and the `auditor` agent without compatibility aliases, while retaining independent instruments whose semantics are not audits (`/eval`, `/benchmark`, `/ci-status`, `/health-check`, `/critique`, `/approve`, `/watchdog`, and `/wiki lint`).

## 2. Problem Statement

The current family has five concrete problems:

1. **Discoverability:** users must know whether a request maps to `audit`, `pr-audit`, `harness-audit`, `context-audit`, `skill-lint`, `eval-lint`, or `drift-check`.
2. **Naming collision:** `/audit` means only “one implementation versus one spec,” despite audit being the natural family namespace.
3. **PR contract gaps:** `/audit` and `/ship-spec` require a focused PR classification, and `/sync` passes `--repo`, but `/pr-audit` declares neither `--pr` nor `--repo` in its public interface.
4. **Prose coupling:** workflow gates consume `/pr-audit` prose instead of a stable machine-readable promotability result.
5. **Registry drift:** `.oh/agents/auditor.md` hard-codes a seven-surface taxonomy, omits `/eval-lint`, redirects diff review to a nonexistent `/code-review` skill, and can double-log or hit nested-agent limits when it wraps agent-spawning audits.

## 3. Goals

- Provide one memorable audit namespace with exactly nine explicit targets.
- Rename the existing implementation gate to `/audit implementation` while preserving `AUDIT-PASS` and `AUDIT-FAIL` exactly.
- Decompose PR auditing into reusable acquisition, pure classification, rendering, evidence escalation, and explicitly gated action layers.
- Add first-class focused-PR and repository targeting with frozen CI and readiness semantics.
- Preserve each audit target's native verdicts instead of flattening all results into generic PASS/FAIL.
- Make default audit behavior report-only. Disclosed local writes are limited to remote-ref fetches, invocation-scoped temporary/recovery state, `/eval`'s canonical scoreboard, and one canonical memory log; explicit context baselines, wiki ingest, PR actions, and external-proposal issue writes remain opt-in.
- Correlate a full campaign under one run identity while preserving cross-target prioritization and Recommended Next 3 Actions synthesis.
- Remove duplicate routing knowledge and superseded public entry points.
- Migrate every active caller, path, trigger, log contract, CI shellcheck list, probe, document, and template in one clean-breaking consolidation PR.

### 3.1 Protected-path stacked prerequisite

Protected-path migration is owned by stacked parent PR [#648](https://github.com/mifunedev/openharness/pull/648). It records the replacement rationale in `CHANGELOG.md`, removes only the superseded `harness-audit`, `skill-lint`, `eval-lint`, and `drift-check` names from `.claude/protected-paths.txt`, and protects `audit`.

The consolidation PR must remain based on PR #648's head branch until #648 merges, and its implementation evidence must show that #648's protected-path commit is in the consolidation branch ancestry before any superseded protected entry point is deleted. The child must not duplicate or bypass #648's policy edits. When #648 merges, retarget the consolidation PR to `development` without splitting the clean-breaking migration. This stacked prerequisite is the only staged dependency; all consolidation-owned command, caller, resource, documentation, wiki, CI, and probe changes remain one atomic child PR.

## 4. Public Interface

### 4.1 Command grammar

| Invocation | Owned target | Native result |
|---|---|---|
| `/audit implementation <slug> [--pr N] [--branch B]` | One implementation versus `.oh/tasks/<slug>/prd.json` | `AUDIT-PASS` / `AUDIT-FAIL` |
| `/audit pr <N> [--repo O/N] [--deep] [--proof] [--dry-run]` | One PR's metadata, CI, mergeability, draft readiness, and convention state | `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` / `PR-AUDIT-UNKNOWN` |
| `/audit prs [--repo O/N] [--label L] [--author A\|--mine] [--base B] [--stale-days N] [--deep] [--apply proof\|labels\|close]... [--close-stale-days N] [--dry-run]` | Whole open-PR queue | Native bucket report plus `PRS-AUDIT-COMPLETE` / `PRS-AUDIT-PARTIAL` |
| `/audit harness [--focus area] [--external URL\|path] [--wiki-ingest] [--apply issue] [--confirm] [--dry-run]` | Whole-harness four-perspective survey or explicit external-proposal decision audit | Existing Tier 1/2/3 findings and Recommended Next 3 Actions |
| `/audit context [all\|--baseline\|--ablate file]` | Default-loaded context budget | `KEEP` / `TRIM` / `DEMOTE` / `CUT`; ablation verdict unchanged |
| `/audit skills [all\|root\|workspace\|name]` | Skill staleness and integrity | `CURRENT` / `STALE` / `BROKEN` / `DELETE` |
| `/audit eval-quality [all\|probes\|capability\|id]` | Probe and capability-instrument quality | `KEEP` / `GROOM` / `CUT` |
| `/audit drift` | Framework, branch, working-tree, and cron drift | Existing per-class `OK` and aggregate `DRIFT:` output |
| `/audit full [--focus area] [--health-target "target"]` | Multi-target harness audit campaign; optional read-only host evidence from `/health-check` | Correlated, provenance-tagged native verdicts plus `AUDIT-CAMPAIGN-COMPLETE` / `AUDIT-CAMPAIGN-PARTIAL` |

These are the approved nine public targets. Acquisition, classification, rendering, logging, recovery, and external-proposal helpers are private implementation modules, not additional targets or aliases.

### 4.2 Canonical usage and trigger matrix

Every invalid invocation prints this exact first line followed by the §4.1 table:

```text
usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]
```

The dispatcher frontmatter and routing probes must preserve these canonical trigger families:

| Target | Canonical direct use | Representative natural-language triggers |
|---|---|---|
| `implementation` | `/audit implementation <slug>` | audit this task; verify this implementation; is this build promotable |
| `pr` | `/audit pr <N> [--repo O/N]` | audit PR N; classify this pull request; can this draft be readied |
| `prs` | `/audit prs [filters]` | audit open PRs; triage the PR queue; which PRs are stuck |
| `harness` | `/audit harness [--focus area]` | audit the harness; find harness improvements; what should we fix |
| `context` | `/audit context [mode]` | audit context budget; what is in default context; ablate this context file |
| `skills` | `/audit skills [scope]` | audit skills; find stale or broken skills; skill health |
| `eval-quality` | `/audit eval-quality [scope]` | lint evals; find Goodharted probes; audit capability tasks |
| `drift` | `/audit drift` | check framework drift; branch-behind drift; cron staleness |
| `full` | `/audit full` | run a full audit campaign; audit everything; cross-target next actions |

Free-form prose may trigger the skill, but target selection after invocation remains explicit: the dispatcher never guesses a missing first-token target.

### 4.3 Dispatch and action behavior

- Missing subcommand, unknown subcommand, or a target lacking required arguments must print the exact canonical usage and table, then stop before reading a target reference, creating `AUDIT_RUN_ID`, or changing state.
- The dispatcher reads exactly one route reference for the selected public target. A route reference may load explicitly named private supporting references/scripts. `implementation` may use shared PR acquisition/classification, and `full` may invoke selected target references under one `AUDIT_RUN_ID`; private modules cannot be invoked as public targets or re-own rendering semantics.
- The dispatcher runs inline, inherits the current session model, and never normalizes one target's native verdict into another target's vocabulary.
- `harness --external <url|path>` selects the external-proposal decision protocol and is mutually exclusive with `--focus`. It is report-only by default: it may recommend issue creation/update but performs no GitHub issue write. `--wiki-ingest` is valid only with `--external` and explicitly composes `/wiki ingest` before the decision audit.
- Any external-proposal issue create, comment, edit, or label write requires `--external ... --apply issue --confirm`. The route must first print the exact issue create-or-update choice, repository, title/number, body/comment summary, and labels. `--apply issue --dry-run` prints the same plan and performs no write; `--apply issue` without `--confirm` stops after preview. `--confirm`, `--apply issue`, and issue writes are invalid in ordinary harness-survey mode.
- `full` composes in cost order: `drift → eval → skills + eval-quality + context → harness → prs`; `--health-target` additionally composes `/health-check "<target>" --dry-run` as an adjacent instrument.
- `full` runs from the top-level session. If already nested and a selected target requires sub-agents, emit its exact deferred invocation and classify the campaign `PARTIAL`; never pretend the nested fan-out ran. `COMPLETE` means every selected target executed with complete evidence, not that every native verdict was healthy; a regression, `CUT`, or drift finding alone does not make the campaign partial.

### 4.4 Consolidation boundary

| Current surface | Decision | New owner / reason |
|---|---|---|
| `/audit` implementation gate | Consolidate and rename | `/audit implementation`; preserve workflow tokens |
| `/pr-audit` | Consolidate and decompose | `/audit pr` + `/audit prs` with shared private acquisition and pure classifier |
| `/harness-audit` | Consolidate | `/audit harness` |
| `/context-audit` | Consolidate | `/audit context` with resources moved intact |
| `/skill-lint` | Consolidate | `/audit skills` |
| `/eval-lint` | Consolidate | `/audit eval-quality`; disambiguates it from executing `/eval` |
| `/drift-check` | Consolidate | `/audit drift` |
| `auditor` agent | Remove | `/audit full` owns routing and synthesis inline |
| `/eval` | Retain and compose | Regression-floor instrument; updates its scoreboard |
| `/health-check` | Retain and optionally compose | Sole host-readiness/reclaim owner; audit campaigns use dry-run only |
| `/benchmark` | Retain | Progress-ceiling/counterfactual gate, not an audit target |
| `/ci-status` | Retain | CI data/polling instrument |
| `/critique` + `/approve` | Retain | Spec evidence and commitment gate |
| `/wiki ingest` + `/wiki lint` | Retain under `/wiki` | Corpus-owned capture, maintenance, and index generation; composed ingest honors child-log suppression |
| `/watchdog` | Retain | Operational detection plus remediation |

## 5. Target Architecture

```text
.oh/skills/audit/
├── SKILL.md                         # thin public dispatcher
├── references/
│   ├── implementation.md           # current per-unit gate
│   ├── pr.md                        # one PR
│   ├── prs.md                       # queue triage
│   ├── harness.md                   # whole-harness survey
│   ├── context.md                   # context score/ablation protocol
│   ├── skills.md                    # skill staleness protocol
│   ├── eval-quality.md              # anti-Goodhart protocol
│   ├── drift.md                     # drift protocol
│   ├── full.md                      # campaign composition/synthesis
│   ├── pr-classification.md         # shared PR state definitions
│   └── external-proposal-audit.md   # harness-survey special case
├── scripts/
│   ├── pr-acquire.sh                # private GitHub acquisition; JSON envelope out
│   ├── pr-classify.sh               # pure JSON-in/JSON-out classifier
│   └── context-audit-runner.sh      # migrated context oracle; shared ablation state machine caller
├── fixtures/
│   └── artifact-contract.prd.json   # migrated implementation fixture
└── probes/context/                  # six migrated context behavioral probes
```

Each public target has one authoritative route reference. `pr-acquire.sh`, `pr-classify.sh`, the context runner, and supporting references are private: they have no skill frontmatter, trigger, provider link, or dispatcher case. `/health-check` remains the sole owner of host readiness and reclaim; a full campaign may only compose its explicit dry-run mode. Shared ablation swap/restore/recovery remains owned by `.oh/scripts/ablate.sh`, outside the audit target tree, so `/audit context` and `/eval` use one state machine rather than forked backup logic.

## 6. PR Audit Decomposition

### 6.1 Target selection

Normalize arguments into:

```json
{
  "repo": "owner/name",
  "mode": "pr | prs",
  "pr": 123,
  "label": null,
  "author": null,
  "base": null,
  "staleDays": 14
}
```

`--repo` must validate `owner/name`. `pr` requires a positive PR number. Queue filters are valid only for `prs`; invalid combinations fail closed.

### 6.2 Private shared acquisition

`.oh/skills/audit/scripts/pr-acquire.sh` is the single private acquisition seam for `pr`, `prs`, `implementation`, and fresh pre-action checks. It accepts validated normalized arguments, performs network reads only, and emits the versioned classifier input envelope; it never classifies, renders, logs, comments, labels, closes, readies, or merges.

- `pr` performs one `gh pr view N --repo O/N --json ...` call through `pr-acquire.sh`.
- `prs` performs one `gh pr list --state open --repo O/N --limit 200 --json ...` call through `pr-acquire.sh`.
- The acquired field list is frozen and shared by focused and queue modes; fixture tests fail if readiness/classification-required fields are omitted.
- If a queue result reaches the configured limit, mark the snapshot `truncated: true`, disclose incomplete coverage, and emit `PRS-AUDIT-PARTIAL`; never claim whole-queue completeness from a capped result.
- Autopilot cap-headroom may require one separately disclosed aggregate query only when the `autopilot` label is selected.
- Store snapshots in `mktemp`-created invocation-scoped paths beneath `${TMPDIR:-/tmp}`, include `AUDIT_RUN_ID` in the diagnostic basename, and clean them with `trap`; never use a shared `/tmp/pr-audit.json`.
- Acquisition failure yields `UNKNOWN`/`PARTIAL`, never a silent clean result.
- `PRS-AUDIT-COMPLETE` requires successful acquisition and classification of every selected PR. Truncation, malformed records, acquisition failure, or a requested deep review that fails to return required evidence yields `PRS-AUDIT-PARTIAL`.

### 6.3 Pure classification

`.oh/skills/audit/scripts/pr-classify.sh` must accept a versioned envelope on stdin and emit deterministic JSON without network calls, mutations, wall-clock reads, or environment-derived defaults:

```json
{
  "schemaVersion": 1,
  "observedAt": "2026-07-17T12:00:00Z",
  "repo": "owner/name",
  "mode": "pr",
  "options": {
    "staleDays": 14,
    "expectedBase": "development",
    "maxChangedFiles": 50
  },
  "prs": []
}
```

Identical input must produce byte-identical output. The classifier owns:

1. CI normalization into the closed output enum `PASS | FAIL | PENDING | NONE | UNKNOWN` using this exact precedence and raw-value allowlist:
   - `FAIL` when any rollup item has conclusion/state `ACTION_REQUIRED`, `CANCELLED`, `ERROR`, `FAILURE`, `STARTUP_FAILURE`, `STALE`, or `TIMED_OUT`.
   - Otherwise `PENDING` when any item has status/state `EXPECTED`, `IN_PROGRESS`, `PENDING`, `QUEUED`, `REQUESTED`, or `WAITING`.
   - Otherwise `NONE` only when `statusCheckRollup` is present and empty.
   - Otherwise `PASS` only when every non-empty item is terminal `SUCCESS`, `NEUTRAL`, or `SKIPPED`.
   - Otherwise `UNKNOWN`; a missing/non-array rollup, null item, unrecognized value, contradictory shape, or malformed record sets `evidenceComplete: false`. No newly observed GitHub enum is accepted until this PRD contract and fixtures are deliberately updated.
2. PR age calculation from `observedAt`, never `now`.
3. Title, base, and size convention checks.
4. Issue-reference extraction from linked metadata, branch, title, and body.
5. Duplicate issue-reference grouping for queue mode.
6. One first-match primary state per PR: draft, CI failing, conflicting/behind, changes requested, needs review, ready, pending/other.
7. Draft sub-status: `promotable`, `wip`, or `null`.
8. Orthogonal stale, convention, duplicate-reference, and draft-limbo flags. Limbo is not a competing readiness state: a stale green/clean draft remains `draftStatus: "promotable"`, `draftLimbo: true`, `readyForReview: true`, and `promotable: true`.

Readiness semantics are frozen and distinct:

- `readyForReview` is true only for a draft with `ci == PASS`, raw `mergeable == MERGEABLE`, raw `mergeStateStatus == CLEAN`, and complete evidence. It means the draft is eligible for a workflow owner to mark ready; it never means merge approval exists and the audit never performs the transition.
- `readyToMerge` is true only for a non-draft satisfying the same CI/merge/clean/evidence conditions and `reviewDecision` in `{APPROVED, "", null}`. Empty/null is the explicit solo-repository state where no review is required; `REVIEW_REQUIRED` and `CHANGES_REQUESTED` are blocking, and any other value is unknown/incomplete.
- `promotable` is the compatibility machine seam and equals `readyForReview || readyToMerge`. A draft can never be `readyToMerge`; a non-draft can never be `readyForReview`. Primary `ready` requires `readyToMerge`.

The focused result schema must include at least:

```json
{
  "schemaVersion": 1,
  "repo": "owner/name",
  "number": 123,
  "isDraft": true,
  "primaryState": "draft",
  "draftStatus": "promotable",
  "draftLimbo": false,
  "ci": "PASS",
  "mergeable": "MERGEABLE",
  "mergeStateStatus": "CLEAN",
  "reviewDecision": "",
  "flags": [],
  "readyForReview": true,
  "readyToMerge": false,
  "promotable": true,
  "evidenceComplete": true
}
```

`NONE`, `UNKNOWN`, missing fields, API errors, and ambiguous values cannot set either readiness boolean or `promotable` true. Focused and queue output envelopes must both carry `schemaVersion: 1`; queue output additionally carries `truncated`, per-state counts, and one classified record per acquired PR. Fixtures cover every listed CI raw enum, all unknown-value fallbacks, and the mutual exclusion and review-decision truth table for `readyForReview` versus `readyToMerge`.

### 6.4 Rendering

- `pr` renders one compact evidence table and the stable focused token.
- `prs` preserves actionability-ordered sections, a separate non-actionable draft section, flag rollup, and summary counts.
- Markdown rendering consumes classifier JSON; it does not re-derive state.
- Classifier JSON is the sole machine seam. `/audit implementation` invokes the same private acquisition-plus-classifier path as `/audit pr`, reads only `.promotable`, `.readyForReview`, `.readyToMerge`, and `.evidenceComplete`, and never parses Markdown or routing tokens. Human-facing tokens remain downstream render output.

### 6.5 Deep evidence

`--deep` is a separate bounded escalation layer. It may fan out at most five root-cause reviewers for CI-failing, conflicting, or changes-requested targets. It must not change baseline classification. Diff-level correctness remains outside the audit family; if no registered review skill exists, state that boundary without inventing an invocation.

### 6.6 Explicit actions

Default `pr` and `prs` modes are report-only. Preserve outward-facing actions only behind explicit flags:

- `pr --proof` posts or updates one idempotent proof comment after confirmation.
- `prs --apply proof|labels|close` is repeatable, allowing explicit combinations while keeping each action independently previewed and confirmed.
- Proof writes preserve the existing `<!-- pr-audit-proof -->` marker so reruns update rather than stack comments.
- `close` uses `--close-stale-days N` (required with that action), skips non-stale targets, and prints the complete close set before confirmation.
- Label application skips and reports labels absent from the repository rather than creating them silently.
- `--dry-run` prints exact intended writes and performs none.
- No audit subcommand may call `gh pr ready` or `gh pr merge`; workflow owners, including `/watchdog`, must consume a fresh shared focused classification immediately before acting.

## 7. Effects, Recovery, Correlation, and Logging Contract

### 7.1 Effects by target

| Target | Default effects beyond reads | Explicit opt-in effects |
|---|---|---|
| implementation | `/eval` scoreboard update, invocation-scoped evidence, one dispatcher memory log | conditional browser verification after a non-mutating preflight |
| pr / prs | remote API reads, invocation-scoped snapshot, one dispatcher memory log | proof comment, labels, stale close after preview/confirmation |
| harness | sub-agent reads, one dispatcher memory log; external mode is still report-only | external wiki ingest; issue create/update/comment/labels only with `--apply issue --confirm` |
| context | temporary swap/recovery state with guaranteed restore, one dispatcher memory log | durable baseline under gitignored memory |
| skills / eval-quality | one dispatcher memory log | none |
| drift | remote-ref fetch, one dispatcher memory log | none |
| full | union of selected read effects, `/eval` scoreboard update, one campaign memory log | host reads only when `--health-target` is supplied; no reclaim |

The conditional implementation browser gate begins with a non-mutating preflight: verify the registered `agent-browser` command and Chromium launch using an invocation-scoped temporary profile, then clean that profile. Preflight must not install/download/repair packages, navigate to the application, write the repository, or touch GitHub. A preflight failure records evidence and fails the required browser gate before navigation; non-UI stories do not run it.

Canonical scoreboards, configured logs, explicit context baselines, temporary snapshots/browser profiles, and ablation recovery state are disclosed local state writes rather than outward-facing remediation. FR-8's preview/confirmation requirement applies to outward-facing or destructive mutations.

### 7.2 One ablation lock/sentinel state machine

`.oh/scripts/ablate.sh` remains the sole owner of target canonicalization, allow/deny validation, backup naming, per-target locking, sentinel transitions, signal traps, restore, and crash recovery. The migrated context runner and `.oh/skills/eval/run.sh` must call/source that API; neither may parse `.oh/evals/.ablation-active`, move a `.bak`, or implement an independent recovery branch.

The state machine is one versioned record per canonical target with ordered phases `PREPARED → SWAPPED → RESTORING → cleared`. It acquires the canonical-target lock before checking backup/sentinel state and holds it through successful restoration and sentinel cleanup. Startup recovery calls the same `ablate_recover` path, under the same lock, before `/eval` or context ablation proceeds. Unknown/corrupt phases, a backup without a matching sentinel, a sentinel without its expected backup, a target outside `AUDIT_ROOT`, a disallowed target such as `CLAUDE.md`, or same-target lock contention fail closed without overwriting either copy. `EXIT`, `INT`, `TERM`, and `HUP` all enter `RESTORING`; `SIGKILL` recovery is completed by the next `/eval` or `/audit context` startup. Different targets may run concurrently only when their records and locks are independent.

### 7.3 Root and child-log propagation

After argument validation, the outer dispatcher resolves and exports immutable roots once:

- `AUDIT_ROOT`: the canonical `git rev-parse --show-toplevel` of the invoking checkout (or validated `CRON_WORKTREE` checkout). Every source, fixture, probe, and temp-target path resolves from this root; no route reference hard-codes `/home/sandbox/harness` or re-detects another worktree.
- `AUDIT_LOG_ROOT`: the configured shared runtime/log checkout (`AUTOPILOT_LOG_ROOT` when valid, otherwise the main worktree root discovered from `AUDIT_ROOT`). Only configured memory/log artifacts resolve here; source and `/eval` scoreboard writes remain under `AUDIT_ROOT`.

Every audit reference, private script, sub-agent brief, and retained composed instrument receives both variables. `/eval`, `/health-check`, and `/wiki ingest` must be migrated to honor audit child mode: direct invocations retain their existing log behavior, but when invoked with an inherited `AUDIT_RUN_ID` they return a structured observation to the dispatcher and suppress their own memory append/retro. The outer dispatcher performs exactly one locked append under `AUDIT_LOG_ROOT` after final synthesis, including failure/partial outcomes; no child writes a second audit log.

### 7.4 `AUDIT_RUN_ID` lifecycle

1. Invalid usage exits before an ID or files are created.
2. The outermost valid `/audit` invocation generates one opaque ID matching `audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+`, exports it with `AUDIT_ROOT` and `AUDIT_LOG_ROOT`, and records `startedAt`. There is no public `--run-id` flag.
3. Every child target, private script, composed instrument, sub-agent prompt, temp diagnostic, finding, action preview, and log observation carries that exact immutable ID. An inherited ID means child mode and must never be replaced or logged independently.
4. The outer dispatcher records each selected target as `complete`, `partial`, `deferred`, or `failed`, then emits one terminal campaign/direct-target record and one locked memory append. Action re-acquisition remains in the same run but is labeled `freshPreAction: true`.
5. On exit, traps remove invocation-scoped temporary files. The environment dies with the process; an ID is never persisted as a default or reused by a later direct invocation.

### 7.5 Full-campaign synthesis preservation

`/audit full` is more than sequential output. It must retain every native result and additionally emit a campaign envelope keyed by `AUDIT_RUN_ID` with target, evidence path/source, completion state, severity/effort when available, and cross-target correlation keys. Synthesis must:

1. preserve provenance while deduplicating the same root cause across targets;
2. use the existing harness matrix (`Tier 1: Fix Now`, `Tier 2: Build Next`, `Tier 3: Design Decisions Needed`) without rewriting native verdicts;
3. order within a tier by evidence completeness, severity (`H → M → L`), then effort (`S → M → L`), and state any unscorable item rather than inventing a score;
4. retain the campaign-wide **Recommended Next 3 Actions**, each as a concrete action with owning target(s), cited evidence, and gating/dependency note; and
5. on `AUDIT-CAMPAIGN-PARTIAL`, synthesize only complete evidence, list every missing/deferred target and exact rerun, and visibly qualify the ranking and Next 3 Actions as partial rather than omitting synthesis or implying coverage.

## 8. User Stories

### US-001: Add the target dispatcher

**Description:** As an operator, I want one `/audit` namespace so I can select the object being audited without memorizing unrelated command names.

**Acceptance Criteria:**

- [ ] `.oh/skills/audit/SKILL.md` accepts exactly the nine public targets in §4.1; no helper has public frontmatter, a provider link, or a dispatcher case.
- [ ] Empty, unknown, and missing-required-argument invocations print the exact §4.2 usage line/table and make no target-side changes or run ID.
- [ ] Each valid target maps to exactly one authoritative route reference.
- [ ] The dispatcher runs inline, inherits the session model, and preserves native verdicts.
- [ ] Frontmatter and help text implement the canonical direct-use/trigger matrix in §4.2, including full-campaign synthesis triggers.
- [ ] A deterministic eval probe guards all nine routes, representative natural-language triggers, argument failure, reference existence, exact usage, private-helper non-routing, and no-alias behavior.

### US-002: Extract reusable PR acquisition and classification

**Description:** As a workflow author, I want a focused and machine-readable PR audit result so promotability gates do not parse queue-wide prose.

**Acceptance Criteria:**

- [ ] `/audit pr N --repo O/N` is a declared, working interface, and `/audit prs --repo O/N` supports the existing queue filters.
- [ ] Private executable `pr-acquire.sh` owns focused/queue acquisition, uses one appropriately scoped GitHub query per mode, emits the versioned input envelope, and exposes no public target.
- [ ] Temporary snapshots are invocation-scoped, include `AUDIT_RUN_ID` in diagnostics, are trap-cleaned, and remain isolated under concurrent runs.
- [ ] `pr-classify.sh` is network-free, mutation-free, deterministic, JSON-in/JSON-out, and fixture-tested.
- [ ] Existing primary-state ordering, draft sub-status, stale/convention flags, and duplicate issue-reference behavior remain covered.
- [ ] Fixtures exhaust the frozen CI enum/precedence contract and fail unknown or malformed values closed.
- [ ] `readyForReview`, `readyToMerge`, and compatibility `promotable` satisfy the §6.3 truth table; missing/ambiguous CI, mergeability, or clean state and unknown review values cannot produce readiness, while explicit empty/null review decisions preserve solo-repository readiness.
- [ ] Focused mode emits the stable tokens defined in §4.1.

### US-003: Move the implementation gate under `/audit implementation`

**Description:** As `/spec execute`, I want the existing per-unit gate under an explicit target so the audit namespace can expand without changing routing semantics.

**Acceptance Criteria:**

- [ ] Existing task-graph, artifact-contract, eval, PR-promotability, and conditional browser gates are preserved in order.
- [ ] Final `AUDIT-PASS` and `AUDIT-FAIL` tokens remain byte-for-byte unchanged.
- [ ] Gate 3 consumes shared focused classifier JSON readiness/evidence fields rather than legacy queue prose or rendered routing tokens.
- [ ] A UI-required story runs the §7.1 non-mutating browser preflight before navigation; missing browser/Chromium fails the gate without install, repair, repo writes, or GitHub writes, while a non-UI story never invokes preflight.
- [ ] The source fixture `.oh/skills/audit/references/artifact-contract-fixture.prd.json` and probe `.oh/evals/probes/artifact-contract-audit.sh` move to their §5 canonical paths and still exercise the real implementation block.
- [ ] `/spec execute` and all other per-unit callers use `/audit implementation`.

### US-004: Migrate audit-family owners without semantic flattening

**Description:** As a maintainer, I want each existing audit algorithm preserved behind the shared namespace so consolidation does not erase useful specialization.

**Acceptance Criteria:**

- [ ] Harness, context, skill, eval-quality, and drift protocols move to their named authoritative references with supporting resources preserved.
- [ ] Their existing verdict vocabularies and fail-closed conditions remain unchanged.
- [ ] `/audit full` composes the cost-ordered campaign in §4.3, correlates every result under one `AUDIT_RUN_ID`, and emits the §7.5 tier prioritization plus Recommended Next 3 Actions without flattening native verdicts.
- [ ] `/audit full` includes `/eval` as a composed regression-floor instrument but does not absorb or remove `/eval`.
- [ ] Nested-agent constraints yield `AUDIT-CAMPAIGN-PARTIAL` with exact deferred invocations and a visibly qualified synthesis from complete evidence only.
- [ ] The external-proposal pattern migrates from `.oh/skills/harness-audit/references/external-proposal-implementation-audit.md` and remains reachable only through `/audit harness --external <url|path>`.
- [ ] External mode is report-only by default. `--wiki-ingest` cannot run in survey mode, and every issue create/update/comment/label requires the exact preview, `--apply issue --confirm`, fresh duplicate check, and dry-run behavior in §4.3.

### US-005: Preserve safety, root, recovery, and logging boundaries

**Description:** As an operator, I want audits to remain observational by default and recovery/logging to be single-owner so asking for evidence cannot unexpectedly remediate, corrupt, or double-record state.

**Acceptance Criteria:**

- [ ] `/health-check` remains the sole host-readiness/reclaim owner; `/audit full --health-target "target"` composes `/health-check "target" --dry-run` and never prunes cache.
- [ ] PR comments, labels, closes, and external-proposal issue writes require explicit actions, complete previews, and confirmation; dry-run writes nothing and no audit target undrafts or merges a PR.
- [ ] `.oh/scripts/ablate.sh` and `/eval` startup recovery are refactored into the one §7.2 lock/sentinel state machine; the context runner and eval runner contain no independent backup, sentinel parser, or restore implementation.
- [ ] Target canonicalization, outside-root/disallowed rejection, state-phase validation, same-target contention, different-target concurrency, `EXIT`/`INT`/`TERM`/`HUP` restoration, and simulated `SIGKILL` startup recovery are fixture-tested; every test verifies target bytes and sentinel/backup/lock cleanup.
- [ ] The outer dispatcher resolves and exports `AUDIT_ROOT`/`AUDIT_LOG_ROOT`; route references, private scripts, sub-agent briefs, `/eval`, `/health-check`, and `/wiki ingest` consume the propagated values without hard-coded root fallback.
- [ ] The §7.4 run-ID lifecycle is probe-guarded for invalid usage, child inheritance, immutable correlation, direct-run uniqueness, temp cleanup, and fresh pre-action classification.
- [ ] Direct `/eval`, `/health-check`, and `/wiki ingest` invocations still log normally; composed children suppress their append/retro and return observations. One audit invocation, including partial/failure, produces exactly one locked append under `AUDIT_LOG_ROOT`.
- [ ] Effects are documented per target and default report-only behavior, including external harness mode, is probe-guarded.

### US-006: Remove legacy entry points and migrate callers atomically

**Description:** As a maintainer, I want one active audit vocabulary so documentation and automation cannot drift between aliases.

**Acceptance Criteria:**

- [ ] Stacked parent PR #648 remains the consolidation PR base until merged, and ancestry evidence confirms its protected-path commit is present before superseded protected entry points are deleted.
- [ ] Remove `/pr-audit`, `/harness-audit`, `/context-audit`, `/skill-lint`, `/eval-lint`, and `/drift-check` as public skill entry points without compatibility aliases; remove `.oh/agents/auditor.md`.
- [ ] Retain `/eval`, `/benchmark`, `/ci-status`, `/health-check`, `/critique`, `/approve`, `/watchdog`, `/wiki ingest`, and `/wiki lint` as separate surfaces.
- [ ] Execute internal ordered batches: **A** private PR/root/run/log/recovery primitives; **B** nine target references and moved resources; **C** every caller, doc, template, wiki entry/index, workflow, and probe; **D** legacy deletion plus stale-reference/clean-break verification. These are implementation ordering only: no batch may merge or expose aliases independently, and all four ship in one atomic consolidation PR.
- [ ] Before editing, record a repository-wide tracked active-reference inventory for every legacy invocation/path and canonical destination; after editing, rerun the same inventory and attach both results to PR evidence. The inventory covers source, skills, agents, provider prompts, templates, crons, workflows, docs, current task artifacts, capability tasks, and probes; it classifies migration-definition mentions separately from active advertised/invoked references.
- [ ] Update the explicit migration manifest: `.oh/scripts/link-providers.sh`, `.oh/skills.lock` plus retained license/provenance, `.oh/context/REPO_MAP.md`, `.pi/prompts/execute.md` and its template, `.oh/agents/advisor.md`, active crons, `AGENTS.md`, `.oh/templates/AGENTS.md`, `/benchmark`, `/eval`, `/health-check`, `/wiki`, `/watchdog`, `/teach`, `/render-html`, `/retro`, `/sync`, `/spec`, `/ship-spec`, `/autopilot`, active capability tasks `CB-001` and `CB-004`, and every named eval probe.
- [ ] Correct stale harness-survey paths during migration: `install/ → .oh/install/`, `scripts/ → .oh/scripts/`, `scripts/__tests__/ → .oh/scripts/__tests__/`, `context/ → .oh/context/`, and `docs/ → .oh/docs/`; replace nonexistent `/code-review` redirects with an honest scope boundary or a verified registered reviewer.
- [ ] Add a `CHANGELOG.md` breaking-migration table from every removed invocation to its `/audit` replacement. Historical changelog entries and explicit migration definitions may retain old names; no active guidance or executable call may advertise them.

### US-007: Migrate and strengthen regression coverage

**Description:** As a maintainer, I want consolidation guarded by behavior-level probes so moving files cannot silently weaken audit semantics.

**Acceptance Criteria:**

- [ ] Update existing auditor, PR duplicate-reference, artifact-contract, harness-audit, context, drift, health-boundary, sync, watchdog, workflow, memory, and wiki-log probes to canonical paths/invocations.
- [ ] Replace the frozen seven-skill auditor-agent probe with a dispatcher taxonomy/usage/trigger probe covering all nine targets, private-helper non-exposure, and retained separate instruments.
- [ ] Add fixtures for focused readiness, every frozen CI enum plus unknowns, draft WIP, stale-but-ready-for-review limbo, queue duplicates, byte-identical classifier output, implementation JSON consumption, browser preflight, run/root propagation, external issue dry-run/confirmation, ablation recovery/concurrency, and concurrent temp isolation.
- [ ] The stale-reference probe uses the repository-wide active inventory policy: it excludes historical `CHANGELOG.md` entries, immutable datasets, archived tasks, and generated `.oh/evals/RESULTS.md`; it allowlists explicit migration-definition text but covers every active source, skill, agent, prompt, template, cron, workflow, doc, current capability task, and probe.
- [ ] New shell scripts are executable and explicitly covered by shellcheck in both `.github/workflows/ci-harness.yml` and `.github/workflows/release.yml`; a deterministic probe fails when either workflow omits `.oh/skills/audit/scripts/*.sh` or `.oh/scripts/ablate.sh`.
- [ ] Provider-link validation and the wiki README index probe pass.
- [ ] Run focused script/fixture tests and the full eval suite with no new green-to-red regression.
- [ ] `git diff --check` passes and unrelated working-tree changes remain untouched.

## 9. Functional Requirements

- **FR-1:** `/audit` must dispatch by explicit first-token target; it must not infer a target from free-form prose.
- **FR-2:** The public target list is fixed to the nine values in §4.1; no private helper is a tenth target or compatibility alias.
- **FR-3:** Exactly one authoritative reference owns each target's behavior.
- **FR-4:** Private shared acquisition must be separate from pure deterministic classification and shared by `pr`, `prs`, and implementation PR evidence.
- **FR-5:** Focused PR classification must expose the versioned machine schema, frozen CI enum, distinct `readyForReview`/`readyToMerge` booleans, evidence completeness, and final routing token.
- **FR-6:** Existing native verdicts remain authoritative for implementation, harness, context, skills, eval-quality, and drift.
- **FR-7:** Default audit execution, including external-proposal mode, must not remediate or write GitHub issues.
- **FR-8:** Every outward-facing/destructive mutation requires explicit intent, exact preview, and confirmation; dry-run writes nothing.
- **FR-9:** `/audit full` must disclose skipped/deferred targets, correlate complete evidence, preserve deterministic prioritization and Recommended Next 3 Actions, and never infer success from missing output.
- **FR-10:** The outer dispatcher must own one locked memory append and prevent child logs from audit references, `/eval`, `/health-check`, and `/wiki ingest`.
- **FR-11:** Provider exposure must continue through canonical `.oh/skills` symlinks; no provider-specific copies.
- **FR-12:** The consolidation PR must be stacked on protected-path parent #648 until it merges, and all consolidation-owned migration batches must ship atomically in the child.
- **FR-13:** The dispatcher must resolve and propagate immutable `AUDIT_ROOT`, `AUDIT_LOG_ROOT`, and `AUDIT_RUN_ID` according to §7.
- **FR-14:** `.oh/scripts/ablate.sh`, `/eval` recovery, and context ablation must implement one locked, versioned sentinel state machine.
- **FR-15:** Conditional browser verification must fail closed after a non-mutating preflight; it must never self-install or self-repair.
- **FR-16:** Implementation evidence must include before/after repository-wide active-reference inventories, shellcheck coverage in CI and release workflows, and focused/full eval results.
- **FR-17:** The tracked wiki must contain an indexed audit-architecture entry describing ownership, effects, readiness, run/root lifecycle, and clean-breaking migration without duplicating target procedures.

## 10. Non-Goals

- Implementing diff-level code review under the audit namespace.
- Replacing `/eval`, `/benchmark`, `/ci-status`, or workflow decision gates such as `/approve`.
- Moving `/wiki lint` out of the wiki-owned namespace.
- Turning `/watchdog` remediation into an audit action.
- Normalizing all audit outcomes into one universal score or PASS/FAIL token.
- Adding backward-compatibility aliases for removed public audit commands.
- Adding a public tenth target for acquisition, classification, actions, recovery, logging, browser preflight, or synthesis.
- Automatically creating/updating an issue from an external-proposal report.
- Broadly rewriting historical changelog entries or archived task artifacts.
- Implementing this PRD before adversarial critique and approval.

## 11. Technical Considerations

- Move `.oh/skills/context-audit/runner.sh` and its six files under `.oh/skills/context-audit/probes/` atomically to the §5 destinations; all internal paths derive from `AUDIT_ROOT`.
- Move `.oh/skills/harness-audit/references/external-proposal-implementation-audit.md` to the private §5 external-proposal reference while changing its default from issue-writing to report-only.
- Move `.oh/skills/audit/references/artifact-contract-fixture.prd.json` and update `.oh/evals/probes/artifact-contract-audit.sh` together so the probe still extracts/executes production logic.
- Correct the stale harness survey's repository paths (`install/`, `scripts/`, `scripts/__tests__/`, `context/`, and `docs/`) to their tracked `.oh/` locations; `.devcontainer/entrypoint.sh`, `.github/workflows/`, `.oh/agents/`, and the external docs repository remain explicit where applicable.
- Existing probes extract real Markdown code blocks by path. Preserve executable-block extraction or replace it with direct script fixture tests of the same production logic.
- `/sync` currently has probe-pinned declarations for `/drift-check` and `/pr-audit`; migrate implementation and probe together to `/audit drift` and `/audit pr`.
- `/ship-spec`, `/autopilot`, and `/spec execute` contain probe-pinned literals. Internal US-006 batches may be separate commits for reviewability, but the branch must never merge until the final no-legacy-reference probe passes.
- `health-check` prunes builder cache by default, so only `/audit full --health-target "target"` may compose it, always with `--dry-run` and the explicit target required for resource sizing.
- Direct `/wiki ingest` owns corpus writes/index lifecycle and direct logs. Audit composition supplies `AUDIT_RUN_ID`/roots so ingest returns evidence without a child log; the outer audit remains responsible for its single log.
- Both `.github/workflows/ci-harness.yml` and `.github/workflows/release.yml` must shellcheck private audit scripts and the shared ablation owner. Do not rely on directory globs that currently omit `.oh/skills/audit/scripts/*.sh`; pin this expectation with a probe.
- `full` must not be implemented through the removed `auditor` agent because nested agents cannot launch the harness survey or deep PR reviewers.
- Reference documents should remain narrowly scoped. Split shared algorithms into private scripts or supporting references rather than creating another monolithic dispatcher.

## 12. Documentation and Wiki Alignment

**Wiki impact: REQUIRED.** Create and force-track `.oh/skills/wiki/corpus/audit-architecture.md` under the canonical wiki schema, with source-backed sections for:

- the nine-target ownership and retained-instrument boundary;
- default versus opt-in effects, including external issue actions;
- private PR acquisition/classification and readiness semantics;
- `AUDIT_ROOT`, `AUDIT_LOG_ROOT`, and `AUDIT_RUN_ID` lifecycle;
- full-campaign correlation/prioritization/Recommended Next 3 Actions; and
- clean-breaking migration/rollback boundaries.

The entry must explain architecture and relationships rather than duplicate procedural route bodies. Run `/wiki lint` to regenerate the tracked `.oh/skills/wiki/corpus/README.md` index, force-add the curated entry as required by corpus policy, and pass `.oh/evals/probes/wiki-readme-index.sh`. When `/wiki ingest` is composed by external harness mode, child-log suppression follows §7.3.

## 13. Rollback Criteria and Procedure

Do not merge, or roll back the consolidation as one unit, when any of these gates fails:

1. parent PR #648's protected-path commit is absent from branch ancestry, or the stack cannot be safely retargeted after #648 merges;
2. any active source still invokes/advertises a removed entry point, any public alias/tenth target exists, or provider links/lock provenance are inconsistent;
3. native verdict tokens, frozen CI/readiness truth tables, implementation gate order, full-campaign prioritization/Next 3 Actions, or external report-only behavior regress;
4. either CI/release shellcheck, a focused fixture/probe, provider-link validation, wiki index validation, or the full eval floor is red;
5. interruption/concurrency leaves changed target bytes, a stale lock/sentinel/backup, or eval recovery diverges from `.oh/scripts/ablate.sh`;
6. a run loses root/run correlation, writes outside the resolved roots, emits duplicate child logs, or performs an unconfirmed outward mutation.

Before merge, a failed criterion means fix the child or reset it to its pre-consolidation commit; never merge a partial internal batch. After merge, revert the consolidation PR atomically. If parent #648 has also merged, coordinate the rollback with a protected-path follow-up (or revert #648 when otherwise safe) so restored legacy skills are protected before they are re-exposed. Do not use compatibility aliases or leave a mixed old/new vocabulary as a rollback mechanism. Re-run the before/after active-reference inventory and all US-007 gates on the rollback state.

## 14. Success Metrics

- One public `/audit` entry point covers exactly all nine declared targets; private helpers are not routable.
- Zero active references advertise or invoke removed audit entry points after migration; explicit historical/migration mentions are classified by the inventory.
- All focused fixtures, both shellcheck workflows, provider-link/wiki-index probes, and the full eval suite pass with no new regression.
- Workflow gates consume focused PR structured output with the frozen readiness semantics rather than queue prose.
- A missing/unknown CI signal, ambiguous mergeability, incomplete review evidence, failed sub-agent, or failed acquisition cannot produce readiness or campaign completeness.
- Default invocations, including external-proposal audit, produce no outward-facing mutations.
- One invocation yields one correlated run and one locked outer log; child `/eval`, `/health-check`, and `/wiki ingest` do not double-log.
- Full campaigns preserve provenance, tier prioritization, and Recommended Next 3 Actions, including qualified synthesis for partial campaigns.
- Ablation interruption and concurrency tests restore byte-identical targets and clear all recovery state.
- The final dispatcher plus references contain no duplicated target algorithms.

## 15. Resolved Decisions

1. `prs --apply close` remains an explicit, previewed, confirmed action in this migration to avoid capability loss; no default audit closes anything.
2. `pr-acquire.sh` and `pr-classify.sh` are private shell interfaces, with `jq` permitted; their acceptance contract is deterministic/versioned JSON behavior and shellcheck coverage.
3. `full` includes `eval-quality` on every campaign as specified in the fixed cost order.
4. External-proposal audits emit reports by default; issue writes are an explicit confirmed action, never an implicit synthesis step.
