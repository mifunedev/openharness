# Critique — 767-retro-log-gate-order (rev 1 → rev 2)

Two adversarial critics ran in parallel against `prd.md` rev 1 and `prd.json`
rev 1: an **implementer lens** (will it build, will it hold) and a **user lens**
(does the operator and the next agent end up better off). Both returned
**REVISE**. 13 findings, 12 accepted, 1 rejected with reasons.

Every factual claim was re-verified by the First Mate against real state before
disposition. One of the critics' findings corrected a factual error the First
Mate had put into the plan.

## Findings and disposition

| # | Lens | Sev | Finding | Disposition |
|---|------|-----|---------|-------------|
| F1 | impl | HIGH | The ordering assertion is a **false pass** waiting to happen: `grep -n X \| head -1` on a missing anchor returns the empty string, and `(( "" < 100 ))` is true in bash. A tree with the anchor deleted outright would PASS. | **Accepted.** Verification section now requires a non-empty + numeric guard per anchor with its own `REGRESSION` message, and names anchor *deletion* as a fixture distinct from anchor *reordering*. Implemented as `assert_line`. |
| F2 | impl | HIGH | **R10 is factually wrong.** `.pi/skills` and `.claude/skills` are git-tracked *symlinks* (mode `120000`) to `../.oh/skills`, not hardlinked copies. The "editor breaks the hardlink, provider copies go stale" hazard rev 1 described does not exist. The real hazard is the inverse: an atomic-write editor invoked on a `.pi/…` path replaces the symlink itself with a real file. | **Accepted — the critic is right and the First Mate was wrong.** Verified: `ls -ld .pi/skills` → `lrwxrwxrwx … -> ../.oh/skills`; `git ls-files -s .pi/skills` → `120000`. Rev 1 inferred hardlinks from three identical inodes, which is exactly what a symlink produces. R10 rewritten: edit only `.oh/skills/…`, gate on `link-providers.sh --check`. |
| F3 | user | HIGH | No acceptance criterion can detect the single most important behavioral requirement — that a live agent actually appends before yielding. Worse, if the append instruction sits *after* the proposal block in §6, the model will print `Type APPROVE…` and stop, reintroducing the missing-log case in a new place. | **Accepted, and it changed the design.** R6 now requires the append **before the proposal block prints**, not merely before §7; §6 carries an explicit "nothing after the proposal block is guaranteed to run" warning; the probe's ordering chain includes the proposal-block anchor. The unenforceable residue is stated plainly in prd.md § Verification and in the PR body rather than papered over. |
| F4 | user | HIGH | The resolving entry renders a second full `## Retro -- HH:MM UTC` header, whereas the operator's own live fix on 2026-08-13 appended a continuation bullet under the original header. Two headed blocks are harder to skim, and `--resolves HH:MM` is a weak join key on a day with three retros. | **Split.** The continuation-bullet shape (option a) is **rejected**: `locked-append.sh` appends to end-of-file, so a continuation bullet only lands under its own header when nothing intervened. On 08-13 nothing had; in general something will, and the bullet would attach to a stranger's entry. Option (b) **accepted**: wording strengthened to `- **Resolves**: the GATE-PENDING entry from HH:MM UTC`. Join-key uniqueness recorded as a named v1 non-goal. |
| F5 | impl | HIGH | The minimal-diff fix is to widen the shared regex to `^([0-9]+\|pending)$` in the loop over all six counts — which silently legalizes `--hypotheses pending`. No AC caught it. | **Accepted.** `MEMORY`/`IDENTITY` are pulled out of the shared loop; the other four keep the untouched integer-only loop. New AC: `--hypotheses pending` exits 64. |
| F6 | impl | MEDIUM | The ordering chain has an upper bound but no lower one — moving the append into §1 still satisfies "less than §7". | **Accepted.** Chain anchored at both ends, starting from the §6 heading. |
| F7 | impl | MEDIUM | `EDIT <n>` re-yields. A literal reading of "append before the turn ends" fires again, producing two `GATE-PENDING` entries for one gate and breaking the 1:1 that `--resolves` assumes. | **Accepted.** New R6a: append once, on the first yield only. |
| F8 | user | MEDIUM | R9's "more informative than a false zero" is asserted, not earned — a reader cannot tell an abandoned gate from an open one, and reconciliation is (correctly) out of scope. | **Accepted.** R9 now states the cost instead of claiming a win, and adds the cheap in-scope substitute: an Anti-patterns reading rule that an unresolved `GATE-PENDING` is read as `SKIP`. |
| F9 | user | MEDIUM | The plan fixes *when* the count is asserted, not whether it is *true*. It is still typed from memory. | **Accepted.** New R6b: §8 derives the counts by counting the lines actually appended in §7. A new prd.md section, `## What this does NOT fix`, states the residue plainly, and the PR body repeats it. |
| F10 | impl | LOW | `usage()` / `-h` text is not covered by any AC and will go stale. | **Accepted.** AC added. |
| F11 | impl | LOW | The byte-identity fixture does not name which invocation to diff; it should pin the plain `OP`-with-integer-counts call, the highest-traffic path. | **Accepted.** AC names it. |
| F12 | user | LOW | `- **Resolves**: gate opened at HH:MM UTC` parses ambiguously ("this entry opened the gate"). | **Accepted.** Exact replacement wording taken verbatim from the critic. |
| F13 | user | LOW | Prose-only ACs a reviewer cannot mechanically confirm — notably the catch-all "Rules R1 through R5 are implemented as written". | **Accepted.** Catch-all dropped; "states X" ACs replaced with exact required substrings. |

## Rejected

**F4 option (a)** — render the resolution as a continuation bullet under the
original `## Retro` header. Rejected on a mechanism the critic did not have:
`.oh/scripts/locked-append.sh` appends to the end of the file. A continuation
bullet therefore lands under whatever header is currently last, which is the
original entry only when no other entry intervened. The 2026-08-13 incident
resolved one minute later with nothing in between, which is why the improvised
fix looked clean; it is not a pattern that generalizes. Option (b) — a
self-describing join key — was taken instead.

## Verdict after revision

Rev 2 addresses all 5 HIGH findings. F3 and F4 changed the design; F2 corrected
a factual error in the plan. Proceeding to build.
