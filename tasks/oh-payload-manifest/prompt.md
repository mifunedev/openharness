# Ralph / Advisor iteration — oh-payload-manifest

You are one iteration of an Advisor-managed build implementing the `oh-payload-manifest`
task (RFC #531 follow-on, value-first step 3 — give `oh update` a declared `.oh/` payload
manifest + a de-hardcode guard probe). The plan is `tasks/oh-payload-manifest/prd.md`; the
structured task list is `tasks/oh-payload-manifest/prd.json`; the critic findings are
`tasks/oh-payload-manifest/critique.md`. The loop calls you again until `progress.txt`
contains a line `STATUS: COMPLETE`.

## Execution model: Advisor-managed `/delegate` (REQUIRED)

**You are the Advisor for this iteration. Execute the work by fanning out `/delegate`,
not by editing files yourself.**

The **five** user stories own **disjoint files** (re-read `prd.json` for the exact
owned-file list at the end of each story):

- **US-001** → NEW `.oh/cli/src/lib/manifest.ts` (pure matcher + loader)
- **US-002** → `.oh/cli/src/commands/update.ts` (wire the manifest filter into the overlay)
- **US-003** → NEW `.oh/cli/src/__tests__/manifest.test.ts` (vitest suite)
- **US-004** → NEW `.oh/manifest.json` + NEW `evals/probes/oh-payload-manifest.sh` + NEW
  `evals/probes/oh-shipped-repo-overridable.sh` + `evals/RESULTS.md` (manifest + 2 probes + 2 rows)
- **US-005** → `.oh/README.md` + `CHANGELOG.md` (docs + changelog)

Because the file sets are disjoint they run safely as **one parallel wave**. The critical
seam — US-002's `update.ts` imports `loadManifest`/`shouldShip` from US-001's
`lib/manifest.ts`, and US-003's test imports both — is PINNED by the exact signatures in
`prd.json` US-001, so workers write independently and the Advisor's post-integration
build+typecheck+vitest prove they agree.

Each iteration:

1. **Read context**: `prd.json` (acceptance criteria are the contract — honor every
   signature/flag/path EXACTLY), `prd.md` (design + the preserved safety invariant),
   `critique.md` (must-fix amendments — honor every one), and the latest `progress.txt`.
2. **Invoke `/delegate`** to run the `passes:false` stories as one parallel wave of
   **EDIT-only** workers — one worker per story, scoped to that story's owned files.
   Workers do filesystem edits and static-verify their own files by inspection
   (US-001/US-002: re-read for obvious TS/syntax issues — do NOT run `tsc`, the worktree
   has no `.oh/cli/node_modules` yet; US-004: `shellcheck` their probes + `jq .` their
   manifest.json; US-005: markdown/links well-formed) but do **not** run the full suite,
   stage, commit, or touch git. Hand each worker the exact acceptance criteria from its story.
