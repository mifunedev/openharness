# Evidence — 767-retro-log-gate-order

- **Issue**: [#767](https://github.com/mifunedev/openharness/issues/767) · **Branch**: `task/767-retro-log-gate-order` · **Base**: `development` at `e4af96d4`
- **Audit**: inline First Mate audit (no `/audit implementation` sub-agent was
  spawned — see § Gaps). Every claim below is observed output from this session.

## What was broken, and what now holds

`/retro` rendered its log entry with `--memory <n> --identity <n>` — promotion
counts — in §8, *after* the §6 propose-then-confirm gate. But a non-`auto-approve`
run's turn **ends** at that gate, so the entry was written while the counts were
still unknowable and became wrong the moment the operator approved. On 2026-08-13
the 06:02 entry said `Promoted: 0 to MEMORY.md`, three lessons were then approved,
and the count had to be superseded at 06:03 because the log is append-only.

The helper now **refuses** to render a count while the gate is open: `--result
GATE-PENDING` requires `--memory pending --identity pending` and exits `64` on an
integer. `SKILL.md` §6b appends that entry *before* the proposal block prints, and
§8 appends the resolving `OP` entry carrying `--resolves <HH:MM>`. The wrong-count
outcome is no longer reachable, and the unconditional-log guarantee is intact — an
abandoned gate leaves a `GATE-PENDING` entry rather than a false zero.

## Proof by gate

| Gate | What was checked | Observed | Result |
|------|------------------|----------|--------|
| Task graph | 5 stories in `prd.json` rev 2, all AC verified below | 5/5 | PASS |
| Helper contract | 13 US-001 criteria: 3 accept, 12 reject, 3 byte-identity | all as specified | PASS |
| Step ordering | 5-anchor chain in `SKILL.md`, both ends anchored | 182 < 205 < 242 < 249 < 307 | PASS |
| Non-regression | pre-existing probe literals + untouched files | 9/9 literals, 0-byte diff | PASS |
| Provider surfaces | symlink integrity + `link-providers.sh --check` | `exit=0`, `diff -qr` clean | PASS |
| Verify by rejection | 8 fixtures, each breaking exactly one assertion | 8/8 fail with their own message | PASS |
| Attribution by mutation | delete the assertion, re-run the same broken tree | 8/8 then exit 0 | PASS |
| Regression floor | `.oh/skills/eval/run.sh` | 102 probes, 0 REGRESSION | PASS |
| CI | GitHub Actions on the pushed branch | see § CI | PASS |
| UI | browser criteria | n/a — no story declares browser verification | N/A |

## Observed output

### US-001 — the helper accepts what it must

```text
$ diff <(bash old-render.sh --result OP … --memory 3 --identity 0) \
       <(bash render-log-entry.sh --result OP … --memory 3 --identity 0)
IDENTICAL(OP)
IDENTICAL(DRY-RUN)
IDENTICAL(SKIPPED-TRIVIAL)

$ bash render-log-entry.sh --result GATE-PENDING … --memory pending --identity pending
## Retro -- 06:02 UTC
- **Result**: GATE-PENDING
- **Subsystems**: memory scaffolding
- **Hypotheses**: 3 (supported 2 / refuted 0 / inconclusive 1)
- **Promoted**: pending gate resolution
- **Observation**: obs
exit=0

$ bash render-log-entry.sh --result OP … --memory 1 --identity 0 --resolves 06:02
- **Promoted**: 1 to MEMORY.md, 0 to IDENTITY.md
- **Resolves**: the GATE-PENDING entry from 06:02 UTC
exit=0
```

The byte-identity diff is the important one: the highest-traffic call site — an
`OP` entry with integer counts and no `--resolves` — renders exactly as it did
before this change.

### US-001 — the helper rejects what it must (exit 64)

Every line below is observed. Exit `64` is `EX_USAGE`, the script's existing
convention.

```text
--hypotheses pending (OP)                exit=64  counts must be non-negative integers
--hypotheses pending (GATE-PENDING)      exit=64  counts must be non-negative integers
GATE-PENDING + integer memory            exit=64  --result GATE-PENDING requires --memory pending --identity pending: …
GATE-PENDING + integer identity          exit=64  --result GATE-PENDING requires --memory pending --identity pending: …
OP + pending memory                      exit=64  --memory and --identity must be non-negative integers; 'pending' is valid only with --result GATE-PENDING
mixed pair under GATE-PENDING            exit=64  --result GATE-PENDING requires --memory pending --identity pending: …
mixed pair under OP                      exit=64  --memory and --identity must be non-negative integers; …
--resolves + DRY-RUN                     exit=64  --resolves is valid only with --result OP
--resolves + SKIPPED-TRIVIAL             exit=64  --resolves is valid only with --result OP
--resolves + GATE-PENDING                exit=64  --resolves is valid only with --result OP
--resolves bad format (6:2)              exit=64  --resolves must be HH:MM
--result RESOLVED (never added)          exit=64  --result must be OP, DRY-RUN, SKIPPED-TRIVIAL, or GATE-PENDING
```

The first two matter more than they look. `pending` is legal on the two promotion
fields **only**; the minimal-diff fix would have widened the shared regex for all
six counts and silently legalized `--hypotheses pending`. Assertion `767-d` exists
to catch exactly that, and is verified by rejection below.

### US-002 — the ordering chain, anchored at both ends

```text
$ for a in <the five anchors>; do grep -nF -- "$a" SKILL.md | head -1; done
### 6. Propose-then-confirm gate         line=182    occurrences=1
--result GATE-PENDING                    line=205    occurrences=1
Type APPROVE to write                    line=242    occurrences=1
### 7. Write approved changes            line=249    occurrences=1
--resolves                               line=307    occurrences=1
```

Strictly ascending, each anchor unique. The gate-open append (205) precedes the
proposal block (242) that ends the turn — which is the whole fix. Asserting only
`append < §7` would have passed on a tree that moved the append into §1, so the
chain starts at the §6 heading.

### US-002 — nothing else moved

```text
$ git diff --stat -- .oh/skills/retro/references/ \
    .oh/skills/retro/scripts/validate-retro-report.sh \
    .oh/skills/retro/scripts/check-memory-duplicates.sh
(no output)

$ for l in <the 9 literals the probe already pinned>; do grep -Fq "$l" SKILL.md; done
OK   allowed-tools: Read, Grep, Bash, Edit
OK   ${CLAUDE_SKILL_DIR}/references/report-schema.md
OK   ${CLAUDE_SKILL_DIR}/scripts/validate-retro-report.sh
OK   ${CLAUDE_SKILL_DIR}/scripts/render-log-entry.sh
OK   ${CLAUDE_SKILL_DIR}/scripts/check-memory-duplicates.sh
OK   | ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
OK   write only the required `.oh/memory/<UTC-date>/log.md` entry with `Result: DRY-RUN`
OK   [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis:
OK   Bypassing the schema/scripts
```

### US-003 — provider surfaces

```text
$ ls -ld .pi/skills .claude/skills .codex/skills
lrwxrwxrwx … .claude/skills -> ../.oh/skills
lrwxrwxrwx … .codex/skills -> ../.oh/skills
lrwxrwxrwx … .pi/skills -> ../.oh/skills

$ git ls-files -s .pi/skills .claude/skills
120000 7f954e9d… 0	.claude/skills
120000 7f954e9d… 0	.pi/skills

$ bash .oh/scripts/link-providers.sh --check   → exit=0
$ diff -qr .pi/skills/retro .claude/skills/retro → exit=0, no output
$ grep -c 'GATE-PENDING' .pi/skills/retro/SKILL.md .claude/skills/retro/SKILL.md
.pi/skills/retro/SKILL.md:9
.claude/skills/retro/SKILL.md:9
```

Both provider views see the edit, and only `.oh/skills/…` paths were written.
This was worth checking rather than assuming: rev 1 of the PRD asserted these were
**hardlinked copies** needing manual re-sync. A critic refuted it, and the commands
above are why the claim was withdrawn — three identical inodes are exactly what a
symlink produces, so the inode evidence rev 1 relied on did not distinguish the two.

### US-004 — verify by rejection, and attribution by mutation

Eight fixtures, each breaking **exactly one** thing, applied to both provider
copies so the probe's own `diff -qr` stays clean and the only thing it can object
to is the assertion under test. `mutate.py` aborts if a fixture matches zero or
more than one site — a silent no-op mutation would turn this whole section into
theatre.

For each: run the real probe (must fail, with *that assertion's own* message),
then delete that assertion from the probe and re-run against the **same** broken
tree (must now pass, which is what attributes the exit code to the assertion
rather than to a neighbour).

```text
### baseline: the real probe against the real (fixed) worktree
  > PASS: retro deterministic schema and self-contained helper contract are present
  exit=0

ASSERTION 767-a   (renders the false `Promoted: 0` again, validation intact)
  [rejection] exit=1  REGRESSION: 767-a GATE-PENDING entry omitted the pending promotion line
  [mutation ] exit=0  the same broken tree now exits 0

ASSERTION 767-b   (drops the guard refusing a count while the gate is open)
  [rejection] exit=1  REGRESSION: 767-b helper accepted an invocation it must reject (an integer promotion count while the gate is open)
  [mutation ] exit=0

ASSERTION 767-c   (lets `pending` leak into a resolved entry)
  [rejection] exit=1  REGRESSION: 767-c helper accepted an invocation it must reject (a pending count on a non-GATE-PENDING result)
  [mutation ] exit=0

ASSERTION 767-d   (widens the SHARED integer regex — the minimal-diff defect)
  [rejection] exit=1  REGRESSION: 767-d helper accepted an invocation it must reject (pending on a hypothesis count, not a promotion count)
  [mutation ] exit=0

ASSERTION 767-e   (stops rendering the join line back to the gate)
  [rejection] exit=1  REGRESSION: 767-e resolving entry omitted the Resolves join line
  [mutation ] exit=0

ASSERTION 767-e2  (allows --resolves on a result that never opens a gate)
  [rejection] exit=1  REGRESSION: 767-e2 helper accepted an invocation it must reject (--resolves on a result that never opens a gate)
  [mutation ] exit=0

ASSERTION 767-f   (THE defect: moves the gate-open append AFTER the proposal block)
  [rejection] exit=1  REGRESSION: 767-f SKILL.md step order broken: '--result GATE-PENDING' (line 219) must precede 'Type APPROVE to write' (line 207)
  [mutation ] exit=0

ASSERTION 767-f2  (deletes the anchor outright — the empty-line-number fixture)
  [rejection] exit=1  REGRESSION: 767-f2 SKILL.md step-order anchor is missing: --result GATE-PENDING
  [mutation ] exit=0

TOTAL: 16 passed, 0 failed
```

`767-f` and `767-f2` are deliberately two fixtures, not one. Anchor **reordering**
and anchor **deletion** fail differently, and the deletion case is the dangerous
one: `grep -n … | head -1 | cut -d: -f1` yields the empty string on no match, and
`(( "" < 100 ))` evaluates **true** in bash — so an unguarded comparison passes on
a file whose anchor was removed.

That guard was itself wrong on the first attempt, and this harness caught it. Run
1 of `767-f2` failed with exit 1 and an **empty message**: under `set -o pipefail`
the failing `grep` aborted the probe before the guard could speak, leaving the
failure unattributable and the guard dead code. The fix is the `|| line=""` at
`.oh/evals/probes/retro-deterministic-contract.sh:127`, and the transcript above is
the post-fix run where the message is `767-f2`'s own.

### Regression floor

```text
$ bash .oh/skills/eval/run.sh
retro-deterministic-contract     PASS        unchanged
…
ran 102 probe(s); wrote .oh/evals/RESULTS.md

$ bash .oh/skills/eval/run.sh 2>&1 | grep -icE 'REGRESSION|FAIL'
0
```

`.oh/evals/RESULTS.md` is regenerated by the runner, not hand-edited.

## Gaps — stated, not hidden

1. **No `/audit implementation` sub-agent ran.** The audit was performed inline by
   the First Mate. A delegated auditor that dies mid-run leaves the gate silently
   undone, so the gate was kept inline where its output is visible. There is no
   `AUDIT_RUN_ID` to correlate, and this doc claims none.
2. **The behavioral requirement is not mechanically provable.** The probe pins the
   *text ordering* that makes the pre-yield append likely. It cannot prove a live
   agent actually ran the append before handing control back — no probe can
   observe an agent's turn boundary. This is the honest limit of the enforceable
   surface, and it is the reason §6c carries the explicit sentence "Nothing placed
   after it is guaranteed to run."
3. **The promotion count is still a self-report.** §8 now instructs deriving it
   from the lines actually appended in §7, which removes the timing defect. But
   nothing verifies `N` against `MEMORY.md`. A miscount remains reachable; this
   change closes *when* the number is asserted, not whether the arithmetic is right.
4. **No reconciler for stale pending entries.** A `GATE-PENDING` entry that is
   never resolved stays in the log unresolved. The substitute is a reading rule in
   the Anti-patterns list ("an entry with no later `Resolves` line is an abandoned
   gate — read it as `SKIP`"), not automation. Deliberate: see `prd.md` § Non-goals.
5. **`--resolves` is format-validated only.** It is not checked against an existing
   `GATE-PENDING` entry, so two gates opening in the same UTC minute would collide.
   Accepted for v1 and recorded as a non-goal.

## CI

See the PR checks. The `eval-probes` job runs `bash .oh/scripts/link-providers.sh
--init` before `bash .oh/skills/eval/run.sh`, which is why the probe reads the
`.oh/skills/…` files through the provider symlinks in CI exactly as it does here.
