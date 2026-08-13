# Issue #768 — verified findings (framing disproof)

All commands run 2026-08-13 from `/home/sandbox/harness` (main checkout) and the
worktree `.oh/worktrees/task/768-portable-memory-tier`.

## The four claims the briefing told me to disprove

| # | Claim | Verdict |
|---|-------|---------|
| 1 | `.oh/memory/MEMORY.md` did not contain the auto-close rule before session `c10a1f34` | **FALSE** |
| 2 | `.oh/memory/MEMORY.md` is gitignored, so writing there does not travel to another clone | TRUE |
| 3 | `.oh/context/IDENTITY.md` is tracked and loaded by default | TRUE |
| 4 | `memory-protocol.md` routes most lessons to the two non-portable tiers; `IDENTITY.md` is gated behind generalization | TRUE |

### Claim 1 is false — and that changes the diagnosis

`/home/sandbox/harness/.oh/memory/MEMORY.md:25`, dated **2026-07-19** (three weeks
before the session):

> In this checkout origin (ryaneggz/openharness) is a stale fork — base
> worktrees/branches on upstream (mifunedev/openharness) and push there; **its
> default branch is main while PRs target development, so merged PRs do not
> auto-close issues.**

The harness tier *did* hold the fact. The issue's "grep returned 0 lines" is true
only of the file that session could see.

### Why the session could not see it

Session `c10a1f34` ran in the worktree
`.oh/worktrees/bug/759-ccsn-probe-resolved-version`. `oh-path` anchors the memory
dir to **the parent of its own `.oh/`** — which in a worktree is the *worktree*
root, not the main checkout:

```
$ bash .oh/scripts/oh-path memory                 # from main checkout
/home/sandbox/harness/.oh/memory
$ (cd .oh/worktrees/task/768-portable-memory-tier && bash .oh/scripts/oh-path memory)
/home/sandbox/harness/.oh/worktrees/task/768-portable-memory-tier/.oh/memory
```

`MEMORY.md` is gitignored, so a new worktree starts without it;
`.oh/scripts/ensure-memory-file.sh` then seeds a **header-only stub** there. The
session read an empty ledger, concluded the fact was unrecorded, and re-derived it.

Presence across live worktrees (`MEMORY.md` line counts):

```
harness (main checkout)                    86
bug/759-ccsn-probe-resolved-version        17   <- stub + that session's own writes
task/731-sysbox-execution-target           ABSENT
task/758-registry-drift-lint               ABSENT
task/762-health-check-host-side            ABSENT
task/767-retro-log-gate-order              ABSENT
task/768-portable-memory-tier              ABSENT
task/ste-checker-residual                  ABSENT
```

The bug-759 ledger is the canonical header plus **7 lessons, every one dated
2026-08-13** — written by that session itself. Zero prior lessons were visible.

### The loss is not hypothetical

Of those 7 lessons, **5 never reached the main ledger** and die when the worktree
is removed:

```
docs-20260813
docs-20260813-autoclose                <- the auto-close rule, re-derived and re-lost
docs-20260813-squash-subject
memory-scaffolding-20260813-guard-substring
memory-scaffolding-20260813-ssh
```

## Re-scoped diagnosis

The issue's title says the fact was "stranded in provider-private memory" and that
"no portable tier held it". The evidence says otherwise: a portable-enough tier
*did* hold it. The defect is one level down — **the harness memory tier fragments
per worktree**. Every build session runs in a worktree, so the durable ledger is
structurally invisible to exactly the sessions that produce and need lessons, and
every `/retro` write lands in a file that is deleted with the branch.

Portability across clones and providers (the issue's framing) is a real, broader
gap. Fragmentation across worktrees *inside one clone* is the specific defect that
caused this incident, and it is the smaller, checkable fix.
