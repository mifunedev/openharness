# PRD — make `/spec` a closed repo-knowledge learning loop

Issue: [#926](https://github.com/mifunedev/openharness/issues/926) · slug
`repo-knowledge-loop` · branch `feat/926-repo-knowledge-loop` · base `development`
· repo `mifunedev/openharness`.

## Knowledge Context

- **Base commit**: `ecc49800a7d6a7bd525099383998865a3e6a1a49`
- **Queries**: `wiki knowledge corpus compile`, `spec plan execute retro`,
  `evals probes oracles`, `docs vocabulary guards` (run against the tracked
  knowledge set at the base commit, before any migration)
- **Knowledge used**:
  `[[wikiskill-experience-compilation]]`, `[[plan-vs-built-reconciliation]]`,
  `[[audit-architecture]]`, `[[pattern-wiki-external-model-over-mapping]]`,
  `[[pattern-wiki-ungated-check-drift]]`, `[[pattern-evals-prose-literal-pinning]]`,
  `[[pattern-evals-unexercised-oracle]]`, `[[pattern-docs-prohibition-by-example]]`
- **Grounded against**: `.oh/skills/spec/SKILL.md`,
  `.oh/skills/spec/references/{plan,execute,ship,retro}.md`,
  `.oh/skills/spec/templates/task-prompt.md`, `.oh/skills/wiki/SKILL.md`,
  `.oh/skills/wiki/references/{schema,query,lint,compile,ingest}.md`,
  `.oh/skills/retro/SKILL.md`, `.oh/skills/eval/run.sh`,
  `.oh/evals/probes/{wiki-readme-index,wiki-kind-schema-contract,wiki-query-pattern-isolation,wiki-related-slugs,wiki-pattern-persistence,wiki-skill-impact-append-only,audit-stale-references,eval-runs-once-per-cycle,advisor-monitored-loop}.sh`,
  `.gitignore`, `.oh/README.md`, `.oh/tasks/README.md`, `.oh/manifest.json`,
  `crons/cleanup-tasks.md`, `.github/workflows/ci-harness.yml`,
  `docs/oh-directory-layout.md`, `docs/glossary.md`, `docs/rfcs/*.md`,
  `.claude/protected-paths.txt`, `.oh/scripts/link-providers.sh`
- **Conflicts discovered**: four. (1) The pattern corpus warns that report-only
  checks nobody gates on converge on never being run
  (`[[pattern-wiki-ungated-check-drift]]`), so requirement R's surviving lint
  checks each get a deterministic probe rather than prose alone. (2)
  `[[pattern-docs-prohibition-by-example]]` warns that a guard forbidding a
  literal also scans the prose explaining it — so the retired corpus path is
  named in exactly one guard and nowhere else. (3)
  `[[pattern-evals-prose-literal-pinning]]` warns against pinning wrapped
  sentences — every new probe pins short, wrap-safe fragments. (4)
  `[[pattern-evals-unexercised-oracle]]` requires fault injection before a probe
  counts as green, which #926 independently mandates.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `wikiskill-experience-compilation`,
  `plan-vs-built-reconciliation`, `audit-architecture`,
  `pattern-wiki-ungated-check-drift`, `pattern-wiki-external-model-over-mapping`,
  plus every migrated page's frontmatter (`kind`, `verified_at`) and any new
  `pattern-*` page `/wiki compile` writes from this run's retro
- **Affected source paths**: `.oh/skills/spec/**`, `.oh/skills/wiki/**`,
  `.oh/knowledge/**`, `.oh/evals/probes/**`, `.oh/tasks/README.md`,
  `.oh/README.md`, `.gitignore`, `crons/cleanup-tasks.md`, `docs/**`
- **Reason**: the change relocates the knowledge surface, redefines the entry
  schema, and rewrites the `/spec` workflow contract every tracked page about
  those subsystems cites.

## Plan Reconciliation

- **Source plan**: `https://github.com/mifunedev/openharness/issues/926` (the
  issue body and its pinned execution-requirement comment). The operator wrote
  and approved it; that satisfies the commitment gate.
- **Intent preserved**: YES
- **Material deviations**: `none`
- **Constraints discovered during grounding**:
  1. **`depends_on:` collapses into `sources:`.** Requirement E illustrates
     freshness provenance with a separate `depends_on:` list ("for example"),
     while requirement F normatively puts repository paths in `sources:` for
     `kind: repo`. Two lists holding the same paths is the complexity the root
     `AGENTS.md` forbids, so `sources:` is the single dependency declaration and
     `verified_at:` pins the commit it was last checked against. Freshness is
     computed over the repository-relative subset of `sources:`; immutable
     `raw/` and `path@sha` entries carry provenance but never expire.
     Non-material: the observable behavior E asks for — "a page is needs-review
     when a declared dependency changed since `verified_at`" — is unchanged.
  2. **`/spec retro` takes option 1 of requirement K** (explicit compatibility
     wrapper) rather than option 2 (retire the subcommand).
     `.oh/skills/spec/references/retro.md` is a `.claude/protected-paths.txt`
     entry and `.oh/evals/probes/audit-stale-references.sh` pins it as a coverage
     path; deleting it would need a protected-path removal the issue does not
     ask for. The wrapper carries no second ontology — it delegates to
     `/retro --task <slug>`.
  3. **No `/spec ship` alias survives.** A repository-wide search found zero
     callers outside the skill's own two files, so the non-goal against
     compatibility abstractions applies. The dispatcher keeps a two-line
     redirect for a literal `ship` first token purely so `/spec ship <plan>` can
     not silently derive the slug `ship`.
  4. **Tracked-by-default replaces gitignore-by-default for knowledge pages.**
     Requirement G demands a physically distinct ignored scratch location; once
     `.oh/knowledge/local/` exists, keeping `source/` and `patterns/` ignored
     buys nothing and forces the `git add -f` dance plus `/wiki lint`'s dual
     working-tree/tracked entry sets. Both collapse.
  5. **`raw/` is tracked, not ignored.** This PRD first wrote requirement G's
     ignore boundary around `raw/` as well as `local/`. `raw/` holds the
     immutable snapshots `kind: external` pages cite, and an untracked snapshot
     is provenance a fresh clone cannot verify — problem 4 in the issue, wearing
     a new name. Corrected mid-build to track it, which also matches the issue's
     own layout comment, where only `local/` is annotated ignored. Recorded in
     `evidence.md` as a divergence from the PRD as first written.
  6. **Three pre-existing pages cited snapshots that were never committed.**
     `managed-agents`, `molt-agentic-reinforcement-learning`, and
     `recursive-self-improvement-survey` named `raw/` files absent from every
     commit — the same split-brain, found by the new source-path check. Repaired
     without fabricating provenance: two carry the arXiv URL their bodies state,
     and `managed-agents` is reclassified `kind: repo` against the repository
     documents it actually reasons over, with its unrecoverable external seed
     stated in the page.
  7. **The execution base moved mid-build: #930 (issue #928) merged into
     `development` and retired the `/spec` agent-handoff mechanism.** It deleted
     the tmux Advisor launch, the `/goal` prompt, and the `agent-spec-<slug>`
     session naming, and redefined `RUNNING` as *task* state — an approved folder
     whose stories are not all passing — never a named process. That collides
     with #926's pinned comment, which asks for "one persistent Herdr/tmux-backed
     session" and says `RUNNING` "represents the persistent Advisor doing the
     work". Reconciled toward the merged repository state, which is the newer
     operator decision and which **preserves every invariant the pinned comment
     actually protects**: one implementation owner, `/delegate` bounded beneath
     it, the `PLANNED → RUNNING → READY | DRAFT-BLOCKED(<gate>)` lifecycle, and
     human merge as the final boundary. What changed is the *mechanism* — the
     owner is now the agent already running `/spec execute` rather than a session
     it launches, and the status file is `/tmp/spec-<slug>.state`. Flagged for the
     operator on the PR; this is the one place a reviewer may want to overrule.
  8. **`.oh/manifest.json` must gain `knowledge/**`.** The corpus shipped to
     consumer repos today only because it sat under `skills/**`. Moving it out
     without the manifest entry would silently stop shipping durable knowledge.

## Introduction

`/spec` writes durable knowledge more reliably than it reads it. Planning does not
recall tracked knowledge before the PRD exists; the planner's `Wiki Alignment`
prediction is treated as the final impact oracle even though implementation touches
paths the planner never saw; wiki freshness is measured in days rather than against
the sources a page depends on; ignored local scratch and shared knowledge share one
query path; and the durable knowledge itself lives inside the wiki skill's own
implementation tree. Alongside that, several `/spec` surfaces duplicate state:
`ship` owns no mechanics, `prompt.md` is a generated copy of its own template,
`STATUS: COMPLETE` duplicates `prd.json`, and `/spec execute` claims a synchronous
ready PR while actually launching a detached Advisor.

This PRD closes the loop: planning recalls and re-grounds tracked knowledge before
the PRD is written, execution re-grounds it against current HEAD, the actual diff
determines what knowledge was invalidated, and retrospective evidence compounds back
into durable patterns — with the redundant surfaces retired in the same change.

## Goals

1. `/spec plan` recalls tracked knowledge and re-grounds it against current
   repository sources before the PRD is finalized, and records what it used.
2. An approved plan whose intent grounding materially changes stops for operator
   re-approval instead of flowing silently into execution.
3. `/spec execute` re-grounds at start, and derives final knowledge impact from the
   actual diff plus knowledge dependency metadata, not from the planner's guess.
4. Knowledge freshness is commit- and source-change-aware, not age-based.
5. Durable knowledge owns `.oh/knowledge/` as a surface separate from
   `.oh/skills/wiki/`, with tracked shared knowledge physically separated from
   ignored local scratch, and exactly one writable knowledge location.
6. `/spec`'s redundant surfaces (`ship`, generated `prompt.md`,
   `STATUS: COMPLETE`, mandatory `/compact` as a semantic stage, the `.oh/memory`
   vocabulary) are retired atomically with every consumer.
