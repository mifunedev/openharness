# Reviewer evidence — issue #768

Per `.oh/skills/audit/references/reviewer-evidence-doc.md`. Observed commands and
real output only. Anything not observed is recorded as a gap, never as a pass.

Branch `task/768-portable-memory-tier`, base `e4af96d4`. All runs 2026-08-13.

## 1. The issue's premise is false

The issue states `.oh/memory/MEMORY.md` "did not contain it (`grep` for the
relevant terms returned 0 lines before this session)".

```
$ grep -niE "default branch|auto-?close" /home/sandbox/harness/.oh/memory/MEMORY.md
25:- **2026-07-19**: In this checkout origin (ryaneggz/openharness) is a stale fork — base
worktrees/branches on upstream (mifunedev/openharness) and push there; its default branch
is main while PRs target development, so merged PRs do not auto-close issues.
```

`MEMORY.md` is gitignored, so that self-reported date has no git history behind
it. Independent corroboration from the dated daily log, whose directory mtimes
increase monotonically across 07-17 → 07-19 → 07-25:

```
$ grep -n "manually" /home/sandbox/harness/.oh/memory/2026-07-19/log.md
265:- **Observation**: … closed issue #651 manually because development is not the default branch …
400:- **Observation**: … manually closed issue #653 because development is not the default branch …
```

Two independent files, both predating 2026-08-13, both stating the rule.

## 2. Why the session's grep returned zero

Session `c10a1f34` ran in `.oh/worktrees/bug/759-ccsn-probe-resolved-version`.

```
$ bash .oh/scripts/oh-path memory                      # from the main checkout
/home/sandbox/harness/.oh/memory
$ (cd .oh/worktrees/task/768-portable-memory-tier && bash .oh/scripts/oh-path memory)
/home/sandbox/harness/.oh/worktrees/task/768-portable-memory-tier/.oh/memory
```

Presence across the live worktrees, before the fix:

```
harness (main checkout)                    86
bug/759-ccsn-probe-resolved-version        17   <- auto-seeded stub + that session's own writes
task/731-sysbox-execution-target           ABSENT
task/758-registry-drift-lint               ABSENT
task/762-health-check-host-side            ABSENT
task/767-retro-log-gate-order              ABSENT
task/768-portable-memory-tier              ABSENT
task/ste-checker-residual                  ABSENT
```

The incident worktree's 17 lines are the canonical header plus seven lessons,
every one dated 2026-08-13 — written by that session itself. No prior lesson was
visible to it.

## 3. Gap: the incident narrative overstates the re-derivation

Recorded as a **gap**, not a pass. The issue says four commands were spent
"re-deriving" the rule. The transcript shows the session already knew the answer
before those commands, from Claude's provider-private memory:

```
$ grep -n "memory notes" .../c10a1f34-95c2-4baf-b32b-18ad63707e3d.jsonl
518: "Merged as e4af96d4 … Issue #759 is still open — my memory notes this
      topology needs manual issue closing. Verifying the fix actually landed…"
```

Line 518 precedes the first `default branch` lookup at line 564. So the four
commands were **verification**, not blind rediscovery, and the operational
action was correct throughout. The `.oh/memory/MEMORY.md` miss produced a
duplicate write at `/retro`'s dedup step, not the operator-visible error the
issue describes.

This narrows the fix's claim. It does not remove the defect: the ledger still
fragmented, five lessons were still stranded, and a Pi or Codex session — which
cannot read Claude's private store at all — would have had nothing.

## 4. Gate: the anchor resolves to one ledger

| Assertion | Observed |
|---|---|
| `memory` from a worktree == from the main checkout | `/home/sandbox/harness/.oh/memory` both — MATCH |
| `crons` / `evals` / `tasks` / `context` / `worktrees` stay worktree-local | all five printed `…/768-portable-memory-tier/.oh/<name>` |
| absolute `MEMORY_DIR` honored verbatim | `MEMORY_DIR=/tmp/abs-mem` → `/tmp/abs-mem` |
| git present but failing (`exit 128`) | printed `/home/sandbox/harness/.oh/memory`, `exit=0` |
| git returning a non-directory (`worktree /nonexistent/nope`) | printed `/home/sandbox/harness/.oh/memory`, `exit=0` |

Both degradation cases exit 0 and fall back to the previous root, so a git
failure cannot abort a caller under `set -eu`.

## 5. Gate: probe verified by rejection

`.oh/evals/probes/memory-dir-shared-across-worktrees.sh`.

