# /sync catchup — upstream→origin procedure

Port a specific upstream feature from canonical upstream into the operator
fork. The operative mechanism is cherry-pick of the upstream feature's
SQUASH commit — never `git merge upstream/development`.
Read `references/topology.md` before starting.

## Pre-flight

1. Read `references/topology.md` in full.

2. Invoke `/drift-check`. Confirm section (A) shows origin BEHIND upstream
   (right count > 0). If origin is not behind, there is nothing to catch up.

3. Identify the specific upstream feature you intend to port. You need
   the SQUASH commit SHA of the feature's merge into `upstream/development`:
   ```bash
   git log upstream/development --oneline -30
   ```
   Note: autopilot PRs to upstream land as squash merges. The squash
   commit's diff is exactly the feature delta.

4. Confirm the working tree is clean (`git status --porcelain` = empty).

## Step 1 — Fetch remotes

```bash
git fetch upstream
git fetch origin
```

## Step 2 — Content-presence oracle

Before cherry-picking, confirm the feature is NOT already present in
origin. Patch-id is useless across the fork boundary (the fork sanitizes
and re-squashes, producing false-positives everywhere). Use the
content-presence oracle instead.

**CRITICAL: run each oracle command at the top level — NEVER inside a
shell loop.** The zsh git-in-loop trap silently reports every path ABSENT
when `git` is called inside `$()` inside a for-loop.

```bash
# Check by commit message phrase (run top-level):
git log origin/development --grep="<distinctive phrase from upstream commit>" --oneline

# Check by file presence (run top-level):
git cat-file -e origin/development:<representative-path-introduced-by-feature>
echo $?   # 0 = present, 128 = absent
```

If the phrase matches or the path is present: the feature is already in
origin — stop, nothing to port.

If absent: proceed.

## Step 3 — Branch off origin/development

```bash
ISSUE_N=<N>    # the origin tracking issue number
SLUG=<slug>    # short descriptive slug
git checkout -b feat/${ISSUE_N}-${SLUG} origin/development
```

Branch off `origin/development`, NOT `upstream/development`. The PR target
is `origin/development`.

## Step 4 — Cherry-pick the squash commit

```bash
git cherry-pick -x <upstream-squash-sha>
```

The `-x` flag appends the source SHA to the commit message for traceability.

**NEVER run `git merge upstream/development`** — it drags ~40 unrelated
upstream commits into origin and auto-merges tightly-coupled blocks in
ways that Frankenstein the result.

If the cherry-pick has no conflicts, skip to Step 6.

### Handling conflicts

**Auto-merge Frankensteins tightly-coupled blocks.** A 3-way merge keeps
non-conflicting lines from both sides even when they are semantically wrong
next to the incoming change. For coupled blocks (e.g., a session-init block
in entrypoint.sh that mixes origin's env vars with the upstream feature's
new vars), replace the WHOLE coupled block wholesale from the squash commit
rather than accepting the auto-merged result.

**CHANGELOG** (expected conflict on every pick):
```bash
git checkout --ours CHANGELOG.md
```
Then hand-add ONLY the ported feature's entries. Do NOT pull in upstream's
versioned `## [X.Y.Z]` sections or entries for unrelated upstream features
the squash may have bundled.

**wiki/README.md** (expected conflict):
```bash
git checkout --ours .mifune/skills/wiki/corpus/README.md 2>/dev/null || \
  git checkout --ours wiki/README.md 2>/dev/null || true
```
Regenerate from frontmatter using the exact logic in
`evals/probes/wiki-readme-index.sh` (awk frontmatter extraction, `sort -r`
by `updated:` date, then slug). The probe will verify correctness.

**evals/RESULTS.md** (expected conflict):
- If the squash adds a NEW probe → hand-insert only the new row; `git checkout
  --ours evals/RESULTS.md` then add the row per `evals/README.md` format.