7. Detached execution is an explicit `PLANNED → RUNNING → READY | DRAFT-BLOCKED`
   lifecycle, still owned by one persistent Advisor session.

## Non-goals

- No vector search, embeddings, database, or memory service.
- Knowledge never becomes authoritative over code, tests, docs, or RFCs.
- The full pattern corpus is never loaded into every agent session.
- No second workflow engine beside `/spec`.
- No compatibility alias kept without an actual caller.
- No auto-merge; human merge stays the final gate.
- The single-Advisor executor ownership model is **not** retired (issue #926's
  pinned execution requirement).

## User stories

### US-001 — `.oh/knowledge/` becomes the knowledge surface

Migrate the retired corpus path to `.oh/knowledge/{source,patterns,raw,local}/`
with no compatibility alias, update `.gitignore` so `source/` and `patterns/` are
tracked while `raw/` and `local/` are ignored, add `knowledge/**` to
`.oh/manifest.json`, add `.oh/knowledge/**` to the CI path filters, and move
`skill-impact.md` to `.oh/evals/decisions/skill-impact.md`.

**Acceptance criteria**
- No tracked file remains under the retired corpus path and no active surface
  references it (`knowledge-path-single-owner` probe).
- `.oh/knowledge/README.md` is the generated tracked index; `source/`,
  `patterns/`, and `raw/` are tracked; `local/` carries a tracked README anchor
  and nothing else tracked.
