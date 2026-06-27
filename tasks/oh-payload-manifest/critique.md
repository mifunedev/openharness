# Critique — oh-payload-manifest

Two adversarial critics (lens 1: safety + matcher correctness; lens 2: scope + sequencing +
contract honesty). Both returned **APPROVE-WITH-MUSTFIX**. Every blocking finding was
verified against the actual #336 base (`.worktrees/feat/531-oh-payload-manifest`) and folded
into `prd.json`/`prd.md` before build. Verdict after amendments: **SPEC-APPROVED**.

## Verified base facts (corrected my stale audit)

- `prompt-miner-caps.sh` lives at **`.mifune/skills/prompt-miner/prompt-miner-caps.sh`**, NOT
  `.oh/scripts/`. It is therefore **not shipped by `oh update`** (which writes only under
  `.oh/`). The earlier audit's `.oh/scripts/prompt-miner-caps.sh:21` was stale.
- Shipped `.oh/` shell scripts referencing the upstream repo: `.oh/scripts/install.sh`
  (L221 `${OH_GITHUB_REPO:-mifunedev/openharness}` overridable ✓; L135 help-text; L225
  `!= "mifunedev/openharness"` comparison) and `.oh/scripts/maintenance/restart-openharness-tmux.sh:29`
  (`${OH_REPO:-ryaneggz/openharness}` overridable ✓). `.oh/docs/*` refs do NOT ship (docs
  excluded). `.oh/scripts/__tests__/*.test.ts` + `cron-runtime.ts` are clean of bare literals.
- `.oh/config.json` is **absent** on this base — Critic-2's SF-1 is moot (over-claim, dropped).
- `evals/RESULTS.md` neighborhood: `next-dev-prod` → `oh-update` → `owned-surface-guard`.

## MUST-FIX (folded)

1. **Guard probe SKIP anchor + false-positives (Critic-1 #1/#5, Critic-2 MF-1/MF-2).** The
   probe pointed at the relocated `prompt-miner-caps.sh` (→ always SKIPPED, contradicting the
   pre-seeded PASS) and its `grep -v ':-'` filter would flag `install.sh` help-text + the `!=`
   comparison. **Redesigned (US-004):** scan shipped `.oh/**/*.sh` for a **bare assignment** of
   the upstream literal via `grep -rnE '=["'\'']?(mifunedev|ryaneggz)/openharness' --include='*.sh'`.
   This precisely targets `VAR="mifunedev/openharness"` while NOT matching the override form
   (`="${VAR:-...}"` → `="${` not `="mifunedev`), help-text (no `=` before the literal), or a
   spaced comparison (`!= "..."` → `= ` + space, which `=["']?` rejects). Positive assert:
   `install.sh` keeps `${OH_GITHUB_REPO:-`. SKIP anchor → `.oh/scripts/install.sh` absent.
   Scope `.sh`-only is documented in `# desc:` (shipped `.ts`/`.mjs` are clean today; covered
   by typecheck/review — a spaced-`=` regex would re-introduce the comparison false-positive).
2. **`include: []` silent-hollow-out footgun (Critic-1 #3, Critic-2 implicit).** A present but
   empty `include` array is truthy and non-null → `shouldShip` returns false for everything →
   `oh update` silently ships NOTHING. **Fixed (US-001):** `loadManifest` returns `null`
   (→ back-compat legacy-mode WITH the warning) when `include` is absent, non-array, **or
   empty**. US-003 adds a unit case asserting `include:[]` → null. US-004's manifest probe
   asserts `.include | length > 0`.
3. **RESULTS.md rows alphabetically backward (Critic-1 implicit, Critic-2 MF-3).** Both new
   rows (`oh-payload-manifest`, `oh-shipped-repo-overridable`) sort BEFORE `oh-update`.
   **Fixed (US-004 AC-5):** insert both between `next-dev-prod` and `oh-update`, in the order
   `oh-payload-manifest` then `oh-shipped-repo-overridable`.

## SHOULD-FIX (folded / adopted)

- **PR base = `feat/531-oh-update`, not `development` (Critic-2 SF-2).** Open the stacked PR
  with base `feat/531-oh-update` so the diff is only this slice's ~6 files; retarget to
  `development` after #336 merges + rebase. Adopted in the ship step (not a prd.json field).
- **Probe `.sh`-only scope (Critic-1 #4, Critic-2 SF-… ).** Documented in the probe `# desc:`;
  shipped `.ts`/`.mjs` verified clean today. Broadening deferred (a spaced-`=` regex re-breaks
  on comparisons).
- **Volatile-skip ⊕ manifest-skip ordering (Critic-2 testing gap).** US-003's exclude-wins case
  (`cli/dist/oh.js` + `exclude:['**/dist/**']`) plus the existing per-segment volatile skip both
  drop it; the volatile skip runs first (unchanged), so a `dist/` file never reaches the manifest
  filter. Acceptable; noted.

## NITS (acknowledged)

- Proposal step-3 "name each probe layer" → added to `prd.md` Non-goals as explicitly deferred.
- Legacy-mode warning stays on `io.stdout` (keeps the dry-prefix invariant; US-003 asserts it
  there). Date stamp `2026-06-27` is today; Advisor may refresh if the build spans midnight UTC.
- `.oh/scripts/__tests__/` ships under `scripts/**` — harmless (tests reference mifune in
  assertions, not executable issue-filing); a future manifest refinement may exclude `__tests__`.

## What's solid (both critics)

- Path-escape injection is **structurally impossible**: globs only filter an already-walked
  POSIX relpath set; `dest`/`assertDestInTarget` are unchanged and run after the filter.
- `globToRegExp` spec is precise (left-to-right tokenization forbids double-translate; leading
  `**/` → `(?:.*/)?`); worked examples correct.
- Back-compat `null` → legacy-all + warning is the right fail-open default.
- Five-story file ownership is genuinely disjoint; the parallel wave is sound.

STATUS: SPEC-APPROVED