**Rejection run.** Executed while `HEAD` was still `e4af96d4`, so the linked
worktree the probe builds carried the *unfixed* `oh-path`:

```
$ git show HEAD:.oh/scripts/oh-path | grep -c '_anchor'
0
$ bash .oh/evals/probes/memory-dir-shared-across-worktrees.sh; echo "exit=$?"
REGRESSION: (a) oh-path memory from a linked worktree resolved to
  '/tmp/tmp.RNa9tc5k5l/linked/.oh/memory', expected '/home/sandbox/harness/.oh/memory'
REGRESSION: (b) oh-path memory resolved INSIDE the linked worktree:
  /tmp/tmp.RNa9tc5k5l/linked/.oh/memory
memory-dir-shared-across-worktrees: 2 assertion(s) failed
exit=1
```

Two failure lines, both from the assertions under test. Assertions (c) — five
name checks — and (d) reported zero. The nonzero exit is not borrowed from a
neighbour.

**Pass run**, after committing the fix:

```
$ bash .oh/evals/probes/memory-dir-shared-across-worktrees.sh; echo "exit=$?"
memory-dir-shared-across-worktrees: PASS (memory -> /home/sandbox/harness/.oh/memory)
exit=0
```

**Attribution.** Holding the worktree, the cwd, and the environment constant and
swapping *only* the script flips the result, so the behavior belongs to the
anchor block and not to the surrounding fixture:

```
$ git worktree add --detach /tmp/attr/wt HEAD~1
$ (cd /tmp/attr/wt && env -u MEMORY_DIR sh ./.oh/scripts/oh-path memory)
/tmp/attr/wt/.oh/memory                         # unfixed script
$ cp fixed.sh /tmp/attr/wt/.oh/scripts/oh-path
$ (cd /tmp/attr/wt && env -u MEMORY_DIR sh ./.oh/scripts/oh-path memory)
/home/sandbox/harness/.oh/memory                # fixed script, same worktree
```

**Fresh-clone safety** (the PR #760 defect). The probe reads git worktree
topology and path strings only — never `MEMORY.md` content, `.pi/`, or any other
untracked state — and clears `MEMORY_DIR`/`CRONS_DIR`/… before each call so an
operator's absolute override cannot mask an assertion. It exits 2, not 1, when
git is absent, the tree is not a repository, `mktemp` fails, or `worktree add`
is refused, and it guards against a vacuous pass by skipping if the scratch
worktree ever resolves to the main worktree.

## 6. Gate: no regression across the suite

```
$ for p in .oh/evals/probes/*.sh; do bash "$p"; done   # tallied by exit code
PASS=100 REGRESSION=0 SKIPPED=3 OTHER=0  (total 103)
```

The three skips are environment gaps unrelated to this change:
`autopilot-preflight-gate.sh`, `debugmcp-availability.sh`, `next-dev-prod.sh`.

The two probes guarding earlier point-fixes of this same defect class both stay
green, so the resolver change neither contradicts nor vacates them:

```
prompt-miner-log-root-worktree exit=0
autopilot-worktree-log-root    exit=0
```

## 7. Operational recovery (outside this PR)

The five lessons stranded in the `bug/759` worktree were appended to the
checkout's ledger through `locked-append.sh` before that worktree is reaped.
`MEMORY.md` is gitignored, so this is local state and is **not** part of the
diff.

```
before: 72 lessons
after:  79 lessons
$ grep '^- \*\*' .oh/memory/MEMORY.md | sort | uniq -d | wc -l
0
$ grep '^- \*\*' .oh/memory/MEMORY.md | grep -oE 'probe: [a-z0-9-]+' | sort | uniq -c | awk '$1>1'
(no output)
```

Seven bullets appeared where five were recovered: a concurrent session in
another worktree appended two of its own during the window. That is the shared
ledger working as intended, and `locked-append.sh` serialized both writers
without corruption — no duplicate line and no duplicate probe id.

## 8. Known trade-off, not a gap

Before this change each worktree wrote to a private ledger, so concurrent
`/retro` runs could not collide. They now share one file. `/retro`'s daily-log
append goes through `locked-append.sh`; its `MEMORY.md` append is an
agent-performed anchored insert under `## Lessons Learned` and is **not**
lock-guarded. Guaranteed loss is traded for a rare interleave, which is the
better position, but routing the ledger append through the same primitive is
worth a follow-up. It is not done here because
`.oh/skills/retro/SKILL.md`'s write sequence is issue #767's territory.
