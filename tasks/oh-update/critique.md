# Critique — oh-update (RFC #531 Phase 3)

Two adversarial critics reviewed the plan against the live `origin/development`
codebase before any code was written (the `plan ⇄ critique` loop). Both verdicts
plus the folded resolutions are recorded here.

## Verdicts

| Critic | Verdict |
|---|---|
| **implementer** (implementability vs. the real build/test/probe) | **SOUND-WITH-AMENDMENTS** |
| **critic** (adversarial: safety holes, version edge cases, scope honesty) | **SHIP-WITH-MUST-FIX** |

Neither said DO-NOT-SHIP; both found the architecture sound (standalone off
`origin/development`, disjoint from #334, `.oh/`-scoped overlay) and raised concrete,
folded-before-build amendments.

## MUST-FIX (all folded into prd.json / prd.md / prompt.md before approval)

- **MF-1 — `npm --prefix .oh/cli ci` prerequisite** *(implementer).* The worktree has
  no `.oh/cli/node_modules`; the Advisor's `node build.mjs` + `tsc --noEmit` gates fail
  without an install (CI's `ci-harness.yml` runs `npm --prefix .oh/cli ci` first).
  → **Folded:** `prompt.md` step 3 now prepends the install as a REQUIRED prerequisite;
  `prd.md` AC-F notes it; worker static-verify no longer runs `tsc` (inspection only).

- **MF-2 — phantom `init.ts` mirror** *(implementer).* US-001 AC-1 told the worker to
  "mirror the existing init.ts pattern", but `commands/init.ts` does not exist on this
  base (it is PR #334's). A worker would find nothing and stall.
  → **Folded:** US-001 AC-1 rewritten to specify a fully self-contained `walkFiles`
  (readdirSync + lstatSync), no init.ts reference; `prd.md` "Code shape" heading +
  `prd.json` description de-reference `runInit`.

- **MF-3 — path-escape test unimplementable** *(both — critic MUST-FIX 1, implementer
  SHOULD-FIX 1).* `path.relative` never yields a `..`-prefixed relpath from a real
  entry, so no filesystem fixture can trigger the guard; the test as written ("craft a
  fixture") cannot fail.
  → **Folded:** the guard is now an **exported pure helper**
  `assertDestInTarget(dest, targetOh, sep)` (US-001 new AC); US-003 test (7) unit-tests
  it directly with `path.resolve(targetOh, '../outside.ts')`; US-004 probe greps for it.

- **MF-4 — version parser mis-ranks pre-release/build suffixes** *(critic MUST-FIX 2).*
  `parseInt('0-dev')===0`, so `'0.1.0-dev'` falsely equals `'0.1.0'` — and cli.ts's own
  fallback is literally `'0.0.0-dev'`. `'0.1.0+build'` would falsely outrank `'0.1.0'`.
  → **Folded:** US-001 AC-3 now requires stripping at the first `-`/`+`
  (`seg.split(/[-+]/)[0]`) before `parseInt`, NaN/empty→0; US-003 test (5) adds a
  `'0.1.0'` vs `'0.1.0-dev'` EQUAL case.

## SHOULD-FIX (folded — cheap and quality-raising)

- **SF-1 — skip symlinks in source traversal** *(critic 3 / implementer 2).* The
  historical `.oh/` had back-compat symlinks (removed in #322); a source at an older tag
  could follow a dir symlink and copy external content INTO target `.oh/` (dest guard
  still holds, but content origin would be undefined). → US-001 AC-1 now uses `lstatSync`
  to skip both file and dir symlinks.
- **SF-2 — newline discipline** *(critic 4).* `process.stdout.write` adds no `\n`. →
  US-001: every io.stdout/io.stderr string ends with `\n`.
- **SF-3 — exact summary format** *(critic 5).* Ambiguous `<overwrite|create>d` for
  mixed runs. → US-001 pins `oh update: <x> created, <y> overwritten, <s> skipped\n`.
- **SF-4 — doc honesty** *(critic 6).* `.oh/` files (incl. user-modified configs) are
  overwritten in place with no backup. → US-005 README must disclose this plainly; only
  files OUTSIDE `.oh/` are guaranteed untouched.
- **SF-5 — nested volatile-skip test** *(critic testing gap).* The skip is per-SEGMENT,
  not top-level `startsWith`. → US-003 test (9) uses `cli/node_modules/pkg/index.js`.
- **SF-6 — force + dry-run** *(critic edge case).* `--dry-run` must suppress writes even
  on the `--force` path. → US-001 AC-4 states it; US-003 test (6) covers it.

## NON-ISSUES (verified fine — not re-litigated)

- `vitest.config.ts` really includes `.oh/cli/**/__tests__/**/*.test.ts` → US-003
  auto-discovered. (implementer CONFIRMED)
- NodeNext `.js`→`.ts` specifier is the established repo pattern (cli.property.test.ts).
- No help-output snapshot test exists → adding an `update` line to `printOhHelp` breaks
  nothing. (implementer searched)
- Conciseness gate applies only to `workspace/*.md` → `.oh/README.md` + `CHANGELOG.md`
  out of scope.
- `startsWith(targetOh + sep)` correctly rejects a `.ohX` sibling; `..` cannot escape via
  real entries. (critic NON-ISSUE)
- No new npm packages (node:fs + node:path only). RESULTS.md `2026-06-27 00:00` matches
  the placeholder convention. `oh-update` alphabetical slot confirmed (between
  `next-dev-prod` and `owned-surface-guard`).

## Decision

All four MUST-FIX and all six SHOULD-FIX folded into `prd.json` / `prd.md` / `prompt.md`.
`prd.json` re-validated (`jq` → 5 stories, valid). The plan is approved for execution.

STATUS: SPEC-APPROVED
