# PRD: Fix autopilot $OWNED_PATHS pathspec expansion under zsh

## Introduction

The `/autopilot` skill's owned-surface guard (§1) and scoped branch-restore
(§5/§6/§7) both rely on `$OWNED_PATHS` **word-splitting** into 10 separate git
pathspecs. The skill currently declares it as a space-separated string and uses
the bare unquoted form `git diff --quiet -- $OWNED_PATHS`, with an inline
comment that mandates the bare form and warns only against *quoting* it.

But the autopilot runtime shell is **zsh** (`readlink /proc/$$/exe` →
`/usr/bin/zsh`), and zsh does **not** word-split unquoted parameter expansions
by default (no `SH_WORD_SPLIT`). So the bare `-- $OWNED_PATHS` collapses to a
**single** bogus pathspec — the exact failure the comment tried to avoid. The
guard then matches no files, reports the tree clean, and is **vacuously
satisfied** even when an owned path is dirty (verified this run: a dirty
`tasks/README.md` was NOT caught under zsh). The scoped restore likewise errors
(`pathspec ... did not match any file(s)`) when residue is present, stranding
HEAD on the feature branch and failing the next fire's §1 branch guard.

The fix converts `OWNED_PATHS` to a **native array** — `OWNED_PATHS=(...)` —
and expands every pathspec as `"${OWNED_PATHS[@]}"`. This syntax is identical
and correct in **both** bash and zsh (verified: `set -- "${OWNED_PATHS[@]}"`
yields 10 args under each), eliminating the word-split dependency entirely. The
two eval probes that assert the guard/restore shape (`owned-surface-guard.sh`,
`clean-restore.sh`) are updated **in the same atomic story** to match the new
form, add a regression guard against reintroducing the broken bare form (both
the plain and `--cached` variants), and close the bash-only fidelity gap by
exercising the form under `zsh`.

## Goals

- Make the §1 guard and §5/§6/§7 restore pathspec expansion correct under zsh
  (and bash) regardless of the caller's `$0`.
- Remove every bare unquoted `-- $OWNED_PATHS` occurrence (plain AND `--cached`)
  from the autopilot `SKILL.md`; correct every stale comment/prose reference to
  name the zsh hazard and the array form.
- Update both eval probes — atomically with the SKILL.md edit — to assert the
  new array form, guard against the broken bare form returning, and meaningfully
  cover zsh behavior (close the bash-only fidelity gap).
- Verify under zsh that a dirty owned path now fires `BLOCKED-OWNED-WIP` and the
  restore discards residue and lands on `development`.

## User Stories

> **Atomicity note (resolves critic high-severity finding):** US-001 bundles the
> SKILL.md edit AND both probe edits into a single story so they land together.
> The probes currently PASS by asserting the *broken* bare form; removing that
> form without updating the probes in the same unit would flip them to
> REGRESSION. Ralph commits one story per iteration, so keeping these in one
> story guarantees the committed state is always self-consistent. (The
> pre-commit hook runs only `lint && vitest` — it does not execute the probes —
> and the `/eval` gate runs once at the end against the final branch state, so
> there is no CI breakage on an intermediate commit; the bundling is for
> repository hygiene and to make the coupling impossible to half-apply.)

### US-001: Convert OWNED_PATHS to an array, fix all expansion sites, and update both probes (atomic)

**Description:** As the autopilot operator, I want the owned-surface guard and
scoped restore to word-split `OWNED_PATHS` correctly under zsh — and the eval
probes updated in lockstep — so the safety guard actually detects a dirty owned
tree instead of being vacuously satisfied, and a regression cannot silently
reintroduce the bug.

**Acceptance Criteria — SKILL.md (`.claude/skills/autopilot/SKILL.md`):**

- [ ] The declaration (~L74) changes from the string form to the array form:
      `OWNED_PATHS=(.claude/ context/ docs/ scripts/ crons/ wiki/ evals/ memory/ tasks/ CHANGELOG.md)`
      (same 10 tokens, parenthesized, no surrounding quotes).
