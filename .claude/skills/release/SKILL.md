---
name: release
description: |
  Cut a CalVer release: compute version, pre-flight, push release branch + tag,
  poll CI, verify GitHub Release + GHCR image.
  TRIGGER when: asked to release, version, tag, ship, cut a release, or push a new version.
argument-hint: "[--dry-run]"
---

# Release

Automates the CalVer release procedure defined in `.claude/rules/git.md` (§ Releases).

This skill exists for the parts that are tedious to run by hand: version auto-increment, CI polling, and post-release verification. Conventions (branch names, commit format, pre-flight checks) live in the rule — read it first.

## Instructions

### Step 1 — Resolve repo + version

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
TODAY=$(date '+%Y.%-m.%-d')

if ! git tag --list "$TODAY" | grep -q .; then
  VERSION="$TODAY"
else
  LAST_N=$(git tag --list "${TODAY}-*" --sort=-v:refname | head -1 | grep -oP '\d+$' || echo "1")
  VERSION="${TODAY}-$((LAST_N + 1))"
fi

echo "Repo: $REPO · Version: $VERSION"
```

### Step 2 — Pre-flight

Follow the pre-flight checklist in `.claude/rules/git.md` § Releases (clean tree on the intended source branch).

If `--dry-run`, report version + pre-flight results and **stop here**.

### Step 3 — Promote CHANGELOG `[Unreleased]`

Abort if `## [Unreleased]` has no real entries (only category headers / blank lines):

```bash
UNRELEASED_BODY=$(awk '
  /^## \[Unreleased\]/ { in_block=1; next }
  in_block && (/^## \[/ || /^---$/) { exit }
  in_block { print }
' CHANGELOG.md | grep -vE '^(### |\s*$)')

if [ -z "$UNRELEASED_BODY" ]; then
  echo "Aborting: [Unreleased] is empty — nothing user-visible to release." >&2
  echo "Add changelog entries on this branch (or confirm with the user before continuing)." >&2
  exit 1
fi
```

Promote `[Unreleased]` to `[$VERSION]` and re-seed an empty block above it, then commit on the current branch before cutting the release branch:

```bash
RELEASE_DATE=$(date '+%Y-%m-%d')

awk -v ver="$VERSION" -v rdate="$RELEASE_DATE" '
  /^## \[Unreleased\]$/ && !done {
    print "## [Unreleased]"
    print ""
    print "### Added"
    print "### Changed"
    print "### Fixed"
    print "### Removed"
    print "### Deprecated"
    print "### Security"
    print ""
    print "## [" ver "] - " rdate
    done=1
    next
  }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

git add CHANGELOG.md
git commit -m "task: promote CHANGELOG for $VERSION"
```

The `[$VERSION]` section is the source of truth for the GitHub Release body — `release.yml` extracts it via `body_path` (no `generate_release_notes`).

### Step 4 — Push release branch + tag

```bash
PREV_BRANCH=$(git branch --show-current)
git checkout -b "release/$VERSION"
git push origin "release/$VERSION"
git tag "$VERSION" && git push origin "$VERSION"    # triggers release.yml
```

### Step 5 — Poll CI (up to 10 min)

```bash
sleep 10
RUN_ID=$(gh api "repos/$REPO/actions/runs?branch=${VERSION}&per_page=1" \
  --jq '.workflow_runs[0].id')

for i in $(seq 1 40); do
  STATUS=$(gh api "repos/$REPO/actions/runs/$RUN_ID" --jq '.status')
  if [ "$STATUS" = "completed" ]; then
    CONCLUSION=$(gh api "repos/$REPO/actions/runs/$RUN_ID" --jq '.conclusion')
    echo "Release workflow: $CONCLUSION"
    break
  fi
  echo "Still running... ($i/40)"
  sleep 15
done
```

### Step 6 — Verify artifacts

```bash
gh release view "$VERSION" --repo "$REPO"
gh api "users/${REPO%%/*}/packages/container/${REPO##*/}/versions" \
  --jq '.[0] | {tags: .metadata.container.tags, created: .created_at}'
```

### Step 7 — Return to previous branch + report

```bash
git checkout "$PREV_BRANCH"
```

```
Release $VERSION complete!

  Repo:     $REPO
  Tag:      $VERSION
  Branch:   release/$VERSION
  Image:    ghcr.io/$REPO:$VERSION
  Release:  https://github.com/$REPO/releases/tag/$VERSION
  CI:       <pass/fail with run URL>
```

If CI failed, include failure details and suggest fixes.
