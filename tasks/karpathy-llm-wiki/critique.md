# Critique — karpathy-llm-wiki

Generated 2026-05-24 (UTC); reviews `prd.md` post-`/prd`, pre-`/ralph`.

This PRD already incorporates the pm-agent ultrathink audit tightenings (logged in `.claude/plans/karpathy-llm-wiki.md` § *Audit Tightenings* on the worktree branch `feat/346-karpathy-llm-wiki`). The two critics below review what survived translation from plan → PRD and what the pm audit may have missed.

## Critic A — Implementer lens

```
[SEVERITY: H] [STORY: US-001] context/rules/wiki.md is auto-loaded via context/rules/*.md glob every session from day 1 — the PRD says the rule must ship "complete, not a stub," but the AC has no word-count floor or required-section checklist. A Haiku sub-agent (the assigned model) can satisfy "complete" by shipping a 50-word stub that technically has all headings. | AC line: "context/rules/wiki.md ships complete" | Add a required-sections checklist to US-001 AC, not just "not a stub"

[SEVERITY: H] [STORY: US-002] The update-existing-page AC says "body merge" but does not define merge semantics. Two parallel wave runs of /wiki-ingest on the same slug produce diverging body text with no defined conflict resolution. | AC: "update that page (frontmatter updated: field, body merge)" | Define merge as: replace ## Summary + ## Detail in-place; append new source to sources: frontmatter list; do NOT concatenate bodies.

[SEVERITY: H] [STORY: US-002 / US-003] Parallel wave hazard: US-003 smoke test depends on a specific slug existing. If /delegate runs these in parallel, US-003 could start its smoke test before US-002 has committed. | PRD § Technical Considerations | Add to US-003 AC: smoke test requires wiki/karpathy-llm-wiki.md to exist; run AFTER US-002 smoke test, not concurrently.

[SEVERITY: H] [STORY: US-004] The contradiction-detection stub AC requires a tracking issue number that doesn't exist yet. If a sub-agent fails to create the issue, the stub will contain a literal #NNN placeholder forever. | AC stub text | Either pre-create the tracking issue OR change stub text to not contain an issue reference.

[SEVERITY: M] [STORY: US-001] .gitignore AC requires EXACTLY two-line form, but does not say WHERE to insert. Insert order matters if other wiki/ entries are added later. | .gitignore lines 50-51 precedent | Add AC: "insert at end of .gitignore; verify with `git check-ignore -v wiki/raw/README.md` returning no match."

[SEVERITY: M] [STORY: US-002] --from-draft "most recent by directory mtime" is unreliable across git checkouts / docker mounts. | AC | Replace with: "sort matches by ISO date in parent directory name (memory/YYYY-MM-DD/); take lexicographically greatest date."

[SEVERITY: M] [STORY: US-003] "Lines between opening and closing ---" is prose, not a command. /wiki-lint also parses frontmatter; divergent implementations risk silent inconsistency. | AC | Specify canonical extraction one-liner (e.g., `awk '/^---$/{f=!f;next} f{print}'`); reference from both US-003 and US-004; lock in context/rules/wiki.md.

[SEVERITY: M] [STORY: US-004] README regen AC "match US-001 template exactly" creates circular dep if US-001 ships subtly different column order. | AC US-001 / US-004 | Make US-004 AC reference the literal column string `| Slug | Title | Tags | Updated |`, not "PR 1 template."

[SEVERITY: M] [STORY: US-005] Dependency on US-002/3/4 is in a Note, not a formal dep declaration. /delegate's wave planner may not parse Notes. | AC US-005 | Make AC gate explicit: "DO NOT execute this story until US-002, US-003, and US-004 PRs are merged."

[SEVERITY: M] [STORY: *] No story specifies which branch. 5 separate branches → 5 CHANGELOG conflicts; one branch → /delegate parallelism wasted. | PRD FR-12 | Clarify branching strategy in the /delegate briefing.

[SEVERITY: L] [STORY: US-002] Slug derivation from URLs unspecified. Two sub-agents may produce different slugs for the same URL. | AC | Add slug derivation rule to context/rules/wiki.md.

[SEVERITY: L] [STORY: US-004] First entry after US-002 will always be an orphan (single-entry corpus). "Zero false positives" smoke test AC needs clarification. | AC US-004 | Clarify smoke test refers only to stale-90d / deprecated checks on fresh entry.

[SEVERITY: L] [STORY: US-003] "Configurable cap" of top 3 is described but no config mechanism specified. | AC | Either remove "configurable" or specify the mechanism.
```