- [ ] Every occurrence of `git diff --quiet -- $OWNED_PATHS` **and**
      `git diff --cached --quiet -- $OWNED_PATHS` is replaced with the array form
      `git diff --quiet -- "${OWNED_PATHS[@]}"` /
      `git diff --cached --quiet -- "${OWNED_PATHS[@]}"`. Sites include the §1
      guard code block (~L95), §5 prose (~L268), §6 prose (~L294), §7 restore
      assertion code block (~L327), Guidelines prose (~L362).
- [ ] Every occurrence of `git checkout development -- $OWNED_PATHS` is replaced
      with `git checkout development -- "${OWNED_PATHS[@]}"` (§5 ~L268, §6 ~L294,
      §7 code ~L325, Guidelines ~L362 — at least 4 occurrences).
- [ ] The inline comment at the `OWNED_PATHS=` declaration is rewritten to state
      the hazard is BOTH **quoting** (`"$OWNED_PATHS"` collapses to one pathspec
      under bash AND zsh) AND **bare-unquoted-under-zsh** (zsh has no
      `SH_WORD_SPLIT` by default, so the bare form ALSO collapses), and that the
      array form `"${OWNED_PATHS[@]}"` expands correctly under both shells.
- [ ] All stale guidance text is corrected: `grep -F 'bare, unquoted' .claude/skills/autopilot/SKILL.md`
      returns nothing, and `grep -F 'used UNQUOTED' .claude/skills/autopilot/SKILL.md`
      returns nothing. The §1 NOTE block (~L83-94) and the §7 end-of-line comment
      that reads `OWNED_PATHS unquoted` (~L325) are updated to describe the array
      form.
- [ ] Prose/descriptive mentions of `$OWNED_PATHS` that don't carry the `-- `
      pathspec prefix (the §1 NOTE block and the `BLOCKED-OWNED-WIP` row of the
      Reference status-token table, ~L380) are updated to `${OWNED_PATHS[@]}` so
      no stale `$OWNED_PATHS` reference invites reintroducing the bare form.
      (`OWNED_PATHS` the bare word — e.g. "the OWNED surface" / "the owned-path
      array" — may remain; only the `$OWNED_PATHS` *expansion* spelling is
      replaced.)
- [ ] After the change, ALL FOUR of these greps return nothing:
      `grep -F 'git diff --quiet -- $OWNED_PATHS'`,
      `grep -F 'git diff --cached --quiet -- $OWNED_PATHS'`,
      `grep -F 'git checkout development -- $OWNED_PATHS'`,
      `grep -F -- '-- "$OWNED_PATHS"'` (the quoted form), each over
      `.claude/skills/autopilot/SKILL.md`.
- [ ] `grep -Fc 'git checkout development -- "${OWNED_PATHS[@]}"' .claude/skills/autopilot/SKILL.md`
      returns ≥ 4.
- [ ] The §1 self-heal `git checkout -f development` (the one intentional forced
      tree-wide form) is left unchanged and does not use `OWNED_PATHS`.

**Acceptance Criteria — probes (must be edited in THIS story):**

- [ ] `evals/probes/owned-surface-guard.sh`: the positive §1-check assertion now
      matches the array form (`grep -Fq 'git diff --quiet -- "${OWNED_PATHS[@]}"'`),
      and the scoped-restore assertion matches
      `grep -Fq 'git checkout development -- "${OWNED_PATHS[@]}"'`.
- [ ] `owned-surface-guard.sh` unscoped-leak drop-filter is updated from
      `grep -vF -- '-- $OWNED_PATHS'` to `grep -vF -- '-- "${OWNED_PATHS[@]}"'`,
      AND the implementer manually confirms the unscoped-leak grep pipeline
      produces empty output against the fixed SKILL.md before calling this done.
- [ ] `owned-surface-guard.sh` gains a reintroduction guard: if EITHER
      `git diff --quiet -- $OWNED_PATHS` OR `git diff --cached --quiet -- $OWNED_PATHS`
      is found (via `grep -Fq`), exit 1 (REGRESSION) with a message naming the
      zsh word-split hazard.
