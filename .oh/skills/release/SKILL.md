---
name: release
description: |
  Release a validated Open Harness commit by pushing it to main or master, then
  monitor the automatic UTC CalVer/GHCR/GitHub Release workflow. TRIGGER when:
  asked to release, version, ship, cut a release, or verify release artifacts.
argument-hint: "[--dry-run]"
---

# Release

`.github/workflows/release.yml` owns version allocation and artifact mutation.
Every push to `main` or `master` is validated first, then atomically reserves a
UTC CalVer tag, publishes GHCR and the CLI (or confirms the CLI version already
exists), and finally publishes the GitHub Release. Do not pre-create a release
tag, draft, or `release/<version>` branch.

## 1. Resolve the canonical destination

```bash
if git remote get-url upstream >/dev/null 2>&1; then
  REMOTE=upstream
else
  REMOTE=origin
fi
REPO=$(gh repo view "$(git remote get-url "$REMOTE")" --json nameWithOwner -q .nameWithOwner)

if git ls-remote --exit-code --heads "$REMOTE" main >/dev/null 2>&1; then
  TARGET=main
elif git ls-remote --exit-code --heads "$REMOTE" master >/dev/null 2>&1; then
  TARGET=master
else
  echo "No main or master release branch exists on $REMOTE" >&2
  exit 1
fi
SOURCE=$(git branch --show-current)
printf 'Repo: %s · source: %s · release branch: %s\n' "$REPO" "$SOURCE" "$TARGET"
```

## 2. Pre-flight

Require all of the following before a release push:

- The working tree is clean.
- The source commit is pushed to the canonical remote.
- CI for the source commit is green.
- `CHANGELOG.md` has the intended notes under `[Unreleased]` (or an already
  versioned section when intentionally prepared).
- The remote release branch is an ancestor of the source commit, so promotion is
  a fast-forward.

```bash
test -z "$(git status --porcelain)" || { echo "Working tree is dirty" >&2; exit 1; }
git fetch "$REMOTE" "$SOURCE" "$TARGET" --tags
SHA=$(git rev-parse "$REMOTE/$SOURCE")
test "$(git rev-parse HEAD)" = "$SHA" || {
  echo "Local $SOURCE is not identical to $REMOTE/$SOURCE" >&2
  exit 1
}
git merge-base --is-ancestor "$REMOTE/$TARGET" "$SHA" || {
  echo "$TARGET has diverged from $SOURCE; reconcile before release" >&2
  exit 1
}
```

If `$ARGUMENTS` contains `--dry-run`, report the resolved repo, source, target,
SHA, clean-tree result, and fast-forward result, then stop without pushing.

## 3. Trigger the release

Promote the exact checked source SHA. The branch push—not a manually created
tag—is the release trigger.

```bash
git push "$REMOTE" "$SHA:refs/heads/$TARGET"
```

The workflow derives its UTC date from the immutable push-event timestamp.
Retries reuse a same-SHA draft or published release; foreign CalVer collisions
advance from `YYYY.M.D` to `YYYY.M.D-1`, `-2`, and onward.

## 4. Monitor and verify

Find the `release.yml` push run for `$SHA` and `$TARGET`, then watch it:

```bash
gh run list --repo "$REPO" --workflow release.yml --branch "$TARGET" \
  --commit "$SHA" --event push --limit 5 \
  --json databaseId,headSha,status,conclusion,url
# Once the matching run appears:
gh run watch <run-id> --repo "$REPO" --exit-status
```

After success, fetch tags and identify the UTC CalVer tag pointing to the exact
SHA, then verify both immutable image tags and the GitHub Release:

```bash
git fetch "$REMOTE" --tags
VERSION=$(git tag --points-at "$SHA" \
  | grep -E '^[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*(-[1-9][0-9]*)?$' \
  | sort -V | tail -1)
test -n "$VERSION" || { echo "No CalVer tag found for $SHA" >&2; exit 1; }
gh release view "$VERSION" --repo "$REPO"
printf 'Images: ghcr.io/mifunedev/openharness:%s and :sha-%s\n' "$VERSION" "$SHA"
```

The canonical mutable/latest branch is `main` when it exists, otherwise
`master`. Immediately before promotion, the workflow freshly reads both remote
refs and promotes the canonical head's CalVer image to `latest` by immutable
digest. Stale canonical runs and every noncanonical-branch run skip `latest`;
GitHub's `make_latest` flag uses the same rule after a second fresh check.