Summary: **High: 4, Medium: 5, Low: 3**

## Critic B — User lens

```
[SEVERITY: H] [STORY: US-002] slug collision on re-ingest of same URL on different dates — algorithm unspecified; first invocation will expose whichever behavior the implementer picks | EVIDENCE: US-002 AC + Technical Considerations | RECOMMENDATION: Lock slug derivation rule in FR or US-002 AC; specify collision behavior.

[SEVERITY: H] [STORY: US-003] Match-Count = 0 and Match-Count < 3 behaviors undefined; a fresh-corpus query will hit undefined behavior. | EVIDENCE: US-003 AC | RECOMMENDATION: AC: "If Match-Count = 0, print 'No wiki entries matched <topic>' and exit. If Match-Count < 3, read all matches."

[SEVERITY: H] [STORY: US-002] --from-draft globbing across ALL dates can resurrect an intentionally abandoned draft; no "do not promote" convention. | EVIDENCE: US-002 AC | RECOMMENDATION: Drafts older than N days (e.g., 7) require an explicit --allow-stale flag, or document a `.skip` rename convention.

[SEVERITY: M] [STORY: US-004] No rollback if wiki/README.md regeneration is malformed. Previous hand-curated README is gone. | EVIDENCE: US-004 AC | RECOMMENDATION: Write to wiki/README.md.tmp, validate, atomically rename; on failure, exit non-zero and leave original.

[SEVERITY: M] [STORY: US-003] YAML frontmatter may contain `---` inside block scalars; naive sed will misfire. | EVIDENCE: US-003 AC | RECOMMENDATION: Specify awk approach + add negative test case.

[SEVERITY: M] [STORY: US-001] wiki/raw/ directory does not exist on fresh clone; /wiki-ingest will fail writing a snapshot. | EVIDENCE: US-001 AC | RECOMMENDATION: /wiki-ingest must `mkdir -p wiki/raw/` before writing.

[SEVERITY: M] [STORY: US-004] Broken-link check assumes slugs match `[a-z0-9-]+` but the schema doesn't constrain charset; underscores/uppercase silently miss. | EVIDENCE: US-004 AC | RECOMMENDATION: US-001 AC must constrain slug charset to `[a-z0-9-]+`; cross-reference from US-004.

[SEVERITY: M] [STORY: US-005] AGENTS.md is the symlink target of CLAUDE.md; implementer who edits CLAUDE.md directly breaks the symlink. | EVIDENCE: AGENTS.md skills table; CLAUDE.md symlink | RECOMMENDATION: Verify symlink intact before/after edit via `ls -li`.

[SEVERITY: M] [STORY: *] confidence: deprecated heuristic is referenced but never defined. Implementer will invent or leave unused. | EVIDENCE: US-001 AC vs. US-004 ACs | RECOMMENDATION: "deprecated flag is set manually by orchestrator only; /wiki-lint reports entries marked deprecated but does not set the flag autonomously."

[SEVERITY: M] [STORY: US-002] Body-merge strategy unspecified; could be append, LLM-rewrite, or section-by-section. (Overlap with Critic A US-002 finding.) | EVIDENCE: US-002 AC | RECOMMENDATION: Lock: "rewrites ## Detail section in-place; appends to ## See Also; orchestrator reviews diff before commit."

[SEVERITY: L] [STORY: US-001] Empty entries-table after first /wiki-lint with no entries may alarm orchestrator with a 0-row table. | EVIDENCE: US-001 AC / US-004 AC | RECOMMENDATION: Clarify: empty corpus = header row only, NOT an error condition.

[SEVERITY: L] [STORY: US-003] Multi-word topic handling undefined: `"llm wiki"` = AND, OR, or literal string? | EVIDENCE: US-003 argument-hint | RECOMMENDATION: Document: multi-word = space-separated OR terms (grep each word, union matches).

[SEVERITY: L] [STORY: US-002] Smoke test URL may rate-limit or redirect; should be marked manual-only. | EVIDENCE: US-002 AC | RECOMMENDATION: Mark all three smoke tests "manual QA only — not automated"; CI uses local fixture.
```