- `.oh/manifest.json` `include` lists `knowledge/**`.
- `.github/workflows/ci-harness.yml` push and pull_request filters both list
  `.oh/knowledge/**`.
- `.oh/evals/decisions/skill-impact.md` holds the full prior ledger, unedited.

### US-002 — knowledge schema: kinds, provenance, source-change freshness

Rewrite `.oh/skills/wiki/references/schema.md` for `kind: repo | external |
pattern`, `verified_at: <commit>`, `sources:` as the single dependency
declaration, and the tracked/local boundary. Ship
`.oh/skills/wiki/scripts/knowledge-impact.sh` as the one dependency-aware
invalidation implementation.

**Acceptance criteria**
- Every migrated page carries a valid `kind`; every `kind: repo` page carries
  `verified_at` and at least one repository-relative `sources:` entry.
- No `kind: repo` page is required to snapshot its own source into `raw/`.
- `knowledge-impact.sh --verified` marks a page `NEEDS-REVIEW` when a declared
  repository source changed after its `verified_at` commit
  (`knowledge-source-freshness` probe).
- `knowledge-impact.sh --changed <paths>` reports the pages a given changed-path
  set invalidates; `/spec` calls it rather than reimplementing the logic.

### US-003 — tracked-only retrieval and the local scratch boundary