- [ ] `owned-surface-guard.sh` gains a zsh-fidelity assertion: guard with
      `command -v zsh` first (exit 2 SKIPPED with a message if absent); extract
      the declaration with an anchored grep (`grep -oP '^OWNED_PATHS=\(\K[^)]+'`
      or equivalent that ignores comment lines); run under `zsh -c` the
      equivalent of `OWNED_PATHS=(<extracted>); set -- "${OWNED_PATHS[@]}"; echo $#`,
      capture the count explicitly (do NOT rely on `set -e` propagation), and if
      the count is < 2 print a named `REGRESSION:` message and exit 1.
- [ ] `evals/probes/clean-restore.sh`: the scoped-restore count assertion counts
      the array form `git checkout development -- "${OWNED_PATHS[@]}"` and
      requires ≥ 4 (raised from 3 to match the US-001 SKILL.md count exactly),
      AND fails (exit 1, named message) if the bare form
      `git checkout development -- $OWNED_PATHS` is present.
- [ ] Both probes keep the 3-state oracle contract (exit 0 PASS / 1 REGRESSION /
      2 SKIPPED), keep `set -euo pipefail`, keep resolving `ROOT` from
      `${BASH_SOURCE[0]}`, keep the `grep -F` (fixed-string) form for every
      literal pathspec match (the `[`/`]` in `${OWNED_PATHS[@]}` are BRE
      metacharacters — a non-`-F` grep would silently mis-match), and retain all
      existing unchanged assertions: `BLOCKED-OWNED-WIP` token,
      `rev-parse --abbrev-ref HEAD`, `restore left a dirty owned tree`, exactly
      one `git checkout -f development` self-heal carrying BRANCH/rev-parse
      context within ±2 lines.
- [ ] Each probe's `# source:` header gains a reference to issue #81 (keep the
      existing #63 provenance), AND each probe's `# desc:` line is updated so it
      no longer documents the bare `$OWNED_PATHS` form as the expected pattern
      (describe the array form instead).
- [ ] `bash evals/probes/owned-surface-guard.sh` and
      `bash evals/probes/clean-restore.sh` both exit 0 (PASS) against the fixed
      SKILL.md.

### US-002: Validate the fix under zsh and document

**Description:** As the autopilot operator, I want documented proof that the
guard now detects a dirty owned path under zsh and the restore lands back on
`development`, so the safety guarantee the skill documents is restored and
verified.

**Acceptance Criteria:**

- [ ] A zsh validation is run against an EXISTING tracked owned file
      (`tasks/README.md` — not a new file): append a line, then evaluate the §1
      guard expression (array form) under `zsh -c` and confirm it takes the
      `BLOCKED-OWNED-WIP` branch (the old bare form would have reported clean).
- [ ] The dirtied file is restored with `git checkout -- tasks/README.md` (a
      tracked file; `git clean` is not used), and `git diff --quiet -- tasks/README.md`
      is clean afterward — no test residue left behind.
- [ ] The validation outcome (command + observed result) is recorded as an entry
      in `memory/<today>/log.md` (the canonical single location per
      `context/rules/memory.md`).
- [ ] A `CHANGELOG.md` entry is added under `## [Unreleased]` in a `### Fixed`
      subsection (create the `### Fixed` subsection if only other categories
      exist), one line, imperative mood, referencing issue #81.
- [ ] Note (no action — handled by the autopilot §6 gate): `evals/RESULTS.md` is
      refreshed when `/eval` runs on the final branch state; both
      `owned-surface-guard` and `clean-restore` must show PASS there.

## Functional Requirements

- FR-1: `OWNED_PATHS` MUST be declared as a native shell array
  (`OWNED_PATHS=(...)`) in `.claude/skills/autopilot/SKILL.md`.
- FR-2: Every git pathspec expansion of `OWNED_PATHS` MUST use the array-quoted
  form `"${OWNED_PATHS[@]}"`, at every site (§1 guard, §5/§6 prose, §7 restore
  code + assertion, Guidelines prose).
