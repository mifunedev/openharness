# PRD — issue #768: the memory ledger fragments per worktree

Branch `task/768-portable-memory-tier`. Base `e4af96d4`. Target
`upstream/development` (mifunedev/openharness). Issue #768.

Read `findings.md` first. It holds the verified disproof this PRD rests on.

## 1. The issue's premise is false, and the PR must say so

Issue #768 says the auto-close rule was "stranded in provider-private memory"
and that "no portable tier held it". Both parts fail on inspection.

`/home/sandbox/harness/.oh/memory/MEMORY.md:25`, dated **2026-07-19** — three
weeks before session `c10a1f34` — already recorded it:

> its default branch is main while PRs target development, so merged PRs do not
> auto-close issues

The harness tier held the fact. The issue's supporting `grep` returned 0 lines
because the session ran in the worktree
`.oh/worktrees/bug/759-ccsn-probe-resolved-version`, whose `MEMORY.md` is a
different file: a header-only stub plus seven lessons that session wrote itself.

## 2. The real defect

`.oh/scripts/oh-path:47-49` anchors every resolved directory to "the parent of
this script's `.oh/`". Inside a linked git worktree that parent is the
**worktree** root, not the checkout root. `MEMORY.md` is gitignored
(`.gitignore:56`), so a new worktree has none, and
`.oh/scripts/ensure-memory-file.sh` then seeds an empty one there.

Every build session in this harness runs in a worktree. So the durable ledger is
structurally invisible to exactly the sessions that produce and consume lessons,
and each `/retro` writes into a file that is deleted with the branch.

Measured across the live worktrees: main checkout 86 lines, `bug/759` 17 lines
(stub + own writes), the other six worktrees **absent**. Five of the seven
lessons that session wrote — including the auto-close rule it had just
re-derived — never reached the main ledger and die with the worktree.

## 3. This is the third point-fix of one defect class

Two probes already guard the same failure at individual call sites:

| Probe | Call site fixed | Issue |
|---|---|---|
| `.oh/evals/probes/autopilot-worktree-log-root.sh` | `$AUTOPILOT_LOG_ROOT` in autopilot | #152 |
| `.oh/evals/probes/prompt-miner-log-root-worktree.sh` | `render-log-entry.sh` | #693 |

Five files hand-roll `git worktree list --porcelain` to recover the main root
because `oh-path` will not give it to them: `render-log-entry.sh`,
`autopilot-caps.sh`, `audit-run.sh`, and two skill docs. Fixing the resolver
retires the class instead of adding a fourth point-fix.

## 4. Decision

**Fix the anchor in `oh-path`, for the name `memory` only.** Relative memory
paths resolve against the **main worktree** root. Every caller — thirteen files
reach `oh-path memory` — follows with no edit.

Rejected alternatives, with reasons:

- **A new tracked `repo-facts.md` tier.** It is a larger change (new tier, new
  routing judgment, new seed) and it is strictly weaker here: it only rescues
  lessons an agent correctly *classifies* as repo facts, it does not reach the
  five already-stranded lessons, and a write on a worktree branch reaches other
  sessions only if that branch merges. The anchor fix makes every lesson visible
  in every worktree immediately.
- **A "consult memory first" instruction.** `AGENTS.md:26` already carries it.
  Session `c10a1f34` complied — it read the file, and the file was an empty stub.
  The instruction was not violated, so strengthening it changes nothing.
- **Anchoring all `oh-path` names.** `crons`, `evals`, `tasks`, and `context`
  are branch-scoped by design. Widening the change would break worktree-local
  probe and task resolution.

## 5. What this does NOT fix, stated plainly

`MEMORY.md` stays gitignored. After this change the ledger is shared across
every worktree of **one clone**; it still does not travel to another clone,
another operator, or another provider. That broader gap is real. It is not what
caused this incident, and closing it means choosing a tracked tier and a routing
rule — a decision for the maintainer, not a side effect of a resolver fix. The
PR states this openly and leaves the issue's second question open.

## 6. Scope

**In:** `.oh/scripts/oh-path` (the `memory` anchor); truth-corrections to
`.oh/skills/retro/references/memory-protocol.md` and
`.oh/scripts/ensure-memory-file.sh`, which both describe the tier with the wrong
word; exactly one rejection-verified probe; the four task artifacts; a
`CHANGELOG.md` entry.

**Out:** issue #767 (`/retro` log/gate ordering — a sibling agent owns
`memory-protocol.md:103-134` and `.oh/skills/retro/SKILL.md`'s write order; do
not touch either); any new memory tier; any rewrite of the two-tier model;
consolidating the five hand-rolled resolvers (a follow-up, not this PR);
cross-clone portability.

## 7. The wording defect

`memory-protocol.md:55`, `:58`, `:61-69` and `ensure-memory-file.sh:6-8` call
`MEMORY.md` "local-per-instance" and explain its absence by "a fresh clone".
That is why the fragmentation went unnoticed for three point-fixes: the docs
name the wrong unit. The correct unit is the **worktree**. This is a factual
correction to existing sentences, not a new section.

## 8. Verification

One probe, `.oh/evals/probes/memory-dir-shared-across-worktrees.sh`. It builds a
real linked worktree with `git worktree add --detach`, runs **that worktree's own
copy** of `oh-path memory`, and asserts the result equals the main worktree's
memory dir.

It must be shown to FAIL against a copy of `oh-path` with the anchor reverted,
and the failure must be attributed to that assertion alone. Exit 0 against the
fixed script proves nothing by itself.

The probe reads git worktree topology and paths only. It never reads
`MEMORY.md` content or any other untracked state, so it behaves identically in
this worktree and in a fresh CI clone — the defect PR #760 fixed in
`cc-safety-net-wiring.sh` assertion (d).
