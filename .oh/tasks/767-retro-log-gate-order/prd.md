# PRD — /retro logs its promotion counts before the gate resolves (issue #767)

> rev 2 — revised against 2 adversarial critics (implementer lens, user lens).
> Both returned REVISE. See `critique.md` for the findings and their disposition.
> The shape (B) is unchanged; the revisions are to the ordering *inside* §6, the
> probe's guard against a false pass, the rendered wording, and one factual error
> in rev 1's R10.

## Problem

`.oh/skills/retro/SKILL.md` orders its steps **§6 propose-then-confirm gate → §7
write approved changes → §8 append the log entry**. §8 is unconditional ("Always
run this step") and renders the entry with
`render-log-entry.sh --memory <n> --identity <n>` — *promotion counts*.

For any run that is not `auto-approve`, the agent's turn **ends at the gate**: it
must hand control back to the operator to get an APPROVE/SKIP/EDIT answer. The
log entry therefore gets written while the counts are still unknowable, and it is
wrong the instant the operator approves. `.oh/memory/<UTC-date>/log.md` is
append-only, so the entry cannot be corrected in place.

Observed on 2026-08-13 in session `c10a1f34`: the 06:02 entry recorded
`Promoted: 0 to MEMORY.md`, the operator approved three lessons, and the count
had to be superseded by a separate line appended at 06:03.

The bug survived because the common invocation path hides it — `auto-approve`
collapses the gate into a single turn, so the counts *are* knowable when §8 runs.

## Decision — the fix shape

The issue sketched two shapes. **Shape B is chosen: an explicit `pending`
promotion state, resolved by a later entry.**

Shape A ("move the append strictly after the gate resolves") is rejected because
it cannot hold the hard constraint. A run abandoned at the gate never resumes —
the operator may answer in another session, or never. Deferring the append until
resolution means such a run leaves **zero** trace in the log, which trades the
unconditional-log guarantee away to fix a count. Rescuing Shape A requires
writing *something* at the gate anyway; if that something carries counts it is
the original defect, and if it carries a placeholder it is Shape B. Shape A
collapses into Shape B the moment it is made correct.

Shape B also matches the real incident's own shape. The 06:02/06:03 pair was not
the wrong number of entries — it was the wrong *first* entry. The fix is to make
the first entry say `pending` instead of asserting `0`.

## Rules

- **R1** — `render-log-entry.sh` accepts exactly one new `--result` value:
  `GATE-PENDING`. `OP`, `DRY-RUN`, and `SKIPPED-TRIVIAL` are unchanged.
- **R2** — `--memory` and `--identity` accept a non-negative integer **or** the
  literal `pending`. `pending` is valid **if and only if** `--result
  GATE-PENDING`, and then **both** fields must be `pending`.
- **R3** — `--result GATE-PENDING` with an integer count exits `64`. Any other
  `--result` with a `pending` count exits `64`. A mixed pair
  (`--memory pending --identity 0`) exits `64` under either result.
- **R4** — a new optional `--resolves HH:MM` marks an entry as the resolution of
  an earlier `GATE-PENDING` entry. It is valid **only** with `--result OP` and
  only alongside integer counts; any other combination exits `64`. It is
  validated by the same `HH:MM` regex as `--time`.
- **R5** — rendering: a pending entry emits
  `- **Promoted**: pending gate resolution` in place of the count line. A
  resolving entry emits its normal count line followed by
  `- **Resolves**: the GATE-PENDING entry from HH:MM UTC`. Entries that pass
  neither flag render byte-identically to today.
- **R6** — `SKILL.md` moves the gate-time append into §6, and — this is the
  load-bearing part — places it **before the proposal block is printed**, not
  merely before §7. The proposal block ends in `Type APPROVE to write…`, which
  is the last thing the agent writes before its turn ends; an instruction placed
  after it is an instruction that competes with the pull to stop and yield. §6
  therefore reads: filter duplicates → append the `GATE-PENDING` entry → print
  the proposal block. §7 (write approved changes) and §8 (append the resolving
  `OP` entry with `--resolves`) both run on the resumed turn.
- **R6a** — the `GATE-PENDING` entry is appended **once, on the first yield
  only**. If the operator answers `EDIT <n> <text>` and the agent re-presents a
  revised block, it does not append a second `GATE-PENDING` entry — the gate is
  still the same gate, and `--resolves` assumes one pending entry per gate.
- **R6b** — §8 derives `--memory`/`--identity` from the lines **actually
  appended in §7**, by counting them, rather than from the size of the proposal
  list. An operator who answers `SKIP` to two of three items must produce
  `Promoted: 1`, not `3`.
- **R7** — the single-entry paths are unchanged and must stay single-entry:
  `--dry-run` (`DRY-RUN`), a trivial skip (`SKIPPED-TRIVIAL`), a run where the
  qualify filter left nothing to propose (`OP`, `0`/`0`, no gate), and
  `auto-approve` (the gate resolves inside the same turn, so the counts are
  known when §8 runs — one `OP` entry, no `--resolves`).
- **R8** — `auto-approve` is documented in the frontmatter `argument-hint` and in
  §6. It is invoked in production by `.oh/prompts/advisor/{implement,pr}.yml`
  (`/retro auto-approve`) but `SKILL.md` never mentioned it, which is precisely
  why the gated path's log timing went unexamined.
- **R9** — the "always append a log entry" guarantee survives verbatim. Every
  invocation still appends at least one entry; a run abandoned at the gate leaves
  a `GATE-PENDING` entry rather than a false `Promoted: 0`. The Anti-patterns
  list carries the reading rule: **a `GATE-PENDING` entry with no later
  `Resolves` entry is an abandoned gate — read it as `SKIP`.** Without that rule
  a reader cannot tell "abandoned" from "still open", which is the honest cost of
  refusing to build a reconciler (see Non-goals).
- **R10** — `.pi/skills`, `.claude/skills` and `.codex/skills` are git-tracked
  **symlinks** to `../.oh/skills` (mode `120000`), so all three provider views
  update automatically when `.oh/skills/retro/…` is edited. There is no copy to
  re-sync. The live hazard is the opposite one: an atomic-write editor invoked on
  a `.pi/…` or `.claude/…` path replaces the *symlink* with a real file and forks
  the tree silently. **Edit only `.oh/skills/…` paths**, and run
  `bash .oh/scripts/link-providers.sh --check` before commit.

## Non-goals

- No refactor of `.oh/skills/retro/references/memory-protocol.md`.
- No change to the six-subsystem lens, the verdict/confidence rubrics, the
  promotion rule, or the triage-tag table.
- No change to `report-schema.md`: its `## Log entry` section is a preview inside
  the report artifact, generated before the gate resolves. It never claimed
  resolved counts.
- No change to `validate-retro-report.sh` or `check-memory-duplicates.sh`.
- No widening into `/audit` or `/eval` beyond the one probe named below.
- Issue #768 (memory routing) is a sibling agent's; untouched.
- **No reconciler.** Nothing sweeps the log for `GATE-PENDING` entries that were
  never resolved. R9's reading rule is the deliberate cheap substitute.
- **No uniqueness check on `--resolves`.** The flag is format-validated only; it
  is not checked against an existing `GATE-PENDING` entry in the log. Two gates
  opening in the same UTC minute would collide. Accepted for v1.

## What this does NOT fix

The count in the resolving entry is still the **agent's self-report**. R6b makes
it a report of what was actually appended rather than of what was proposed, which
removes the timing defect this issue is about — but nothing mechanically verifies
`N` against `MEMORY.md`. A miscount remains reachable. This change closes *when*
the number is asserted, not *whether the arithmetic is right*; the PR body says so
rather than implying the whole defect class is closed.

## Verification

`.oh/evals/probes/retro-deterministic-contract.sh` already pins parts of this
skill's contract and is the enforceable surface — `.oh/skills` is excluded from
the vitest globs, so a `node --test` suite placed there never runs in CI.

**Verify by rejection.** Every new assertion must be shown to FAIL against a
deliberately broken copy, and the failure must be **attributed** to that
assertion: a broken tree that violates only assertion X must produce X's own
unique `REGRESSION` message, and deleting X from the probe must make that
detection disappear while the rest of the probe still passes on the good tree.

Two guards the ordering assertion must carry, or it is theatre:

- **Anchor-absence is its own fixture.** `grep -n <anchor> | head -1` on a
  missing anchor yields the empty string, and `(( "" < 100 ))` is *true* in bash
  — so the naive comparison PASSES on a file where the anchor was deleted
  outright. Every anchor must be checked non-empty and numeric first, with its
  own `REGRESSION` message. Anchor **deletion** is tested as a distinct broken
  tree from anchor **reordering**.
- **A lower bound, not just an upper one.** Asserting only `gate-append < §7`
  passes on a tree that moved the append into §1. The chain must be anchored at
  both ends: `§6 heading < gate-append < proposal block < §7 heading <
  --resolves`.

The **behavioral** requirement — that a live agent runs the append before it
yields — is *not* provable by this probe. The probe pins the text ordering that
makes obedience likely. That is the honest limit of the enforceable surface, and
the PR body states it rather than implying the probe proves compliance.