`/wiki query` and every `/spec` path read `.oh/knowledge/source/` and
`.oh/knowledge/patterns/` only. `.oh/knowledge/local/` is ignored scratch that no
normal query or `/spec` flow reads; promotion is an explicit `/wiki ingest` call.

**Acceptance criteria**
- `/wiki query`'s enumeration globs name only `source/` and `patterns/`; the word
  `local` appears only in the prohibition (`knowledge-tracked-query-boundary`
  probe).
- Planner/executor asymmetry survives: patterns come from `--patterns`, default
  mode returns `repo`/`external` pages only.

### US-004 — `/spec plan` = recall → ground → plan

Rewrite `.oh/skills/spec/references/plan.md` so tracked recall and source
re-grounding precede `/prd`, and `prd.md` carries `## Knowledge Context`,
`## Expected Knowledge Impact`, and `## Plan Reconciliation`. `## Wiki Alignment`
is superseded. The task contract drops `prompt.md`.

**Acceptance criteria**
- `plan.md` orders vocabulary → tracked query → pattern query → read → re-ground →
  PRD, and names all three prd.md sections (`spec-plan-knowledge-context` probe).
- A material intent change during grounding stops for re-approval
  (`spec-plan-reconciliation-gate` probe).
- The verified contract is `prd.md`, `prd.json`, `progress.txt`
  (`spec-no-generated-prompt-contract` probe).

### US-005 — `/spec execute`: re-ground, RUNNING, diff-derived knowledge impact

Rewrite `.oh/skills/spec/references/execute.md` for the re-ground step, the
explicit `PLANNED → RUNNING → READY | DRAFT-BLOCKED(<gate>)` lifecycle with a
status file, the Actual Knowledge Impact gate derived from the real diff, the
issue's tail order, no persisted `prompt.md`, no `STATUS: COMPLETE`, and
`/compact` demoted to a non-gating optional step after evidence and learning
extraction.

**Acceptance criteria**
- Execute re-reads Knowledge Context and diffs planning base → current HEAD before
  implementing.
- Every impacted tracked page ends `UPDATED` / `REVERIFIED` /
  `NOT-AFFECTED (<reason>)`, derived via `knowledge-impact.sh --changed`
  (`spec-execute-knowledge-impact` probe).
- Launching the detached Advisor reports `RUNNING`, never a synchronous READY
  (`spec-execute-running-contract` probe).
- Tail order is knowledge impact → evidence.md → retro → compile → optional
  compaction → benchmark → final PR audit.
- The single-Advisor ownership model and the human merge boundary are intact.

### US-006 — retire `ship`, `STATUS: COMPLETE`, and the `.oh/memory` vocabulary

Delete `.oh/skills/spec/references/ship.md` and the `ship` node from the
dispatcher; derive task completion from `prd.json`; reduce `/spec retro` to an
explicit `/retro --task <slug>` wrapper; retire `.oh/memory` from current
architecture docs and label the surviving ignore rule a tombstone.

**Acceptance criteria**
- `/spec <approved-plan-path>` still runs plan → execute; the canonical model is
  `plan` + `execute`.
- `crons/cleanup-tasks.md` and `.oh/tasks/README.md` derive completion from
  `prd.json` story state (`task-completion-structured-state` probe).
- `.oh/README.md` no longer lists `memory/` as a current subsystem and the
  `.gitignore` rule names a removal horizon (`retired-memory-vocabulary` probe).
- `/retro` accepts `--task <slug>` and stays report-only.

### US-007 — lint simplification and the ten probes

Reduce `/wiki lint` to schema validity, missing/broken source paths,
source-change freshness, broken `[[...]]` links, broken `related:` slugs, and
generated index consistency. Orphan detection is retired as a health failure; the
90-day check survives only as `last-reviewed` telemetry. Add all ten required
probes and fault-inject each.

**Acceptance criteria**
- Lint's check list is exactly the six correctness checks plus the informational
  telemetry line; orphan status blocks nothing.
- All ten new probes exist, are tier A, and pass on the branch.
- Each new probe has a recorded fault-injection observation in `evidence.md`.
- `/eval` shows zero new green→red regressions.

## Verification

`bash .oh/skills/eval/run.sh` (once), `bash .oh/scripts/link-providers.sh --check`,
`git diff --check`, and a fresh `/audit pr` before any undraft.
