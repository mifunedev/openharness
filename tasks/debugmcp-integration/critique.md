# Critique — debugmcp-integration

Generated 2026-06-23; reviews `prd.md` post-/prd, pre-/ralph. Two asymmetric critics (implementer + user lens), both cross-checked `.claude/protected-paths.txt`.

## Critic A — Implementer lens

- **[SEVERITY: H] [STORY: US-006]** Wiki frontmatter ACs omit `title` and `sources`, which `context/rules/wiki.md` requires; an empty `title` cell silently mismatches the `wiki-readme-index` probe → CI REGRESSION. | EVIDENCE: US-006 AC only checks `slug: debugmcp`; `context/rules/wiki.md` §2 requires `title`, `sources`. | REC: add explicit ACs for `title:`, `sources:` (and `related:`) frontmatter.
- **[SEVERITY: H] [STORY: US-006]** Sequencing contradiction: Technical Considerations says US-006 "may parallelize once US-001 lands" but Wiki Alignment says it "must reflect the final documented state once US-001–US-005 land." | EVIDENCE: prd.md §Technical Considerations vs §Wiki Alignment. | REC: remove the US-006 parallelization exception; it depends on US-002/003/005 (priority 6 is correct).
- **[SEVERITY: M] [STORY: US-003]** Guard `grep -n 'debugger ' …` fires on natural prose ("attach the debugger to…"). | REC: scope to CLI-invocation lines or code blocks (`grep -nE '^\s*debugger [a-z]'`).
- **[SEVERITY: M] [STORY: US-004]** PASS/REGRESSION/SKIPPED boundary underspecified ("exits 1 on unexpected state"). | REC: name the PASS predicate precisely (HTTP 2xx + expected content-type from `/mcp`); connection-refused → SKIPPED, bound-but-bad-response → REGRESSION.
- **[SEVERITY: M] [STORY: US-004]** RESULTS.md hand-inserted row has no specified status value; inserting `PASS` in a clean sandbox (which exits 2/SKIPPED) is misleading; insertion position (alphabetical) unspecified. | REC: specify initial row status `SKIPPED`, inserted in alphabetical probe-id order.
- **[SEVERITY: L] [STORY: US-001/002/003/005/006/007]** "Typecheck passes" AC is a no-op for markdown-only stories (tsc touches only `packages/`). | REC: harmless to keep; optionally drop for pure-markdown stories.
- **[SEVERITY: L] [STORY: US-004]** Bash `/dev/tcp` trips the `warn-devtcp.sh` PreToolUse hook + needs strict-mode guarding. | REC: prefer `curl -sf` as the primary check.
- Edge cases: US-001 verdict tokens (VIABLE/BLOCKED/UNVERIFIED) not grep-verified; US-003 13-tool-name list not grep-verified; `wiki/raw` snapshot must be `git add -f` (gitignored); `set -euo pipefail` + `/dev/tcp` open must be guarded so a closed port exits 2 not 1.

## Critic B — User lens

