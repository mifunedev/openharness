# Critique — oh-init-scaffold (RFC #531 Phase 2, slice 1)

Two independent adversarial critics reviewed the plan (`prd.md` + `prd.json`) **before any
code**. Both approved with amendments; all must-fix items are folded into `prd.json`/`prd.md`.

| Critic | Lens | Verdict |
|---|---|---|
| implementer | "will it build / integrate / pass CI?" | **SOUND-WITH-AMENDMENTS** |
| critic | "edge cases / safety / scope / contract gaps" | **SHIP-WITH-CHANGES** |

## Must-fix amendments folded in

| # | Source | Finding | Amendment |
|---|---|---|---|
| A | implementer | Test `import.meta.url` is **3 levels** up from `src/__tests__/` to `.oh/`, not 2. A worker copying the `cli.ts` 2-level path would resolve `.oh/cli/templates` (absent) → every test fails (and the precondition-error test would falsely pass, masking it). | US-002 AC pins `'../../../templates'` for the test; `'../../templates'` only for `cli.ts`/`dist`. |
| B | critic | **Installed-binary `oh init` non-functional.** Dockerfile `COPY .oh/cli/ /opt/oh/` (line 136) + `ln -sf …/oh.js /usr/local/bin/oh` (139) → on-PATH `oh` resolves templates to `/opt/templates`, never COPY'd. | Operator scoped the Dockerfile OUT ("live `.devcontainer/` UNTOUCHED"). Resolution: add a `--templates <dir>` flag + a **contextual** templates-not-found error; document installed-binary auto-bundling as a deferred Non-Goal. Folded into US-002/US-003/US-004 + prd.md Non-Goals + AC-10. |
| C | critic | **`--dry-run` vs `mkdir -p` conflict** — the mapping rule mkdir's a missing target, but dry-run "writes nothing". | US-002 AC + prd.md mapping rule: dry-run skips mkdir and reports the missing target as "would create"; targetDir-is-a-file still exits 1. New test: dry-run with a missing targetDir does not create it. |
| D | critic | **Path-escape guard** `startsWith(t)` admits a sibling (`/tmp/target-x` for `/tmp/target`). | Pin `resolved === t || resolved.startsWith(t + path.sep)`. |

## Should-fix amendments folded in

| # | Source | Finding | Amendment |
|---|---|---|---|
| E | critic | `.gitignore` append: dedup must be trim-aware + result must end with a newline (mirror `lib/env.ts`). | US-002 AC pins `trimEnd()` dedup + trailing-`\n` guarantee + idempotency/partial-existing tests. |
| F | critic | Unexpected fs errors mid-scaffold → undefined exit. | US-002 AC: such errors propagate; the existing CLI top-level catch maps them to exit 2. `runInit` itself returns only 0/1. |
| G | critic | AC-9 ("live files unchanged") didn't name `.gitignore`, which an in-place run would append to. | AC-9 reworded: in-place run only appends dedup'd `.gitignore` entries (benign) + skips existing files; never run in this PR's build/CI. |
| H | critic | Empty-payload (only README) behavior unspecified. | US-002 AC: empty payload → exit 0, zero writes (test added). |

## Noted, not blocking

- **implementer SHOULD-FIX:** `evals/probes/*.sh` is **not** in the CI `boot-lint` shellcheck glob (only `.devcontainer/`, `.oh/install/`, `.oh/scripts/`, `.claude/...`). US-004 "shellcheck clean" is therefore enforced **manually** in the verify step, not by CI. Extending the glob would lint *all* probes (risking pre-existing-warning failures) and touch the protected `ci-harness.yml` — out of scope. The new probe will be shellchecked by hand before commit.
- **implementer NIT:** `npm --prefix .oh/cli run build` is exercised by CI implicitly via the `prepare` script during `npm ci` (under the "Typecheck" step), not a dedicated "Build" gate. `dist/oh.js` existence is still verified locally in the verify step.
- **implementer confirmations:** esbuild `bundle:true, format:esm` (0.28.x) preserves `import.meta.url` as a live ref to the output file (2-level arithmetic from `dist` is correct); vitest include glob matches `src/__tests__/init.test.ts`; `node:fs/os/path` need no new dep; **file ownership is fully disjoint** across US-001..004 → parallel delegation is safe.
- **critic NITs:** `devcontainer.json` `:latest` will pull a real image once GHCR is populated (documented in templates/README); RESULTS.md row date hardcoded per repo convention; probe checks the repo `.oh/templates/` not the installed `/opt/templates` path (acceptable — the installed gap is a documented Non-Goal).

## Verdict

**APPROVED.** Both critics cleared with amendments; all four must-fix items (A–D) and four
should-fix items (E–H) are folded into `prd.json` (US-002 grew 6→10 ACs; US-003 + US-004
updated) and `prd.md` (Non-Goals, mapping rule, acceptance rollup). The slice stays minimal
and **boot-path-untouched**; the one real-world functionality gap (installed-binary template
resolution) is honestly deferred with a usable `--templates` escape hatch.

    STATUS: SPEC-APPROVED
