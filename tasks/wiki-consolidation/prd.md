# PRD — Consolidate the `wiki-*` skills into one `/wiki` dispatcher owning its corpus

## Problem

Three harness-native skills (`/wiki-ingest`, `/wiki-query`, `/wiki-lint`) are one
workflow (write / read / audit) over a single knowledge base, decomposed for no
probe-enforced reason. The wiki **data** lives at top-level `wiki/`, divorced from
the skills that operate on it and tracked-by-default.

## Goal

One parameterized `/wiki <ingest|query|lint>` dispatcher that owns its corpus,
co-located at `.mifune/skills/wiki/corpus/`, **gitignored-by-default** so entries
are local scratch until the operator whitelists curated ones with `git add -f`.
Proof-of-concept for the "skills own their artifacts" primitive.

## Scope

- **In**: wiki only — merge the three skills, relocate the corpus + schema +
  research docs into the skill dir, flip the gitignore, repoint the two coupled
  probes and all live cross-references.
- **Out**: memory (`/memory` is a reserved builtin; no memory skill exists yet)
  and the `spec-*` family (intentionally decomposed + CI-locked).

## Wiki Alignment

Impact: REQUIRED. This change *is* a wiki-surface change — it relocates the corpus
and rewrites the schema home to `.mifune/skills/wiki/references/schema.md`. The
relocated `corpus/README.md` index is the tracked deliverable, guarded by
`evals/probes/wiki-readme-index.sh` (now reconstructing from the git-tracked set).

## Acceptance

See `prd.json` userStories US-001…US-004. Net: 56 PASS / 1 SKIPPED / 0 REGRESSION;
PR #319 to `development` green + MERGEABLE/CLEAN; stops at the human merge gate.

## Decisions (locked with the operator)

- Scope: wiki only.
- Style: true merge — delete the three old skill dirs, single dispatcher.
- Artifacts: relocate the corpus into the skill dir, gitignore-by-default,
  whitelist the existing curated entries so nothing is lost.
