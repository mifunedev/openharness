---
name: release
description: |
  Release a validated Open Harness commit by pushing it to main or master, then
  monitor the automatic SemVer/GHCR/GitHub Release workflow. TRIGGER when:
  asked to release, version, ship, cut a release, or verify release artifacts.
argument-hint: "[--dry-run]"
---

# Release

`.github/workflows/release.yml` owns version allocation and artifact mutation.
The workflow validates every push to `main` or `master` first, then reserves the
`v<version>` tag for the version root `package.json` names, publishes GHCR and
the CLI (or confirms the CLI version already exists), and finally publishes the
GitHub Release. Do not pre-create a release tag, draft, or `release/<version>`
branch.

Root `package.json` holds the version. No other file records it. A release is a
deliberate bump: an unchanged version gives a clean, green no-op run.

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
- Root `package.json` names the version to publish, and no `v<version>` tag
  exists yet. An unbumped push is a green no-op that publishes nothing.
- `CHANGELOG.md` has a `## [<version>]` section matching that version (the
  workflow falls back to `[Unreleased]` when the section is absent).
- The remote release branch is an ancestor of the source commit, so promotion is
  a fast-forward.

```bash
test -z "$(git status --porcelain)" || { echo "Working tree is dirty" >&2; exit 1; }
git fetch "$REMOTE" "$SOURCE" "$TARGET" --tags
VERSION=$(node -p "require('./package.json').version")
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && {
  echo "v$VERSION is already tagged; bump package.json to cut a new release" >&2
  exit 1
}
grep -q "^## \[$VERSION\]" CHANGELOG.md || {
  echo "CHANGELOG.md has no section for $VERSION" >&2
  exit 1
}
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

The workflow reads the version from root `package.json` on the pushed commit, so
retries always resolve the same version. A retry reuses a same-SHA draft or
published release. When the tag already exists on a different commit, the reserve
step reports the version as already released and every publication job skips —
the run stays green. Bump the version to publish again.

## 4. Monitor and verify

Find the `release.yml` push run for `$SHA` and `$TARGET`, then watch it:

```bash
gh run list --repo "$REPO" --workflow release.yml --branch "$TARGET" \
  --commit "$SHA" --event push --limit 5 \
  --json databaseId,headSha,status,conclusion,url
# Once the matching run appears:
gh run watch <run-id> --repo "$REPO" --exit-status
```

After success, fetch tags and identify the SemVer tag pointing to the exact SHA,
then verify both immutable image tags and the GitHub Release. The tag carries the
`v` prefix; the image tags do not:

```bash
git fetch "$REMOTE" --tags
TAG=$(git tag --points-at "$SHA" \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -V | tail -1)
test -n "$TAG" || { echo "No SemVer tag found for $SHA" >&2; exit 1; }
gh release view "$TAG" --repo "$REPO"
printf 'Images: ghcr.io/mifunedev/openharness:%s and :sha-%s\n' "${TAG#v}" "$SHA"
```

The canonical mutable/latest branch is `main` when it exists, otherwise
`master`. Immediately before promotion, the workflow freshly reads both remote
refs and promotes the canonical head's versioned image to `latest` by immutable
digest. Stale canonical runs and every noncanonical-branch run skip `latest`;
GitHub's `make_latest` flag uses the same rule after a second fresh check.
