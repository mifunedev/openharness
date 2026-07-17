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

- Provide one memorable audit namespace with explicit target selection.
- Rename the existing implementation gate to `/audit implementation` while preserving `AUDIT-PASS` and `AUDIT-FAIL` exactly.
- Decompose PR auditing into reusable acquisition, pure classification, rendering, evidence escalation, and explicitly gated action layers.
- Add first-class focused-PR and repository targeting.
- Preserve each audit target's native verdicts instead of flattening all results into generic PASS/FAIL.
- Make default audit behavior non-remediating, with disclosed state writes limited to remote-ref fetches, temporary/recovery files, `/eval`'s canonical scoreboard, and one canonical memory log; explicit context baselines remain opt-in.
- Remove duplicate routing knowledge and superseded public entry points.
- Migrate all active callers, docs, templates, probes, and workflow literals atomically after the protected-path prerequisite lands.

### 3.1 Protected-path prerequisite

`harness-audit`, `skill-lint`, `eval-lint`, and `drift-check` are currently named in `.claude/protected-paths.txt`. Before the consolidation implementation, land a separate protected-path migration PR that records the replacement rationale in `CHANGELOG.md`, removes only the superseded protected names, and protects `audit`. The consolidation PR must not delete protected entry points until that prerequisite is merged. This staged policy migration is the only intentional exception to the otherwise atomic command/caller/probe migration.

## 4. Public Interface

### 4.1 Command grammar

| Invocation | Owned target | Native result |
|---|---|---|
| `/audit implementation <slug> [--pr N] [--branch B]` | One implementation versus `.oh/tasks/<slug>/prd.json` | `AUDIT-PASS` / `AUDIT-FAIL` |
| `/audit pr <N> [--repo O/N] [--deep] [--proof] [--dry-run]` | One PR's metadata, CI, mergeability, draft readiness, and convention state | `PR-AUDIT-PROMOTABLE` / `PR-AUDIT-BLOCKED` / `PR-AUDIT-UNKNOWN` |
| `/audit prs [--repo O/N] [--label L] [--author A\|--mine] [--base B] [--stale-days N] [--deep] [--apply proof\|labels\|close]... [--close-stale-days N] [--dry-run]` | Whole open-PR queue | Native bucket report plus `PRS-AUDIT-COMPLETE` / `PRS-AUDIT-PARTIAL` |
| `/audit harness [--focus area] [--external URL\|path] [--wiki-ingest] [--dry-run]` | Whole-harness four-perspective survey or explicit external-proposal decision audit | Existing Tier 1/2/3 findings and Next 3 Actions |
| `/audit context [all\|--baseline\|--ablate file]` | Default-loaded context budget | `KEEP` / `TRIM` / `DEMOTE` / `CUT`; ablation verdict unchanged |
| `/audit skills [all\|root\|workspace\|name]` | Skill staleness and integrity | `CURRENT` / `STALE` / `BROKEN` / `DELETE` |
| `/audit eval-quality [all\|probes\|capability\|id]` | Probe and capability-instrument quality | `KEEP` / `GROOM` / `CUT` |
| `/audit drift` | Framework, branch, working-tree, and cron drift | Existing per-class `OK` and aggregate `DRIFT:` output |
| `/audit full [--focus area] [--health-target "target"]` | Multi-target harness audit campaign; optional read-only host evidence from `/health-check` | Provenance-tagged native verdicts plus `AUDIT-CAMPAIGN-COMPLETE` / `AUDIT-CAMPAIGN-PARTIAL` |

### 4.2 Dispatch behavior

- Missing subcommand, unknown subcommand, or a target lacking required arguments must print the exact usage table and stop before reading a target reference or changing state.
- The dispatcher reads exactly one route reference for the selected public target. A route reference may load explicitly named supporting references/scripts. `implementation` may use shared PR classification, and `full` may invoke selected target references under one `AUDIT_RUN_ID`; supporting modules cannot be public or re-own rendering semantics.
- The dispatcher runs inline and inherits the current session model.
- The dispatcher never normalizes a target's native verdict into another target's vocabulary.
- `harness --external <url|path>` selects the external-proposal decision protocol; it is mutually exclusive with `--focus`. `--wiki-ingest` is valid only with `--external` and composes `/wiki ingest` before the decision audit.
- `full` composes targets in cost order: `drift → eval → skills + eval-quality + context → harness → prs`; `--health-target` additionally composes `/health-check "<target>" --dry-run` as an adjacent instrument.
- `full` runs from the top-level session. If already nested and a selected target requires sub-agents, emit the exact deferred invocation and classify the campaign `PARTIAL`; never pretend the nested fan-out ran. `COMPLETE` means every selected target executed with complete evidence, not that every native verdict was healthy; a regression, `CUT`, or drift finding alone does not make the campaign partial.