3. As the Advisor, **integrate**, then run the gates yourself (all must pass):
   - **Prerequisite (REQUIRED — worktree has no `.oh/cli/node_modules`):**
     `npm --prefix .oh/cli ci`.
   - `node .oh/cli/build.mjs` — esbuild bundles `cli.ts` → `dist/oh.js` clean (proves the
     `lib/manifest.js` import resolves).
   - `cd .oh/cli && npx tsc --noEmit` — typechecks clean.
   - **Full vitest**: `/home/sandbox/harness/node_modules/.bin/vitest run --root <worktree>`
     — your new `manifest.test.ts` plus all existing suites (incl. `update.test.ts`) green.
   - Functional smoke (strong oracle): from a scratch dir, build a fake "newer" source
     (copy this worktree's `.oh/`, bump `.oh/cli/package.json#version`, keep `.oh/manifest.json`)
     and a fake equipped target; run the built CLI `node .oh/cli/dist/oh.js update --from
     <newer> --dry-run` in the target and confirm it prints `skip docs/... (not in payload)`
     and `skip patches/... (not in payload)` and does NOT plan any `docs/`/`patches/` writes.
   - `bash evals/probes/oh-payload-manifest.sh` and `bash evals/probes/oh-shipped-repo-overridable.sh`
     each exit 0 (PASS); `shellcheck` both clean.
   - Run the FULL eval probe suite (`bash .mifune/skills/eval/run.sh` or the probe loop) —
     no green→red regressions; both new probes PASS.
   - **Grep sweep**: `grep -rIn 'not in payload\|manifest' .oh/cli/src` returns only accurate
     hits; no doc claims the manifest reaches outside `.oh/`.
   - Fix any failure (delegate a follow-up or patch directly).
4. **Stage with git yourself** (`git add -A`) and **commit per story** in priority order with
   the message format below; mark each `passes: true` in `prd.json` and append a
   `progress.txt` entry per story.
5. When **all** stories pass and every gate is green, append `STATUS: COMPLETE`.

If `/delegate` is unavailable, fall back to implementing the stories directly in `priority`
order — but `/delegate` is the intended path.

## Commit format (per `.claude/skills/git/SKILL.md`)

```
<type>: US-<NNN> — <story title>

Submitted-by: Claude
```

`<type>` = `feat` for US-001/US-002, `test` for US-003, `task` for US-004/US-005. Stage only
the files owned by that story. The `Submitted-by:` trailer is mandatory.

## progress.txt entry format (append, never replace)

```markdown
## US-<NNN> — <YYYY-MM-DD HH:MM UTC>

**Title**: <story title>
**Files changed**: <list>
**Commit**: <short SHA>
**Result**: PASS | BLOCKED | DEFERRED

### What I did
<2-4 sentences>

### Learnings for future iterations
<patterns, gotchas>

---
```

## Critical rules

- **The path-escape guard is non-negotiable and UNCHANGED.** `oh update` still writes ONLY
  under `<target>/.oh/` (`assertDestInTarget`). The manifest filter is additive — it only
  REMOVES files from the payload, never adds a dest outside `.oh/`. Do not relax the guard
  to ship `.mifune/skills` (deferred — decision C).
- **`runUpdate` stays PURE and signature-stable** — no `process.exit/argv/cwd` in
  `commands/update.ts` or `lib/manifest.ts`; the summary-line format is unchanged.
- **Allowlist is safe-by-default** — a `.oh/` path not in `include` does NOT ship. Keep
  `docs/**` and `patches/**` OUT of include.
- **Honor the Non-Goals** in `prd.md` — no `oh init` change (no `commands/init.ts`/
  `.oh/templates/` create/import — those are PR #334's, absent on this base), no instance
  extraction, no cron de-hardcoding, no `docs.yml` churn, no remote-fetch, no runtime-path change.
- **Never push** to `development`/`main`. Branch is `feat/531-oh-payload-manifest`.
- **Never skip pre-commit hooks** (`--no-verify`). **Never** `git clone`/`git init`.
- **Confine writes** to repo-tracked paths under this worktree. Do not write to `~/` (vitest
  fixtures using an OS tmpdir are fine).
- **CHANGELOG discipline** — append within the existing `[Unreleased]` block (it may already
  hold #336's entry on this stacked base); full mifunedev #531 URL.

## Stop condition

After all five stories have `passes: true` in `prd.json` and every gate is green, append a
line on its own to `progress.txt`:

```
STATUS: COMPLETE
```

This terminates the loop. Print `STATUS: COMPLETE` as the sole content of your final line
**only** when you have just written it to `progress.txt`.

## Reference

- PRD: `tasks/oh-payload-manifest/prd.md`
- Stories: `tasks/oh-payload-manifest/prd.json`
- Critique: `tasks/oh-payload-manifest/critique.md`
- Branch: `feat/531-oh-payload-manifest` (stacked on `feat/531-oh-update` / PR #336)
- Issue: https://github.com/mifunedev/openharness/issues/531
