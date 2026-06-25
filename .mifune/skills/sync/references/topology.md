# Sync topology — canonical remote map and preserved divergences

This document is the authoritative reference for the origin↔upstream
remote configuration and the intentional divergences that every sync
(`/sync publish`, `/sync catchup`) must preserve. Read it before any
sync subcommand.

## Remote configuration

| Name | Repo | Role | Default branch |
|------|------|------|----------------|
| `origin` | github.com/ryaneggz/openharness | Private fork (operator workspace) | `development` |
| `upstream` | github.com/mifunedev/openharness | Canonical / public repo | `main` |

The integration branch is `development` on **both** remotes. PRs from
feature branches target `development` on whichever remote owns the work.

**Divergence is expected and permanent.** `origin/development` carries
the operator's private content (tasks, wiki corpus, memory scaffolds,
agent configs) that is sanitized out before any publish. The two lines
are NEVER force-synced: cherry-pick for catchup, sanitize-merge for
publish.

## Local development branch

The local `development` branch tracks `upstream/development` — NOT
`origin/development` — on the shared harness checkout. This creates a
persistent divergence: after a fork PR merges into `origin/development`,
`git pull origin development` attempts a real (non-fast-forward) merge
that ABORTS on unrelated files.

**The rule:** verify fork merges via `gh pr view <N> --json state,mergedAt`
(MERGED is the source of truth), not via local branch state. Do NOT run
`git pull origin development` or `git merge origin/development` to "sync"
local. Do NOT `git reset --hard origin/development` — that drops the local
upstream mirror lineage. Recover a botched pull with `git merge --abort`.

## Intentional divergences to preserve

These differences are deliberate fork customizations. Every sync direction
must leave them intact.

### 1. Cron timezone — America/Denver (origin only)

`crons/heartbeat.md` in origin carries `timezone: America/Denver` (the
operator's locale). Upstream switched its canonical heartbeat to
`timezone: America/Los_Angeles`.

- **During publish (origin→upstream):** after the no-commit merge, check
  `git grep timezone upstream/development -- crons/` to get upstream's
  expected values. Do NOT carry origin's `America/Denver` into the public
  repo. Reconcile to whatever upstream/development has.
- **During catchup (upstream→origin):** after cherry-picking, check the
  diff for any TZ value change. Do NOT use `-Xours` to resolve it — that
  strategy clobbers ALL conflicts and is far too broad. Instead, restore
  origin's TZ value surgically after the pick (see catchup.md Step 5). A
  strict whole-file diff against the upstream merge SHA will false-block on
  this single timezone line — verify the PR's own net-diff payload landed
  correctly instead (run the guarding probe).

### 2. `.mifune/skills` symlink relocation (origin only)

Origin carries a `git mv .claude/skills .mifune/skills` relocation plus a
back-compat symlink `.claude/skills → .mifune/skills`. Upstream still has
`.claude/skills` as a real directory (no symlink).

- **During catchup:** `git cherry-pick` of an upstream commit editing
  `.claude/skills/<x>/SKILL.md` applies the patch THROUGH the symlink and
  stages `.mifune/skills/<x>/SKILL.md` automatically — no manual retarget
  needed. Verify the index keeps only the `120000` symlink blob.
- **During publish (origin→upstream):** the relocation commit CANNOT be
  cherry-picked cross-fork (it carries the full divergent skill set and
  will content-conflict per file). Hand-replicate the transform on
  upstream's tree if and when the relocation is to be promoted.
- **The relocation PR must merge last** when closing a deferred-port
  backlog — it must be REBUILT (reset + re-mv) against the final merged
  tree, not rebased or cherry-picked as a patch.
- **Eval runner path follows the branch layout:** on the relocated branch
  (origin) use `bash .mifune/skills/eval/run.sh`; on the non-relocated
  branch (upstream) use `bash .claude/skills/eval/run.sh`.

### 3. `client-slack-pi` session name (origin only)

Origin renamed the Slack client tmux session `client-slack` →
`client-slack-pi` (PR #269) to disambiguate from a sibling
`client-slack-hermes` session. Upstream still uses `client-slack`.

- **During catchup:** if the ported feature references `client-slack`,
  verify whether origin's `client-slack-pi` rename applies. The cherry-pick
  base never had origin's rename, so `client-slack` may survive as a
  functional mismatch in the healthcheck and session guards. Run
  `grep -rn client-slack` in the affected files and repoint to
  `client-slack-pi` where origin expects it.
- **During publish:** carry upstream's `client-slack` naming, NOT origin's
  `client-slack-pi` rename (upstream never got that PR).

## Auto-close behavior

- Merging a fork PR into `origin/development` (the fork's default branch)
  DOES auto-close `Closes #N` issues on the fork. Confirmed: PR #262 →
  issue #261 auto-closed.
- Merging an upstream PR into `upstream/development` does NOT auto-close
  (upstream's default is `main`, not `development`) — close manually.

## Patch-id is useless across the boundary

The fork sanitizes and re-squashes, so `git cherry --abbrev origin/development
upstream/development` shows `+` for nearly every commit in both directions
(many false-positives, zero false-negatives). Use the **content-presence
oracle** instead:

```bash
# Run as TOP-LEVEL commands — never inside a shell loop (zsh git-in-loop trap)
git log origin/development --grep="<distinctive phrase from the commit>" --oneline
git cat-file -e origin/development:<representative-path>
```

If the phrase or path is present, the feature is already in origin. If
absent, it is a candidate to port. The zsh git-in-loop trap
([[zsh-git-command-substitution-loop-trap]]) silently reports every path
ABSENT when git is run inside `$()` inside a for-loop — run each oracle
command at the top level instead.
