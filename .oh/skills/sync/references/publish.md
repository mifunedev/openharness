# /sync publish — origin→upstream procedure

Push the fork's accumulated changes to the canonical public repo
(upstream=mifunedev/openharness). This is a sanitize + structural-reconcile
operation, not a simple push. Read `references/topology.md` before starting.

## Pre-flight

1. Read `references/topology.md` in full.

2. Invoke `/audit drift`. Confirm section (A) shows origin AHEAD of
   upstream (left count > 0). If origin is not ahead, there is nothing to
   publish — stop.

3. Confirm the working tree is clean (`git status --porcelain` = empty).
   Do not start with uncommitted changes.

4. Confirm `upstream` remote is configured:
   ```bash
   git remote get-url upstream
   ```
   If absent, add it:
   ```bash
   git remote add upstream https://github.com/mifunedev/openharness.git
   ```

## Step 1 — Fetch remotes

```bash
git fetch upstream
git fetch origin
```

## Step 2 — Branch off upstream/development

```bash
DATE=$(date -u +%Y-%m-%d)
git checkout -b sync/publish-$DATE upstream/development
```

Branch off `upstream/development`, NOT `origin/development`. The branch
lives on upstream — the PR target is `upstream/development`.

## Step 3 — Merge without committing

```bash
git merge --no-commit --no-ff origin/development
```

The auto-merge keeps BOTH sides' non-overlapping content; only direct
line-overlaps conflict. Do NOT commit yet — the sanitize pass comes first.

Conflicts at this step are expected. Resolve each conflict file:
- Keep upstream's version of files that carry private origin state.
- Keep both sides' non-overlapping hunks in shared files (CHANGELOG,
  skills, scripts) — the merge is largely clean for code files.

## Step 4 — Sanitize private content

After the merge (before committing), reset the following paths to their
upstream/development baseline. The goal: `git diff upstream/development HEAD
-- <path>` produces EMPTY output for each of these after the reset.

```bash
# NOTE: use the target branch's current skill layout. Current development uses
# .oh/skills/ with .claude/skills as a symlink; older non-relocated targets
# may require translating these paths to .claude/skills/.
#
# Private task artifacts — keep only README
git checkout upstream/development -- .oh/tasks/
git rm -r --cached --ignore-unmatch .oh/tasks/*/  # remove sub-dirs if any leaked
# Research wiki corpus — keep README anchors only
git checkout upstream/development -- .oh/skills/wiki/corpus/ 2>/dev/null || \
  git checkout upstream/development -- .claude/skills/wiki/corpus/ 2>/dev/null || true
# Agent identity files — keep public stubs only
git checkout upstream/development -- .oh/memory/MEMORY.md
git checkout upstream/development -- .oh/context/IDENTITY.md
git checkout upstream/development -- .oh/context/SOUL.md
git checkout upstream/development -- .oh/context/USER.md
git checkout upstream/development -- .oh/context/TOOLS.md
# Agent folders (docs/agents/, .oh/tasks/archive/) if present
git checkout upstream/development -- docs/agents/ 2>/dev/null || true
# Daily memory logs (gitignored locally, but check)
git checkout upstream/development -- .oh/memory/ 2>/dev/null || true
# Codex plans / local promotion notes
git checkout upstream/development -- .codex/plans/ 2>/dev/null || true
```

Verify each sanitized path is clean:
```bash
git diff upstream/development HEAD -- .oh/tasks/ .oh/memory/ .oh/context/ .codex/plans/
```
Output must be empty. If not, inspect the diff and reset the leaking paths.

**Gotcha — `git rm` aborts on unmatched pathspecs.** Always use
`--ignore-unmatch` when removing paths that may not exist on the merged
tree.

## Step 5 — Reconcile structural divergence

Check whether upstream/development has structural changes that are NEWER
than origin (e.g., a skill renamed, a probe added, a convention changed).
When upstream is structurally ahead, reconcile toward upstream's structure:

- A fork-only skill that upstream superseded → check if the upstream
  replacement is present; if so, drop the fork version and its now-
  contradictory probe. (Example: upstream's `/watchdog` superseded fork's
  `autopilot-watchdog` skill; both probes cannot coexist.)