### 4.3 Consolidation boundary

| Current surface | Decision | New owner / reason |
|---|---|---|
| `/audit` implementation gate | Consolidate and rename | `/audit implementation`; preserve workflow tokens |
| `/pr-audit` | Consolidate and decompose | `/audit pr` + `/audit prs` with shared pure classifier |
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
| `/wiki lint` | Retain under `/wiki` | Corpus-owned maintenance and index generation |
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
│   ├── pr-classify.sh               # pure JSON-in/JSON-out classifier
│   └── context-audit-runner.sh      # migrated context ablation runner
├── fixtures/
│   └── artifact-contract.prd.json   # migrated implementation fixture
└── probes/context/                  # migrated context behavioral probes
```

Each public target has one authoritative route reference. Supporting scripts and shared definitions may be reused, but no second public surface may own the same target. `/health-check` remains the sole owner of host readiness and reclaim; a full campaign may only compose its explicit dry-run mode.

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

### 6.2 Acquisition

- `pr` performs one `gh pr view N --repo O/N --json ...` call.
- `prs` performs one `gh pr list --state open --repo O/N --limit 200 --json ...` call.
- If a queue result reaches the configured limit, mark the snapshot `truncated: true`, disclose incomplete coverage, and emit `PRS-AUDIT-PARTIAL`; never claim whole-queue completeness from a capped result.
- Autopilot cap-headroom may require one separately disclosed aggregate query only when the `autopilot` label is selected.
- Store snapshots in `mktemp`-created invocation-scoped paths and clean them with `trap`; never use shared `/tmp/pr-audit.json`.
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

1. CI normalization with fail-closed precedence: any known failure conclusion → `FAIL`; otherwise any known pending state → `PENDING`; empty rollup → `NONE`; only accepted terminal success/neutral states → `PASS`; any unknown or malformed value → `UNKNOWN` with `evidenceComplete: false`.
2. PR age calculation from `observedAt`, never `now`.
3. Title, base, and size convention checks.
4. Issue-reference extraction from linked metadata, branch, title, and body.
5. Duplicate issue-reference grouping for queue mode.
6. One first-match primary state per PR: draft, CI failing, conflicting/behind, changes requested, needs review, ready, pending/other.
7. Draft sub-status: `promotable`, `wip`, or `null`.
8. Orthogonal stale, convention, duplicate-reference, and draft-limbo flags. Limbo is not a competing readiness state: a stale green/clean draft remains `draftStatus: "promotable"`, `draftLimbo: true`, and `promotable: true`.

The focused result schema must include at least:

```json
{
  "schemaVersion": 1,
  "repo": "owner/name",
  "number": 123,
  "primaryState": "draft",
  "draftStatus": "promotable",
  "draftLimbo": false,
  "ci": "PASS",
  "mergeable": true,
  "clean": true,
  "reviewDecision": "",
  "flags": [],
  "promotable": true,
  "evidenceComplete": true
}
```

A PR is promotable only when CI is `PASS`, mergeability is `MERGEABLE`, merge state is `CLEAN`, and `evidenceComplete` is true. `NONE`, `UNKNOWN`, missing fields, API errors, and ambiguous values are not promotable. Focused and queue output envelopes must both carry `schemaVersion: 1`; queue output additionally carries `truncated`, per-state counts, and one classified record per acquired PR.

### 6.4 Rendering

- `pr` renders one compact evidence table and the stable focused token.
- `prs` preserves actionability-ordered sections, a separate non-actionable draft section, flag rollup, and summary counts.
- Markdown rendering consumes classifier JSON; it does not re-derive state.
- Classifier JSON is the sole machine seam. `/audit implementation` invokes the same acquisition-plus-classifier path as `/audit pr`, reads only `.promotable` and `.evidenceComplete`, and never parses Markdown or routing tokens. Human-facing tokens remain downstream render output.

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

## 7. Effects and Logging Contract

| Target | Default effects beyond reads | Explicit opt-in effects |
|---|---|---|
| implementation | `/eval` scoreboard update, temporary evidence, one dispatcher memory log | browser verification when applicable |
| pr / prs | remote API reads, temp snapshot, one dispatcher memory log | proof comment, labels, stale close |
| harness | sub-agent reads, one dispatcher memory log | optional wiki ingest only with `--external ... --wiki-ingest` |
| context | temp ablation files with guaranteed restore, one dispatcher memory log | durable baseline under gitignored memory |
| skills / eval-quality | one dispatcher memory log | none |
| drift | remote-ref fetch, one dispatcher memory log | none |
| full | union of selected read effects, `/eval` scoreboard update, one campaign memory log | host reads only when `--health-target` is supplied; no reclaim |

The dispatcher owns exactly one memory entry per user invocation. `AUDIT_RUN_ID` is a child-invocation protocol that must be honored by audit references and retained composed instruments including `/eval` and `/health-check`: direct invocations log normally, while composed invocations return observations and suppress child memory entries. Canonical scoreboards, configured logs, explicit context baselines, temporary snapshots, and ablation recovery state are disclosed state writes rather than outward-facing remediation; FR-8's confirmation requirement applies to outward-facing or destructive mutations.

## 8. User Stories

### US-001: Add the target dispatcher

**Description:** As an operator, I want one `/audit` namespace so I can select the object being audited without memorizing unrelated command names.

**Acceptance Criteria:**

- [ ] `.oh/skills/audit/SKILL.md` accepts exactly the nine public targets in §4.1.
- [ ] Empty, unknown, and missing-required-argument invocations print exact usage and make no target-side changes.
- [ ] Each valid target maps to exactly one authoritative route reference.
- [ ] The dispatcher runs inline, inherits the session model, and preserves native verdicts.
- [ ] Frontmatter preserves representative natural-language trigger families from every removed skill, including implementation promotability, PR backlog, harness health, context budget, stale skills, eval quality, and drift.
- [ ] A deterministic eval probe guards dispatch, representative request routing, argument failure, reference existence, and no-alias behavior.

### US-002: Extract reusable PR acquisition and classification

**Description:** As a workflow author, I want a focused and machine-readable PR audit result so promotability gates do not parse queue-wide prose.

**Acceptance Criteria:**

- [ ] `/audit pr N --repo O/N` is a declared, working interface.
- [ ] `/audit prs --repo O/N` supports the existing queue filters.
- [ ] PR and queue acquisition use one appropriately scoped GitHub query each.
- [ ] Temporary snapshots are invocation-scoped and trap-cleaned.
- [ ] `pr-classify.sh` is network-free, deterministic, JSON-in/JSON-out, and fixture-tested.
- [ ] Existing primary-state ordering, draft sub-status, stale/convention flags, and duplicate issue-reference behavior remain covered.
- [ ] Missing/ambiguous CI or mergeability cannot produce `promotable: true`.
- [ ] Focused mode emits the stable tokens defined in §4.1.

### US-003: Move the implementation gate under `/audit implementation`

**Description:** As `/spec execute`, I want the existing per-unit gate under an explicit target so the audit namespace can expand without changing routing semantics.

**Acceptance Criteria:**

- [ ] Existing task-graph, artifact-contract, eval, PR-promotability, and conditional browser gates are preserved in order.
- [ ] Final `AUDIT-PASS` and `AUDIT-FAIL` tokens remain byte-for-byte unchanged.
- [ ] Gate 3 consumes the shared focused classifier JSON (`.promotable` + `.evidenceComplete`) rather than `/pr-audit` prose or rendered routing tokens.
- [ ] The artifact-contract fixture and executable regression probe move to their new canonical paths and still exercise the real implementation block.
- [ ] `/spec execute` and all other per-unit callers use `/audit implementation`.

### US-004: Migrate audit-family owners without semantic flattening

**Description:** As a maintainer, I want each existing audit algorithm preserved behind the shared namespace so consolidation does not erase useful specialization.

**Acceptance Criteria:**

- [ ] Harness, context, skill, eval-quality, and drift protocols move to their named authoritative references with supporting resources preserved.
- [ ] Their existing verdict vocabularies and fail-closed conditions remain unchanged.
- [ ] `/audit full` composes the cost-ordered campaign in §4.2 and provenance-tags every finding.
- [ ] `/audit full` includes `/eval` as a composed regression-floor instrument but does not absorb or remove `/eval`.
- [ ] Nested-agent constraints yield `AUDIT-CAMPAIGN-PARTIAL` with exact deferred invocations.
- [ ] The external-proposal audit pattern remains reachable only through explicit `/audit harness --external <url|path>`; `--wiki-ingest` composes wiki capture and cannot run in ordinary survey mode.

### US-005: Preserve safety boundaries

**Description:** As an operator, I want audits to remain observational by default so asking for evidence cannot unexpectedly remediate or destroy state.

**Acceptance Criteria:**

- [ ] `/health-check` remains the sole host-readiness/reclaim owner.
- [ ] `/audit full --health-target "target"` composes `/health-check "target" --dry-run`, suppresses child logging through `AUDIT_RUN_ID`, and never prunes cache.
- [ ] PR comments, labels, and closes require explicit flags, complete target preview, and confirmation.
- [ ] No audit target undrafts or merges a PR.
- [ ] Context ablation continues to source `.oh/scripts/ablate.sh` as the single swap/restore owner; the migrated runner does not invent a second backup protocol.
- [ ] Ablation canonicalizes targets, rejects paths outside the repository and disallowed targets such as `CLAUDE.md`, acquires a per-target lock through restoration, and refuses conflicting backup/sentinel state.
- [ ] Restoration covers `EXIT`, `INT`, `TERM`, and `HUP` while preserving eval-startup crash recovery; interruption and same-target concurrency are fixture-tested.
- [ ] Effects are documented per target, and default report-only behavior is probe-guarded.
- [ ] One invocation produces one locked memory append using configured memory-root resolution.

### US-006: Remove legacy entry points and migrate callers

**Description:** As a maintainer, I want one active audit vocabulary so documentation and automation cannot drift between aliases.

**Acceptance Criteria:**

- [ ] A separate prerequisite PR first updates `.claude/protected-paths.txt` and `CHANGELOG.md` as defined in §3.1.
- [ ] After that prerequisite merges, remove `/pr-audit`, `/harness-audit`, `/context-audit`, `/skill-lint`, `/eval-lint`, and `/drift-check` as public skill entry points without compatibility aliases.
- [ ] Remove `.oh/agents/auditor.md`; `/audit full` owns broad routing and synthesis.
- [ ] Retain `/eval`, `/benchmark`, `/ci-status`, `/health-check`, `/critique`, `/approve`, `/watchdog`, and `/wiki lint` as separate surfaces.
- [ ] Update the explicit migration manifest: `.oh/scripts/link-providers.sh`, `.oh/skills.lock` plus retained license/provenance, `.oh/context/REPO_MAP.md`, `.pi/prompts/execute.md` and its template, `.oh/agents/advisor.md`, active crons, `AGENTS.md`, `.oh/templates/AGENTS.md`, `/benchmark`, `/eval`, `/watchdog`, `/teach`, `/render-html`, `/retro`, `/sync`, `/spec`, `/ship-spec`, `/autopilot`, active capability tasks `CB-001` and `CB-004`, and all named eval probes.
- [ ] Replace nonexistent diff-review redirects with an honest scope boundary or a verified registered reviewer.
- [ ] Add a `CHANGELOG.md` breaking-migration table from every removed invocation to its `/audit` replacement.
- [ ] Historical changelog entries may remain unchanged; active guidance must not advertise legacy entry points.

### US-007: Migrate and strengthen regression coverage

**Description:** As a maintainer, I want consolidation guarded by behavior-level probes so moving files cannot silently weaken audit semantics.

**Acceptance Criteria:**

- [ ] Update existing auditor, PR duplicate-reference, artifact-contract, harness-audit, context, drift, health-boundary, sync, watchdog, workflow, and memory probes to canonical paths and invocations.
- [ ] Replace the frozen seven-skill auditor-agent probe with a dispatcher taxonomy probe covering all nine targets and the retained separate instruments.
- [ ] Add fixture tests for focused PR promotability, missing/unknown CI, draft WIP, stale-but-promotable draft limbo, queue duplicate references, byte-identical classifier output, JSON consumption by implementation Gate 3, and concurrent temp-file isolation.
- [ ] Stale-reference scans exclude historical `CHANGELOG.md` entries, immutable datasets, archived tasks, and generated `.oh/evals/RESULTS.md`, but cover every active source, prompt, template, cron, and capability task.
- [ ] New shell scripts are executable, included in CI shellcheck coverage, and pass provider-link validation.
- [ ] Run the focused probes and full eval suite with no new green-to-red regression.
- [ ] `git diff --check` passes and unrelated working-tree changes remain untouched.

## 9. Functional Requirements

- **FR-1:** `/audit` must dispatch by explicit first-token target; it must not infer a target from free-form prose.
- **FR-2:** The public target list is fixed to the nine values in §4.1 for this change.
- **FR-3:** Exactly one authoritative reference owns each target's behavior.
- **FR-4:** PR classification must be a pure deterministic layer shared by `pr` and `prs`.
- **FR-5:** Focused PR classification must expose stable machine-readable evidence and a final routing token.
- **FR-6:** Existing native verdicts remain authoritative for implementation, harness, context, skills, eval-quality, and drift.
- **FR-7:** Default audit execution must not remediate state.
- **FR-8:** Every mutation requires explicit intent, preview, and confirmation; dry-run writes nothing.
- **FR-9:** `/audit full` must disclose skipped/deferred targets and never infer success from missing output.
- **FR-10:** The dispatcher must own memory logging and prevent duplicate child logs.
- **FR-11:** Provider exposure must continue through canonical `.oh/skills` symlinks; no provider-specific copies.
- **FR-12:** After the separate protected-path prerequisite merges, the consolidation migration must be atomic across skills, agents, callers, docs, templates, and probes.

## 10. Non-Goals

- Implementing diff-level code review under the audit namespace.
- Replacing `/eval`, `/benchmark`, `/ci-status`, or workflow decision gates such as `/approve`.
- Moving `/wiki lint` out of the wiki-owned namespace.
- Turning `/watchdog` remediation into an audit action.
- Normalizing all audit outcomes into one universal score or PASS/FAIL token.
- Adding backward-compatibility aliases for removed public audit commands.
- Broadly rewriting historical changelog entries or archived task artifacts.
- Implementing this PRD before adversarial critique and approval.

## 11. Technical Considerations

- `context-audit` carries a runner and six behavioral probes; move these resources atomically and update all internal path resolution.
- Existing probes extract real Markdown code blocks by path. Preserve executable-block extraction or replace it with direct script fixture tests of the same production logic.
- `/sync` currently has a probe-pinned declaration that it composes `/drift-check` and `/pr-audit`; migrate both the implementation and the probe to `/audit drift` and `/audit pr`.
- `/ship-spec`, `/autopilot`, and `/spec execute` contain many literal references used by regression probes. Update workflow owners and probes in one commit to avoid an intermediate broken state.
- `health-check` prunes builder cache by default, so only `/audit full --health-target "target"` may compose it, always with `--dry-run` and the explicit target required for resource sizing.
- `full` must not be implemented through the removed `auditor` agent because nested agents cannot launch the harness survey or deep PR reviewers.
- Reference documents should remain narrowly scoped. Split shared algorithms into scripts or supporting references rather than creating another monolithic 1,000-line dispatcher.

## 12. Documentation and Wiki Alignment

**Wiki impact: NOT-APPLICABLE for the current corpus.** No audit-family entry exists under `.oh/skills/wiki/corpus/`. The implementation must instead update active command registries, workflow docs, templates, skill cross-references, and the changelog. If a future audit architecture wiki page is created, it should document target ownership and effect classes rather than duplicate procedural skill bodies.

## 13. Success Metrics

- One public `/audit` entry point covers all nine declared targets.
- Zero active references advertise removed audit entry points after migration.
- All focused and full eval probes pass with no new regression.
- Workflow gates consume focused PR structured output rather than queue prose.
- A missing CI signal, ambiguous mergeability state, failed sub-agent, or failed acquisition cannot produce a promotable or complete verdict.
- Default invocations produce no outward-facing mutations.
- The final dispatcher plus references contain no duplicated target algorithms.

## 14. Open Questions for Critique

1. Whether `prs --apply close` belongs in the audit namespace at all or should move to a separate operational skill; the spec preserves it only to avoid capability loss.
2. Whether the pure PR classifier should be shell + `jq` or a small TypeScript module; acceptance depends on deterministic JSON behavior, not language.
3. Whether `full` should include `eval-quality` on every run or only pre-release/explicit deep campaigns; the initial recommendation includes it because the current auditor registry omits this audit surface.