- FR-3: No bare unquoted `-- $OWNED_PATHS`, no `--cached` bare form, and no
  quoted `-- "$OWNED_PATHS"` form may remain anywhere in the skill; no stale
  `bare, unquoted` / `used UNQUOTED` guidance may remain.
- FR-4: The inline comment at the declaration MUST name the zsh
  no-`SH_WORD_SPLIT` hazard and endorse the array form.
- FR-5: `owned-surface-guard.sh` and `clean-restore.sh` MUST, in the same atomic
  story as the SKILL.md edit: assert the array form; fail on the broken bare
  form (plain and `--cached`); update the unscoped-leak drop-filter; and (for
  owned-surface-guard) exercise the declared form under `zsh` behind a
  `command -v zsh` skip guard.
- FR-6: Both probes MUST remain green (exit 0) against the fixed skill, keep the
  3-state oracle contract, keep `grep -F` for literal matches, and update both
  the `# source:` and `# desc:` header lines.

## Non-Goals

- No change to the *set* of owned paths (same 10 tokens).
- No change to the guard/restore *logic* or control flow — only the pathspec
  expansion idiom and the matching probe assertions.
- No change to the §1 self-heal forced checkout, the liveness-token vocabulary,
  or any status-token semantics.
- No new probe file — extend the two existing probes only.
- The intentional flag-variable word-splitting elsewhere in the harness (e.g.
  `scripts/ralph.sh` unquoted flag expansions) is a SEPARATE concern and is
  explicitly OUT OF SCOPE; this PRD fixes only the `OWNED_PATHS` pathspec sites
  in the autopilot `SKILL.md` and the two coupled probes.
- No sandbox application code; harness-infra only.

## Technical Considerations

- Verified facts (this session, under `/usr/bin/zsh`):
  - `P=".claude/ scripts/ crons/"; set -- $P; echo $#` → `1` under zsh, `3` under bash.
  - `OWNED_PATHS=(.claude/ ... CHANGELOG.md); set -- "${OWNED_PATHS[@]}"; echo $#` → `10` under BOTH zsh and bash.
  - With the bare form, a dirty `tasks/README.md` is NOT caught (guard reports clean).
- The array `(...)` declaration and `"${arr[@]}"` expansion are shell-array
  syntax supported identically by bash and zsh; this is the minimal portable fix.
- Probe coupling is exact: the probes `grep -F` the literal pathspec strings, so
  the SKILL.md edit and probe edits MUST be self-consistent — hence US-001
  bundles them. The substring `$OWNED_PATHS` is NOT contained in
  `${OWNED_PATHS[@]}`, so the "broken bare form absent" greps are unambiguous.
- `git diff --cached --quiet -- $OWNED_PATHS` is a DISTINCT string from
  `git diff --quiet -- $OWNED_PATHS`; both must be replaced and both must be
  guarded (the `--cached` variant is equally broken under zsh).
- Do NOT use a `sed` substitution delimited by `"` — the replacement text
  `"${OWNED_PATHS[@]}"` contains double-quotes. Prefer the Edit tool / a `|`
  or `#` sed delimiter.
- Rollback: this edits the skill autopilot itself runs under. If a probe
  regression appears before the story is complete, `git checkout -- .claude/skills/autopilot/SKILL.md evals/probes/`
  reverts the working-tree edits; committed work is recoverable via the branch's
  git history. Do not push a half-applied state.

## Success Metrics

- The four absence greps (plain, `--cached`, `checkout`, quoted) over SKILL.md
  all return empty.
- `bash evals/probes/owned-surface-guard.sh` and `clean-restore.sh` exit 0.
- Under `zsh -c`, the §1 guard detects a dirty owned path (takes the
  `BLOCKED-OWNED-WIP` branch).
- `/eval` reports no NEW (green→red) regression on the branch.

## Open Questions

- None. The fix form (array + `"${OWNED_PATHS[@]}"`), the exact probe
  assertions, the `--cached` symmetry, and the stale-prose cleanup are fully
  specified above.
