# PRD: drift-check skips non-scheduled cron files in Class-C staleness check

## Introduction

`/drift-check`'s **Class-C cron-staleness** check (`.claude/skills/drift-check/SKILL.md`
Step C-2) globs **every** `crons/*.md` file and flags any whose mtime is newer than the
running `system-cron` runtime's start time as *"inert until runtime restart"* — using raw
mtime with **no frontmatter parsing**. This false-flags `crons/README.md` (a directory
README, not a cron) on essentially every heartbeat pulse (~30+ false positives logged over
2 days). `README.md` has no line-1 `---` frontmatter (line 1 is a markdown H1); the `---`
lines inside it are example code-fence delimiters. `parseCronFile`
(`scripts/cron-runtime.ts:35` — `if (!fm.schedule) return null`) correctly never schedules
it — a file the runtime never loads cannot be "inert."

This PRD aligns drift-check's notion of "a cron" with the runtime's: a `crons/*.md` file is
schedulable IFF its **leading** frontmatter declares a `schedule:` key and is not
`enabled: false`. Restoring the signal's trustworthiness matters because Class-C exists to
catch a real, documented failure mode (a cron merged after runtime boot stays inert until
restart — a `heartbeat.md` body edit once sat inert ~7h); a false positive on every pulse
trains operators to ignore the flag.

## Goals

- Eliminate the recurring `crons/README.md` "inert" false positive (and the whole class of
  non-cron-doc false positives) from `/drift-check` Class-C.
- Make Class-C's file-qualification predicate mirror `scripts/cron-runtime.ts`
  `parseCronFile`/`loadCrons` exactly (leading `schedule:` frontmatter, not `enabled: false`).
- Add a deterministic eval probe that locks the corrected behavior as a fitness function.
- Change **only** harness-infra surfaces (`.claude/skills/drift-check/`, `evals/`); no change
  to `scripts/cron-runtime.ts` behavior and no change to Class-A/Class-B.

## User Stories

### US-001: Add a schedulable-cron predicate to Step C-2

**Description:** As an operator running `/drift-check`, I want Class-C to evaluate only files
the runtime actually loads and runs, so that non-cron docs like `crons/README.md` are never
flagged "inert."

**Predicate definition (the net outcome of `parseCronFile` + `loadCrons`, not `parseCronFile`
alone — `parseCronFile` succeeds on a disabled cron; `loadCrons` is what drops it at
`scripts/cron-runtime.ts:83`).** A `crons/*.md` file is a **schedulable cron** IFF **all** of:
1. its **first line** is literally `---` (after stripping a trailing `\r`), AND
2. a **closing** `---` delimiter exists on a later line (a well-formed leading frontmatter
   block — mirrors `parseCronFile` requiring both delimiters), AND
3. within that leading frontmatter block, a non-comment line matches `^[[:space:]]*schedule:`
   (anchored key, comment lines beginning `#` excluded), AND
4. the block does **not** disable the cron: no non-comment line sets `enabled:` to `false`
   (tolerate a quoted value, i.e. `false` or `"false"` or `'false'`).

**Acceptance Criteria:**

- [ ] Step C-2's bash loop in `.claude/skills/drift-check/SKILL.md` applies the **schedulable
      cron** predicate (above) to each `crons/*.md` file before the mtime comparison.
- [ ] Only qualifying files are mtime-compared against `RUNTIME_START`; non-qualifying files
      (e.g. `crons/README.md`) are skipped silently — not printed as a `DRIFT-CHECK (C)` line
      and not counted toward the inert-file aggregate.
- [ ] **CRLF-safe & code-fence-safe**: the line-1 `---` check strips a trailing `\r` (so a
      CRLF-checked-out file is not mis-skipped), and the opening `---` must be the **first
      line** of the file so a `---` inside a fenced code block (the `README.md` trap) cannot
      match.
- [ ] **Anchored key match**: the `schedule:` detection uses an anchored, comment-excluding
      match (`^[[:space:]]*schedule:` on non-`#` lines) so neither a commented-out
      `# schedule:` nor a substring key like `pre_schedule:` falsely qualifies a file.
- [ ] **Property (not name list)**: every `crons/*.md` whose content satisfies the predicate
      qualifies and is still flagged when its mtime exceeds the runtime start time. With the
      current tree this set is at least `cleanup-tasks`, `eval-weekly`, `heartbeat` (and
      `autopilot` while its `enabled: true` — its `enabled` flag is a live toggle, so the AC
      does not hard-require it); `crons/README.md` is excluded. Do **not** hard-code a cron
      count or name list in the skill logic.
