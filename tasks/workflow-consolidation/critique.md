# Critique — workflow-consolidation (pass 2, post-rewrite)

Generated 2026-06-19 on the rewritten PRD (deprecate loop machinery + spec-plan/spec-execute split). Two `critic` agents (implementer + user lens). The original pass-1 critique is superseded (git history retains it).

## Load-bearing claim — VERIFIED ✓
Critic A read all four loop probes: `loop-handoff-consistency.sh` / `loop-benchmark-gate.sh` / `loop-repeat-gate.sh` scope via `awk '/^## 2\./…'` / `awk '/^## 7\./…'`; `orchestrate-contract.sh` uses file-wide `grep -qF`. A `> DEPRECATED` blockquote placed after the H1 and before the first `---` is invisible to all four. **The in-PR deprecation-by-additive-banner is probe-safe** — provided the banner contains NO `## ` heading (already required by US-002).

## Critic A — Implementer lens (findings → mitigations)
- [L] Probe claim VERIFIED (above). "No `## ` in banner" constraint must reach the executor verbatim → kept in US-002.
- [M, US-005] `orchestrate/SKILL.md` has YAML frontmatter; "at the top" is ambiguous — inserting before/in the `---` breaks frontmatter while `orchestrate-contract` (file-wide grep) still passes, masking the damage. → **Mitigated**: US-005 placement anchor = after the `# Orchestrate` H1, never inside the YAML `---`.
- [M, US-002] loop.md intro "**this file leads**" (lines 8–10) contradicts the DEPRECATED banner. → **Mitigated**: US-002 reconciles the intro authority claim, not just See-Also.
- [M] Deprecated loop.md remains live authority for every skill's `## Handoff` validation; coherence gap unnamed. → **Mitigated**: Verification states the known gap (deferred to Issue A).
- [M, US-001/003] AGENTS.md names `/spec-plan`+`/spec-execute` which don't exist yet → skill-not-found. → **Mitigated** (see Critic B H1).
- [M, US-001] Skills-table adjacency risk. → **Mitigated**: US-001 requires diffing the Skills table before/after.
- [L, US-003] probe scoping mechanism unspecified. → **Mitigated**: US-003 requires awk section-scoping.
- [L, US-004] override notes unverifiable; Issue A handoff inventory underspecified. → **Mitigated**: US-004 minimum override wording + `grep -rl '^## Handoff' .claude/skills/` inventory in Issue A.

## Critic B — User lens (findings → mitigations)
- [H1, US-001] Mermaid names `/spec-plan`+`/spec-execute` as primary nodes that don't exist; operator invokes → fails. → **Mitigated**: mermaid node labels carry "(/ship-spec today)"; US-001 requires the `/ship-spec` literal + "until Issue C" caveat inside § Workflow; US-003 probes that literal.
- [H2, US-002] loop.md will hold two contradictory authority claims (banner vs "this file leads"). → **Mitigated**: US-002 reconciles the intro authority prose (in scope; not §2/§7 tables).
- [M, US-004] Issue A (remove) ordered before Issue C (build replacements). → **Mitigated**: Issue A marked **BLOCKED ON Issue C**.
- [M, US-003] probe doesn't guard the current-vs-aspirational caveat. → **Mitigated** (US-003 guards the `/ship-spec` literal).
- [M, *] Deprecating two authoritative artifacts is a behavior change (authority-chain reversal) underplayed. → **Mitigated**: Introduction + Critic Synthesis surface it as intentional.
- [L, US-001] Skills-table↔§Workflow not bidirectionally linked. → **Mitigated**: caveat references the `/ship-spec` Skills-table row.
- [L, US-004] Issue B pre-decides probe retirement before its own critic pass. → **Mitigated**: scoped to "evaluate in that PR's own critic pass."

## Synthesis
- **High-severity findings**: 2 (honesty gap — naming unbuilt skills as canonical; loop.md authority contradiction). **Both mitigated at the AC level.** The load-bearing deprecation-safety claim was independently verified.
- **Medium**: 6 — all mitigated. **Low**: 4 — all mitigated.
- **Recommendation**: **PROCEED** (after applying mitigations to prd.md/prd.json). No GitHub-side state changed during the gate.
- **Design follow-on (operator, same session)**: add `/spec-critique` + `/spec-retro` to the spec-* family and make `/spec-plan ⇄ /spec-critique` loop until critics are satisfied — folded into the operative path + Issue C. This very pass is that loop in action.