- Two probes with contradictory contracts → resolve to keep BOTH only when
  they guard genuinely different invariants; otherwise keep the upstream one.

After any structural change, run a preliminary eval:
```bash
bash .oh/skills/eval/run.sh 2>&1 | grep -E 'REGRESSION|PASS|FAIL'
```
Fix any regressions before continuing.

## Step 6 — Cron timezone gate

Check upstream's expected timezone for each cron file:
```bash
git grep -n timezone upstream/development -- .oh/crons/
```

Compare against the merged tree:
```bash
git grep -n timezone -- .oh/crons/
```

Do NOT carry origin's `timezone: America/Denver` operator locale into the
public repo. Reconcile any cron timezone values to match
`upstream/development`'s values. (See `references/topology.md §1` for the
full rationale.)

## Step 7 — CHANGELOG

The fork's `[Unreleased]` block is a large superset of upstream's. Take
upstream's CHANGELOG as the base and add only the genuinely new block:

```bash
# Start from upstream's CHANGELOG
git checkout upstream/development -- CHANGELOG.md
```

Then hand-insert ONLY the entries from origin's `[Unreleased]` that are
not already in upstream's history. Do NOT import upstream's own versioned
`## [X.Y.Z]` sections (they are already there). Retarget origin/fork issue
links to upstream issue or PR references when the entry is public-facing.

## Step 8 — Marker scan (public-leak guard)

Scan the full diff for fork-private issue links that should not appear in
the public repo:

```bash
ORIGIN_REPO=$(git remote get-url origin | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
git diff upstream/development HEAD | grep '^+' | grep "$ORIGIN_REPO"
```

Sanitize every leaked reference: retarget to the upstream tracking issue
(check `gh issue list --repo mifunedev/openharness` for equivalents) or
remove the link. Also check non-CHANGELOG files:

```bash
git diff upstream/development HEAD -- ':!CHANGELOG.md' | grep '^+' | grep "$ORIGIN_REPO"
```

Don't over-sanitize: pre-existing fork refs in OLDER released CHANGELOG
sections or test fixtures from before the sync are NOT a leak — scope the
replacement to files the sync INTRODUCED.

## Step 9 — Eval oracle

```bash
bash .oh/skills/eval/run.sh
```

**Must exit 0 with no new REGRESSION rows.** This is non-negotiable. If
any probe regresses, fix the root cause before continuing.

Note: current development uses the relocated `.oh/skills` layout with
`.claude/skills` as a symlink. On older non-relocated branches, use
`bash .claude/skills/eval/run.sh` instead. Match the branch layout.

## Step 10 — Commit and draft PR

```bash
git add -A
git commit -m "sync: publish origin→upstream $(date -u +%Y-%m-%d)"
git push upstream sync/publish-$DATE
gh pr create \
  --repo mifunedev/openharness \
  --base development \
  --head sync/publish-$DATE \
  --title "sync: publish origin→upstream $(date -u +%Y-%m-%d)" \
  --draft \
  --body "..."  # summarize new entries, note sanitized paths
```

Open as **draft** first.

## Step 11 — Gate to ready

After CI passes, run `/audit pr <N> --repo mifunedev/openharness` while the
PR is still a draft. Consume the focused classifier JSON and require
`.draftStatus == "promotable"` with `.evidenceComplete == true`; a draft is
never in the non-draft `ready` bucket. Only that immediately preceding result
permits the state change:

```bash
gh pr ready <N> --repo mifunedev/openharness
```

If the audit is stale, partial, blocked, or reports any other draft status,
leave the PR draft and rerun the audit after resolving the evidence.

## Revert-by-blob-restore warning

If at any step you restore a file from an old git blob (`git show
<old-sha>:<path>`), the blob is faithful to THAT point in time — any
safety fix made between the blob and HEAD is silently undone. After a
blob-restore, always:

```bash
git diff <blob-sha> origin/development -- <path>
```

Identify which hunks are unrelated safety fixes (locked-append, scoped
greps, escaping) vs the change you actually want to undo. Keep the safety
fixes. Run an adversarial critic over the diff — green probes alone are
not sufficient (the eval suite is necessary but not sufficient).