- [ ] The snippet remains bash-portable and consistent with the surrounding Step C-2 style
      (no new external dependencies beyond `awk`/`head`/`grep`/`stat` already used).

### US-002: Update the Output Contract wording

**Description:** As a reader of the skill, I want the documented Class-C output to describe
what is actually evaluated, so the docs match the corrected behavior.

**Acceptance Criteria:**

- [ ] The Output Contract section (and any Step C-2/C-3 example output) describes the
      inert-file set as **"schedulable cron files"** (files passing the predicate), not bare
      `crons/*.md`. The wording makes clear qualification is **predicate-based, not
      name-based** (so dropping a future `NOTES.md`/`CHANGELOG.md` into `crons/` is handled
      generically).
- [ ] The aggregate `DRIFT:` summary line's `cron-staleness drift (N inert file)` count is
      described as counting only **schedulable cron files**, and any inline example (e.g. the
      one currently near the end of the Output Contract) shows a real cron such as
      `crons/heartbeat.md`, never `crons/README.md`.
- [ ] No Output Contract text implies `README.md` or other non-scheduled files are evaluated
      or counted.
- [ ] The `(C) Cron-staleness drift: OK` clean-token contract is unchanged.

### US-003: Add the `drift-check-cron-staleness-glob` eval probe

**Description:** As the harness, I want a deterministic probe that tests the **live**
Step C-2 logic against fixtures (not a text-search of the doc), so a future revert to the raw
glob is genuinely caught and the lesson is a durable fitness function.

**Probe strategy (mandated — resolves the critic High finding):** the probe must
**extract the Step C-2 bash block from the live `.claude/skills/drift-check/SKILL.md` and run
it against fixtures.** A bare text-presence grep (e.g. "assert `for f in crons/*.md` absent")
is explicitly rejected — it passes trivially and gives false confidence. Extraction anchor: the
fenced ` ```bash ` block that immediately follows the `**Step C-2 — compare cron file
mtimes:**` heading. The probe runs the extracted block in an isolated temp working dir whose
`crons/` holds the fixtures, with `RUNTIME_START` set to a timestamp **before** the fixtures'
(fresh) mtimes — so under the OLD raw-glob logic every fixture (including the README-style one)
would be flagged inert, and only the corrected predicate excludes the non-cron ones. This makes
the REGRESSION path real: reverting Step C-2 to the raw glob flips the probe to exit 1.

**Acceptance Criteria:**

- [ ] `evals/probes/drift-check-cron-staleness-glob.sh` exists, is executable, and begins with
      `#!/usr/bin/env bash`, `# tier: A`, `# source: issue #98`, a `# desc:` line (naming the
      extract-and-run strategy), and `set -euo pipefail`. All diagnostic output goes to
      **stderr**; the final line is `PASS:`/`REGRESSION:`/`SKIPPED:` per convention.
- [ ] The probe registers its `trap`-based temp-dir cleanup **before** creating any fixture,
      and builds **three** fixtures in a temp `crons/`, each with a **fresh** mtime
      (newer than `RUNTIME_START`):
      (a) a **README-style** file whose first line is an H1 (no line-1 `---`) — must be
      **EXCLUDED** from the inert set;
      (b) a **valid scheduled** cron (leading `---` … `schedule: "0 * * * *"` … `enabled: true`
      … closing `---`) — must be **INCLUDED** (flagged inert);
      (c) a **disabled** cron (leading frontmatter with `schedule:` present but
      `enabled: false`) — must be **EXCLUDED**.
- [ ] The probe **extracts** the Step C-2 block from the live SKILL.md, echoes the extracted
      block to stderr, and **exits `1` (REGRESSION)** if extraction yields an empty string or a
      block that does not iterate `crons/*.md` (so a mis-extraction can never produce a false
      PASS).
- [ ] The probe **exits `0` (PASS)** only when, after running the extracted predicate, the
      inert set **excludes (a) and (c)** AND **includes (b)**; it **exits `1` (REGRESSION)**
      otherwise (predicate over-excludes the real cron, or fails to exclude the non-cron / the
      disabled cron); it **exits `2` (SKIPPED)** only if a hard prerequisite is genuinely
      absent (the SKILL.md file is missing, or `stat` is unavailable).