- **[SEVERITY: H] [STORY: US-001]** If all four feasibility paths land `UNVERIFIED`, the remaining six stories ship aspirational docs on an unverified foundation — cost/benefit inversion for a single-developer harness. | EVIDENCE: prd.md §Open Questions. | REC: docs must honestly carry the feasibility verdict forward (no aspirational claims); add a Non-Goal framing this as exploratory; wiki confidence stays `provisional`; US-003/006 condition their claims on the US-001 verdict.
- **[SEVERITY: H] [STORY: US-003]** Tool surface is derived from external MIT extension v2.0.1 with no version anchor or committed API snapshot → silent drift. | EVIDENCE: prd.md §Technical Considerations cites tool params with no version pin. | REC: anchor the docs + wiki snapshot to v2.0.1 explicitly so drift is detectable.
- **[SEVERITY: M] [STORY: US-004]** REGRESSION (exit 1) underspecified; a curl timeout / connection-refused should map to SKIPPED, not REGRESSION. | REC: REGRESSION only when port 3001 is bound but `/mcp` does not return a valid HTTP 200.
- **[SEVERITY: M] [STORY: US-007]** Decision gate is a dead-end — no follow-on action mechanism after the maintainer chooses. | REC: gate section includes a `## Next Steps` stub with a pre-written (non-executable) `gh issue create` body per non-docs-only option.
- **[SEVERITY: M] [STORY: US-005]** `/really-debug` is a forward reference to a ghost skill (no SKILL.md, no protected-paths entry). | REC: reduce to one sentence + add a Non-Goal stating it's a named future possibility, not an artifact of this PR.
- **[SEVERITY: M] [STORY: US-001]** Four paths conflate operator-side (Attach/Remote-SSH, trivially VIABLE, host-IDE-dependent) with container-side (the real headless question). | REC: split the feasibility table into Container-side vs Operator-side tiers; the filed question is container-side only.
- **[SEVERITY: L] [STORY: US-006]** Example cross-link slugs (`pi-messenger-bridge`, `sandbox-auth-volumes`) are not topically adjacent to DebugMCP. | REC: prefer the slug with the closest sandbox-constraint angle; note inbound-orphan is expected.
- **[SEVERITY: L] [STORY: *]** Port 3001 is unreserved (`forwardPorts` empty) and the PASS check doesn't authenticate the response as DebugMCP-specific. | REC: Non-Goal "reserving 3001 in devcontainer.json (post-decision)"; tighten PASS to verify `/mcp` content-type.

## Synthesis

- **High-severity findings**: 4 (US-006 ×2, US-001, US-003)
- **Medium-severity findings**: 4 (US-004 ×1 shared, US-007, US-005, US-001 tiers)
- **Low-severity findings**: 2 (+ edge cases)
- **Protected-path violations**: none (PRD correctly excludes Dockerfile/entrypoint/devcontainer and all `.mifune/skills/` paths)
- **Recommendation**: REVISE-PRD — four unmitigated highs block commitment; all are closeable by PRD/prd.json edits without changing scope.

## Round 2 — Mitigations applied (post-DENIED revision)

The PRD + prd.json were revised (see `prd.md` revision note). Each prior finding is now **mitigated** at the AC level:

- **[H US-006 frontmatter]** → MITIGATED: US-006 AC now requires `title`/`slug`/`tags`/`sources`/`related`/`confidence` with a per-field `awk|grep` check.
- **[H US-006 sequencing]** → MITIGATED: parallelization exception removed; Technical Considerations states US-006 depends on US-002/003/005 (priority 6, not parallelizable).
- **[H US-001 cost/benefit]** → MITIGATED: intro + Non-Goals frame this as documenting an integration contract + feasibility *status* (not a running capability); US-003/US-006 ACs carry the US-001 verdict forward honestly; wiki `confidence: provisional`.
- **[H US-003 version drift]** → MITIGATED: docs anchored to v2.0.1; FR-6 + US-006 raw snapshot pin the v2.0.1 tool schema.
- **[M US-004 predicate]** → MITIGATED: precise SKIPPED/PASS/REGRESSION contract (connection-refused→SKIPPED, bound-but-bad→REGRESSION).
- **[M US-007 dead-end]** → MITIGATED: `## Next Steps` stub with a separate `gh issue create` body per non-docs-only option.
- **[M US-005 ghost skill]** → MITIGATED: `/really-debug` reduced to one sentence + Non-Goal ("named future possibility, not an artifact").
- **[M US-001 tiers]** → MITIGATED: feasibility split into Container-side vs Operator-side tiers; filed question scoped container-side.
- Actionable lows (US-003 grep tightened to CLI lines; US-004 `curl -sf` + RESULTS row `SKIPPED`/alphabetical; US-006 sandbox-adjacent cross-link) → addressed.

**Round-2 closure verifier**: `VERDICT: PROCEED`. All 8 closed; raised 3 minor follow-ons (US-006 `related:` grep, US-007 per-option block, US-002 must-not-create `.mcp.json`) — all three closed in the same revision.

- **Final recommendation**: PROCEED — zero unmitigated highs; remaining findings are M/L and AC-addressed. Spec clears the gate.
