---
name: sync
description: |
  Dispatcher for bidirectional origin↔upstream harness sync — routes the
  first token of $ARGUMENTS to one of three subcommands: publish
  (origin→upstream), catchup (upstream→origin), or status (read-only
  direction check). The canonical topology and intentional divergences to
  preserve live in references/topology.md. Full per-subcommand procedures
  live in references/{publish,catchup}.md. This dispatcher composes
  /audit drift (framework drift detection), /eval (oracle floor),
  /audit pr (promotability), and /git (branch/PR/CHANGELOG conventions).
  It NEVER reimplements drift detection — /audit drift owns that.
  TRIGGER when: "sync to upstream", "publish fork changes to the public
  repo", "push to mifunedev", "origin→upstream" → publish; "pull from
  upstream", "port a feature from upstream", "catchup from mifunedev",
  "upstream→origin" → catchup; "check sync status", "how far behind are
  we", "which direction needs sync" → status.
argument-hint: "publish | catchup | status"
allowed-tools: Read, Write, Edit, Bash
---

# /sync — bidirectional origin↔upstream sync dispatcher

`/sync <subcommand>` routes origin↔upstream sync operations. The first
whitespace-delimited token of `$ARGUMENTS` selects the subcommand; the
remainder is that subcommand's own argument string. Each subcommand's
full procedure lives in a reference doc under `references/` — read that
doc and follow it as the authoritative instructions.

The canonical topology (origin=operator fork, upstream=mifunedev
canonical) and the intentional divergences that every sync must preserve
live in `references/topology.md`. Read it before executing any subcommand.

## Subcommands

| Subcommand | Direction | Purpose | Procedure |
|---|---|---|---|
| `publish` | origin→upstream | Branch off upstream/development, merge-no-commit origin/development, sanitize private state, reconcile structure, eval-gate, draft PR to upstream | `references/publish.md` |
| `catchup` | upstream→origin | Cherry-pick the squash commit of a specific upstream feature onto origin/development; never `git merge upstream/development` | `references/catchup.md` |
| `status` | read-only | Invoke `/audit drift` and interpret its section (A) framework-drift output to report which direction is needed | inline — see below |

## Dispatch

```bash
ARGUMENTS="${ARGUMENTS:-}"
SUB="${ARGUMENTS%% *}"          # first token
REST="${ARGUMENTS#"$SUB"}"      # everything after it
REST="${REST# }"                # trim one leading space
```

Route on `$SUB`:

| `$SUB` | Action |
|--------|--------|
| `publish` | Read `references/publish.md`; execute it with `$REST` as its argument string. |
| `catchup` | Read `references/catchup.md`; execute it with `$REST` as its argument string. |
| `status` | Run the status procedure below. |
| anything else (incl. empty) | Print the usage line from `argument-hint` and stop. Do not guess. |

## Status procedure (inline)

The `status` subcommand is a thin wrapper around `/audit drift` — it does
NOT reimplement framework drift detection.

1. Invoke `/audit drift` and capture its full output.
2. Parse the section (A) summary line (`DRIFT-CHECK (A):` or `(A) Framework drift: OK`):
   - Origin N **behind** upstream AND N ahead = 0: report "catchup is available (N commits to port from upstream/development)".
   - Origin N **ahead** of upstream AND N behind = 0: report "publish is available (N commits to push to upstream/development)".
   - Both non-zero: report "bidirectional work needed — run `/sync catchup` to port upstream features first, then `/sync publish` to push origin's changes forward."
   - Both zero: report "in sync — no action needed."
3. Print the raw `/audit drift` section (A) output for operator context.

## Shared rules

These apply to all subcommands; the reference docs assume them.

- **Read topology first**: before any subcommand, read `references/topology.md`.
  It defines the origin/upstream remotes and the intentional divergences
  (Denver TZ, `client-slack-pi` rename, `.oh/skills` symlink) that must
  survive every sync intact.
- **This dispatcher composes /audit drift** for all framework drift detection
  (section A of `/audit drift`'s output). NEVER implement your own
  left-right divergence-count commands in this skill or the reference docs
  — `/audit drift` is the canonical owner of that detection logic.
- **This dispatcher composes /eval** as the oracle floor: both `publish` and
  `catchup` must pass `bash .oh/skills/eval/run.sh` (exit 0, no new
  REGRESSION rows) before the PR is promoted to ready.
- **This dispatcher composes /audit pr** for promotability: while the PR is
  still draft, require focused classifier JSON with `.draftStatus == "promotable"`
  and `.evidenceComplete == true` before undrafting. Drafts are never in the
  non-draft `ready` bucket.
- **This dispatcher composes /git** for branch/commit/PR/CHANGELOG conventions:
  the branch-naming, commit-type, PR-body, and CHANGELOG-format rules live in
  `.oh/skills/git/SKILL.md` and are not restated here.
- **Branch prefix**: `catchup` branches use `feat/<N>-<slug>` per `/git`
  conventions (targeting `origin/development`). `publish` branches use the
  operational prefix `sync/publish-<date>` (targeting `upstream/development`)
  — this is intentional and distinct from regular feature/task branches because
  the PR target is the upstream remote, not origin.
- **Draft-then-gate pattern**: always open the PR as draft first; promote to
  ready only after the eval suite is green and an immediately preceding
  `/audit pr <N> --repo <owner/name> [--base <stack-parent>]` result has
  `.draftStatus == "promotable"` and complete evidence.
- **Eval oracle is non-negotiable**: a sync that breaks existing probes is not
  mergeable. Resolve conflicts until `bash .oh/skills/eval/run.sh` exits 0
  with no new REGRESSION rows.
- **No action in status mode**: `/sync status` is purely informational — it
  never stages, commits, or pushes.

## When NOT to use

- **`/audit drift`** directly — for a standalone read-only drift report with
  no intention to sync. `/sync status` wraps it; `/audit drift` is the raw tool.
- **`/release`** — for cutting a SemVer tag after upstream development is
  already clean. `/sync publish` brings the fork's changes in; `/release` then
  tags a release from the canonical `main` branch.
- **`/audit prs`** — for a bulk PR triage pass unrelated to syncing.

## See Also

- `references/publish.md` — full origin→upstream procedure
- `references/catchup.md` — full upstream→origin procedure
- `references/topology.md` — canonical topology + intentional divergences
- `.oh/skills/audit/references/drift.md` — framework drift detection (composed by status)
- `.oh/skills/eval/SKILL.md` — eval oracle (composed by publish + catchup)
- `.oh/skills/audit/references/pr.md` — focused draft promotability gate (composed by publish + catchup)
- `.oh/skills/git/SKILL.md` — branch/commit/PR/CHANGELOG conventions