- If the squash adds NO new probe → `git checkout --theirs evals/RESULTS.md`
  (upstream's scoreboard, zero timestamp churn).

### Conflict recovery — `cherry-pick -n` trap

If you run `git cherry-pick -n` (no-commit form) and conflicts arise:
`cherry-pick --abort` will report "no cherry-pick in progress." With
`-n`, no commit is created, so HEAD is still your pre-pick commit —
`git reset --hard HEAD` actually works here. For clarity, prefer naming
the explicit pre-pick SHA so there is no ambiguity:
```bash
PRE_PICK=$(git rev-parse HEAD)   # capture BEFORE the cherry-pick -n
# ... cherry-pick -n, conflict arises ...
git reset --hard $PRE_PICK       # or git reset --hard HEAD — same thing after -n
git clean -fdq
```
NOT `cherry-pick --abort` (no cherry-pick is in progress). Confirm
recovery by checking `git status` is clean.

## Step 5 — Preserve origin divergences

After cherry-picking, inspect the diff for origin-specific divergences
that the squash may have overwritten:

**Denver TZ (crons/heartbeat.md):**
```bash
git diff HEAD -- crons/heartbeat.md | grep timezone
```
If the diff shows the TZ value changing, restore origin's intended value
dynamically — never hardcode a specific TZ string (upstream may use any
value; the fix would silently no-op if they ever change theirs):
```bash
# Read origin's intended TZ value from origin/development (the source of truth)
ORIGIN_TZ=$(git show origin/development:crons/heartbeat.md | grep -i "^timezone:" | head -1 | awk '{print $NF}')
sed -i "s|^timezone: .*|timezone: $ORIGIN_TZ|" crons/heartbeat.md
git add crons/heartbeat.md
```
Verify: `git show origin/development:crons/heartbeat.md | grep timezone` must
match `grep timezone crons/heartbeat.md`.

**`client-slack-pi` session name:**
```bash
git diff HEAD | grep -n 'client-slack[^-]'
```
If the cherry-pick reintroduced `client-slack` (without `-pi`) in files
where origin expects `client-slack-pi`, repoint those references. The
cherry-pick base never had origin's #269 rename, so its hunks touching
those lines don't carry the rename. Run `grep -rn client-slack` on the
affected files and compare against `origin/development:<file>`.

**`.mifune/skills` symlink (automatic):**
The cherry-pick of an upstream commit editing `.claude/skills/<x>/SKILL.md`
applies the patch THROUGH the `.claude/skills → .mifune/skills` symlink
and stages the real `.mifune/skills/<x>/SKILL.md`. No manual retarget is
needed. Verify: the index should keep only the `120000` symlink blob (not
a shadowing regular file at `.claude/skills`):
```bash
git ls-files --stage .claude/skills
```

## Step 6 — Defer cron-layout-coupled commits

Some upstream commits have probes that hardcode cron filenames from
upstream's layout (e.g., `crons/cleanup-tasks.md`, `crons/eval-weekly.md`)
that conflict with origin's layout (those crons were folded into heartbeat
in origin). These commits WILL regress origin's eval suite.

**Defer them to a focused follow-up**, don't force them in. Signs of a
cron-layout-coupled commit:
- A probe grepping for a specific cron filename that doesn't exist in origin.
- A `SCHED_INVALID` / cron parse error on `eval/run.sh`.

File a tracking issue and continue without the coupled commit.

## Step 7 — Test file carry-along warning

The squash may bundle test changes from the upstream BASE that origin lacks
(e.g., a sibling feature landed on upstream before this one). If a test
asserts behavior or file structure that origin doesn't have, reconstruct:
take the upstream feature's new test content ONLY, combined with origin's
version of any un-ported test describes. Do not wholesale import a test
that asserts behavior from a DIFFERENT upstream feature.

**Blob-restore antipattern (applies here too, not just publish):** if you
restore any file from an old git blob (`git show <sha>:<path>`) to get
origin's "safe" version, the blob is faithful to THAT point in time —
any safety fix made between the blob and HEAD is silently undone. After
any blob-restore:
```bash
git diff <blob-sha> origin/development -- <path>
```
Identify which hunks are unrelated safety fixes (locked-append, scoped
greps, escaping) vs the content you actually wanted. Keep the safety
fixes; state any intentional blob-exact deviation in the PR body.

## Step 8 — Eval oracle

```bash
bash .mifune/skills/eval/run.sh
```

**Must exit 0 with no new REGRESSION rows.** This is the non-negotiable
gate. Fix root causes; do not paper over regressions.

## Step 9 — Sanitize and push

For commits that touch public-facing content, scan for upstream-to-fork
links that should not appear:
```bash
UPSTREAM_REPO=$(git remote get-url upstream | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
git diff origin/development HEAD | grep '^+' | grep "$UPSTREAM_REPO"
```
There should be NONE (origin can reference its own issues; it should not
reference upstream-canonical issue numbers in new code).

Push and create a PR:
```bash
UPSTREAM_REPO=$(git remote get-url upstream | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
ORIGIN_REPO=$(git remote get-url origin | sed -E 's#^https://github.com/##; s#^git@github.com:##; s#\.git$##')
git push origin feat/${ISSUE_N}-${SLUG}
gh pr create \
  --repo "$ORIGIN_REPO" \
  --base development \
  --head feat/${ISSUE_N}-${SLUG} \
  --title "feat: port <feature-name> from upstream" \
  --draft \
  --body "Cherry-pick of <upstream-squash-sha> from ${UPSTREAM_REPO:-upstream}.
Ported: <description>
Deferred: <any cron-layout items, with tracking issue>
Origin divergences preserved: Denver TZ, client-slack-pi, .mifune symlink"
```

Open as **draft** first.

## Step 10 — Gate to ready

After CI passes:

```bash
gh pr ready <N> --repo "$ORIGIN_REPO"
```

Run `/pr-audit` and confirm the PR is in the `ready` bucket before
undrafting. If CI never queued (dormant draft PR), dispatch it manually:
```bash
gh workflow run "CI: Harness" --ref feat/${ISSUE_N}-${SLUG}
```

Wait for CI to complete before promoting to ready.
