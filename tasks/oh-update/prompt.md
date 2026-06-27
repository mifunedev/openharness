# Ralph iteration — oh-update

You are one iteration of a Ralph loop implementing the `oh-update` task
(RFC #531 Phase 3 — add an `oh update` subcommand that upgrades ONLY the `.oh/`
control plane). The full plan is `tasks/oh-update/prd.md`; the structured task list
is `tasks/oh-update/prd.json`; the critic findings are `tasks/oh-update/critique.md`.
The loop calls you again until `progress.txt` contains a line `STATUS: COMPLETE`.

## Execution model: Advisor-managed `/delegate` (REQUIRED)

**You are the Advisor for this iteration. Execute the work by fanning out `/delegate`,
not by editing files yourself.**

The **five** user stories own **disjoint files** (re-read `prd.json` for the exact
owned-file list at the end of each story):

- **US-001** → new `.oh/cli/src/commands/update.ts` (the pure `runUpdate` core)
- **US-002** → `.oh/cli/src/cli.ts` (register the `update` subcommand + help)
- **US-003** → new `.oh/cli/src/__tests__/update.test.ts` (vitest suite)
- **US-004** → new `evals/probes/oh-update.sh` + `evals/RESULTS.md` (probe + row)
- **US-005** → `.oh/README.md` + `CHANGELOG.md` (docs + changelog)

Because the file sets are disjoint they run safely as **one parallel wave**. The one
critical seam — US-002's `cli.ts` imports `runUpdate` from US-001's
`commands/update.ts` — is PINNED by the exact `runUpdate(opts, io)` /
`UpdateOptions` / `UpdateIO` signature in `prd.json` US-001, so workers write
independently and the Advisor's post-integration build+typecheck+vitest prove they
agree. US-003's test and US-004's probe assert behaviors US-001/US-002 produce — all
pinned in `prd.json`.

Each iteration:

1. **Read context**: `prd.json` (the acceptance criteria are the contract — honor
   every signature/flag/path EXACTLY), `prd.md` (the design + safety invariant),
   `critique.md` (must-fix amendments — honor every one), and the most recent
   `progress.txt` entries.
2. **Invoke `/delegate`** to run the `passes:false` stories as one parallel wave of
   **EDIT-only** workers — one worker per story, scoped to that story's owned files.
   Workers do filesystem edits; they static-verify their own files by inspection
   (US-001/US-002: re-read the file for obvious TS/syntax issues — do NOT run `tsc`,
   the worktree has no `.oh/cli/node_modules` yet; US-004: `shellcheck` their probe;
   US-005: ensure markdown/links well-formed) but do **not** run the full suite, do
   **not** stage or commit, and do **not** touch git. Hand each worker the exact
   acceptance criteria from its story.
3. As the Advisor, **integrate** the workers' output, then run the gates yourself
   (all must pass):
   - **Prerequisite (REQUIRED — the worktree has no `.oh/cli/node_modules`):**
     `npm --prefix .oh/cli ci` (mirrors `.github/workflows/ci-harness.yml`, which runs
     this before build+typecheck). Without it `build.mjs` fails on `import esbuild` and
     `tsc` fails on `node:fs` types.
   - `node .oh/cli/build.mjs` — esbuild bundles `cli.ts` → `dist/oh.js` clean (proves
     the `update.ts` import + cli wiring resolve).
   - `cd .oh/cli && npx tsc --noEmit` — typechecks clean.
   - Functional smoke (strongest local oracle): from a scratch dir, build a fake
     "newer" source checkout (copy this worktree's `.oh/` and bump
     `.oh/cli/package.json#version`) and a fake "current" equipped target; run the
     built CLI `node .oh/cli/dist/oh.js update --from <newer> --dry-run` (in the
     target) and confirm it plans `.oh/`-only writes; run without `--dry-run` and
     confirm a project file outside `.oh/` is untouched. (Or rely on the vitest suite,
     which asserts the same — but a real CLI invocation is worth one run.)
   - `bash evals/probes/oh-update.sh` exits 0 (PASS); `shellcheck evals/probes/oh-update.sh`
     clean; `jq .` is N/A (no JSON emitted here).
   - **Full vitest**: `/home/sandbox/harness/node_modules/.bin/vitest run --root <worktree>`
     — your new `update.test.ts` plus all existing suites green (the worktree has no
     `node_modules`; resolution walks up to repo-root `node_modules`).
   - Run the FULL eval probe suite (the probe loop / `/eval` runner) — no green→red
     regressions; the new `oh-update` probe PASSes.
   - **Grep sweep** (AC-I): no doc/comment claims `oh update` touches project files;
     every new reference points at the `.oh/`-scoped behavior. `grep -rIn 'oh update' .
     --exclude-dir=.git --exclude-dir=node_modules` returns only accurate hits.
   - Fix any failure (delegate a follow-up or patch directly).
4. **Stage with git yourself** (`git add -A`) and **commit per story** in priority
   order with the message format below; mark each `passes: true` in `prd.json` and
   append a `progress.txt` entry per story.
5. When **all** stories pass and every gate above is green, append `STATUS: COMPLETE`.

If `/delegate` is unavailable, fall back to implementing the stories directly in
`priority` order — but `/delegate` is the intended path.

## Commit format (per `.claude/skills/git/SKILL.md`)

```
<type>: US-<NNN> — <story title>

Submitted-by: Claude
```

`<type>` = `feat` for US-001/US-002 (net-new `oh update` behavior), `test` for
US-003, `task` for US-004/US-005. Stage only the files owned by that story. The
`Submitted-by:` trailer is mandatory.

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

- **The safety invariant is non-negotiable.** `oh update` writes ONLY under
  `<target>/.oh/` (the path-escape guard in US-001). Never weaken or remove it.
  "Project source remains untouched" must hold by construction, and the test +
  probe must prove it.
- **`runUpdate` is PURE** — no `process.exit`, no `process.argv`, no `process.cwd()`
  inside `commands/update.ts`. All argv/cwd handling lives in `cli.ts` (US-002).
- **Honor the Non-Goals** in `prd.md` — no remote-fetch (only `--from <dir>`), no
  installed-binary bundling, NO edits to `oh init`'s files (`commands/init.ts`,
  `.oh/templates/` are PR #334's and do not exist on this base — do not create or
  reference them), no new `.oh/VERSION` file, no runtime-path change.
- **Version gate reuses `.oh/cli/package.json#version`** — do not invent a new
  version source.
- **Never push** to `development`/`main`. Branch is `feat/531-oh-update`.
- **Never skip pre-commit hooks** (`--no-verify`). **Never** `git clone`/`git init`.
- **Confine writes** to repo-tracked paths under this worktree. Do not write to `~/`
  (the vitest fixtures use an OS tmpdir — that is fine and not `~`).
- **CHANGELOG discipline** — one `[Unreleased]` entry (US-005), full mifunedev #531 URL.
- **Don't modify completed stories** unless the current story explicitly requires it.

## Stop condition

After all five stories have `passes: true` in `prd.json` and every gate is green,
append a line on its own to `progress.txt`:

```
STATUS: COMPLETE
```

This terminates the loop. Also print `STATUS: COMPLETE` as the sole content of your
final line **only** when you have just written it to `progress.txt`; never print that
bare line for any other reason.

## Reference

- PRD: `tasks/oh-update/prd.md`
- Stories: `tasks/oh-update/prd.json`
- Critique: `tasks/oh-update/critique.md`
- Branch: `feat/531-oh-update`
- Issue: https://github.com/mifunedev/openharness/issues/531