- [ ] Demonstrated REGRESSION wiring: running the probe against a Step C-2 block reverted to the
      raw `for f in crons/*.md` glob (e.g. a local experiment during implementation) makes it
      exit `1` — confirm this once during implementation and note it in `progress.txt`.
- [ ] `bash evals/probes/drift-check-cron-staleness-glob.sh` exits 0 against the fixed skill,
      and `/eval` (the runner) scores it `PASS` with no new green→red regression.

## Functional Requirements

- FR-1: Step C-2 MUST qualify a `crons/*.md` file as schedulable iff its first line is `---`,
  its leading frontmatter contains `schedule:`, and it does not set `enabled: false`.
- FR-2: Non-qualifying files MUST be skipped silently (no `DRIFT-CHECK (C)` line, no inert count).
- FR-3: The frontmatter opening `---` MUST be anchored to line 1 to avoid code-fence over-match.
- FR-4: Qualifying files MUST retain the existing mtime > `RUNTIME_START` comparison unchanged.
- FR-5: The Output Contract MUST describe the inert set as "schedulable cron files."
- FR-6: A new tier-A probe MUST assert the predicate excludes a non-cron and includes a real cron.

## Non-Goals (Out of Scope)

- No change to `scripts/cron-runtime.ts` behavior (drift-check is read-only; only its detection
  predicate changes).
- No change to drift-check Class-A (framework drift) or Class-B (branch-behind drift).
- No move to commit-timestamp-based detection — raw mtime remains the mechanism for qualifying
  files; only the file-qualification step changes.
- No change to glob depth — `crons/*.md` remains single-level; subdirectories
  (`crons/<sub>/*.md`) are out of scope.
- No sandbox application code.
- No change to the `crons/README.md` content itself.
- **Rollback**: a plain `git revert` of the SKILL.md edit restores the prior Step C-2; the
  additive probe file would need manual deletion (a `git revert` of the scaffolding commit
  removes it). Acceptable for this single-developer context per `context/USER.md`.

## Technical Considerations

- The predicate must mirror `scripts/cron-runtime.ts` `parseCronFile` (line 35:
  `if (!fm.schedule) return null`) and `loadCrons` (`!entry.enabled` skip). Reference these for
  semantics only; do not modify them.
- The repo's canonical frontmatter extractor `awk '/^---$/{f=!f; next} f{print}'`
  (`context/rules/wiki.md` §6) is insufficient **standalone** — it matches any `---` line and
  would capture the README.md code-fence block. It is **safe to use *after*** a line-1 guard
  (`[ "$(head -n1 "$f" | tr -d '\r')" = '---' ]`); it is only the unguarded standalone use that
  is wrong. The implementer may use `head`+`grep`, an `awk` one-pass, or the guarded canonical
  extractor — any combination satisfying FR-1..FR-4 is acceptable.
- `parseCronFile` (`scripts/cron-runtime.ts`) requires **both** an opening and a closing `---`
  and ignores `#`-comment frontmatter lines; the predicate mirrors this (closing-delimiter
  requirement + anchored, comment-excluding `schedule:`/`enabled:` matches) so a malformed
  file with an opening `---` but no closing `---`, or a commented-out `# schedule:`, is **not**
  wrongly qualified.
- Probe convention reference: `evals/probes/boot-lint-glob.sh` (header shape, 3-state oracle,
  `set -euo pipefail`, messages to stderr).

## Success Metrics

- `/drift-check` Class-C emits zero `crons/README.md` "inert" lines on a clean tree.
- The new probe is PASS on the fixed skill and REGRESSION if the predicate is reverted.
- `/eval` runner exits 0 with no new green→red regressions attributable to this change.

## Open Questions

- None — the plan is fully specified; implementation detail (exact awk vs head+grep) is left to
  the implementer provided FR-1..FR-4 hold.

## Critic Review (post-/prd, pre-/ralph)

Two critics (implementer + user lens) reviewed this PRD; see `critique.md`. One High-severity
finding (probe robustness, US-003) was resolved at the AC level by mandating an
extract-the-live-Step-C-2-block-and-run-against-fixtures probe and rejecting a bare text-presence
grep. Six Medium findings (CRLF safety, closing-`---` requirement, anchored/comment-excluding
`schedule:` match, `enabled: false` semantics framing, property-not-name-list qualification,
aggregate-line wording) and the Low findings were folded into the acceptance criteria, Non-Goals,
and Technical Considerations above. Protected-path check: PASS (modification of a protected skill,
not a deletion). **Recommendation: PROCEED.**