Summary: **High: 3, Medium: 7, Low: 3**

## Synthesis

- **High-severity findings**: 7 (4 from A, 3 from B; overlap of 1 on US-002 body-merge brings unique count to 6)
- **Medium-severity findings**: 12 (5 from A, 7 from B; overlap of 1 on body-merge)
- **Low-severity findings**: 6 (3 from A, 3 from B; no overlap)
- **Protected-path violations**: 0
- **Recommendation**: **PROCEED with revised PRD.**

### Mitigation strategy

Rather than HALT-and-rerun (which would loop critics on a strictly tightened PRD), all 7 HIGH findings and the load-bearing MED findings have been folded directly into the revised `tasks/karpathy-llm-wiki/prd.md` acceptance criteria. The PRD is now the canonical reference; this critique.md is the audit trail.

**HIGH findings → PRD revisions (all applied in pre-Stage-5 PRD edit):**

| ID | Story | Fix applied |
|----|-------|-------------|
| A-H1 | US-001 | Required-sections checklist added to `context/rules/wiki.md` AC (boundary table, entry schema, confidence lifecycle, sub-article split, slug charset constraint) |
| A-H2 / B-M10 | US-002 | Body-merge semantics locked: replace `## Summary` + `## Detail` in-place; append source to `sources:`; do NOT concatenate bodies |
| A-H3 | US-003 | Smoke-test sequencing AC: US-003 smoke test runs AFTER US-002 smoke test commits, not concurrently |
| A-H4 | US-004 | Stub text changed to: `contradiction detection: not yet implemented — see wiki-lint follow-up tracking` (no issue # placeholder) |
| B-H1 | US-002 + US-001 (schema) | Slug derivation rule added to `context/rules/wiki.md` AC: URL path's last non-UUID segment, lowercased + kebab-case; for ambiguous URLs, use `--slug <override>` flag |
| B-H2 | US-003 | Empty-result + sub-3-result behavior locked in AC |
| B-H3 | US-002 | Stale-draft handling: drafts older than 7 days require `--allow-stale`; `.skip` rename suppresses promotion |

**Load-bearing MED findings → PRD revisions:**

A-M1 (`git check-ignore` verification), A-M2 (date-component sort for drafts), A-M3 (canonical awk extraction one-liner in `context/rules/wiki.md`), A-M4 (literal column string in US-004), A-M5 (explicit dep gate on US-005), B-M1 (atomic README rewrite + validation), B-M2 (awk extraction approach), B-M3 (`mkdir -p wiki/raw/` in `/wiki-ingest`), B-M4 (slug charset constraint), B-M5 (`ls -li` symlink verification on US-005), B-M6 (`confidence: deprecated` set manually only; `/wiki-lint` reports but doesn't autonomously set), B-M10 (body-merge strategy).

**LOW findings → PRD revisions:**

A-L2 + B-L1 (smoke-test orphan and empty-corpus clarifications), A-L3 (config mechanism note — "hardcoded to 3 in v1"), B-L2 (multi-word OR semantics in `/wiki-query` argument-hint), B-L3 (smoke tests marked manual-only).

**Cross-cutting deferral (Critic A M-10):** Branching strategy (one branch with sequential stories vs. five branches with parallel waves) is intentionally deferred to the `/delegate` invocation — `/delegate` is the wave-planner and will choose based on the prd.json deps array. The PRD's role is to specify story-level contracts, not branching policy.

The revised PRD is ready for `/ralph` (Stage 6).
