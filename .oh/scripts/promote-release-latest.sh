#!/usr/bin/env bash
# Promote the canonical release branch's immutable image to latest by digest.
set -euo pipefail

usage() {
  echo "usage: promote-release-latest.sh <check|promote>" >&2
  exit 64
}

MODE=${1:-}
case "$MODE" in
  check|promote) ;;
  *) usage ;;
esac

: "${RELEASE_BRANCH:?RELEASE_BRANCH is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must be a full lowercase 40-character commit SHA" >&2
  exit 64
fi

REMOTE=${RELEASE_REMOTE:-origin}
REFS=$(git ls-remote --heads "$REMOTE" refs/heads/main refs/heads/master)
main_sha=""
master_sha=""
while IFS=$'\t' read -r sha ref; do
  case "$ref" in
    refs/heads/main)
      [[ -z "$main_sha" ]] || { echo "duplicate main ref returned by $REMOTE" >&2; exit 1; }
      main_sha=$sha
      ;;
    refs/heads/master)
      [[ -z "$master_sha" ]] || { echo "duplicate master ref returned by $REMOTE" >&2; exit 1; }
      master_sha=$sha
      ;;
    "") ;;
    *) echo "unexpected ref returned by $REMOTE: $ref" >&2; exit 1 ;;
  esac
done <<< "$REFS"

if [[ -n "$main_sha" ]]; then
  canonical_branch=main
  canonical_sha=$main_sha
elif [[ -n "$master_sha" ]]; then
  canonical_branch=master
  canonical_sha=$master_sha
else
  echo "neither main nor master exists on $REMOTE" >&2
  exit 1
fi

if [[ ! "$canonical_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "$REMOTE returned an invalid $canonical_branch SHA: $canonical_sha" >&2
  exit 1
fi

make_latest=false
if [[ "$RELEASE_BRANCH" == "$canonical_branch" && "$RELEASE_SHA" == "$canonical_sha" ]]; then
  make_latest=true
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'canonicalBranch=%s\n' "$canonical_branch"
    printf 'canonicalSha=%s\n' "$canonical_sha"
    printf 'makeLatest=%s\n' "$make_latest"
  } >> "$GITHUB_OUTPUT"
fi

if [[ "$MODE" == check ]]; then
  printf 'canonical=%s head=%s release_branch=%s release_sha=%s make_latest=%s\n' \
    "$canonical_branch" "$canonical_sha" "$RELEASE_BRANCH" "$RELEASE_SHA" "$make_latest"
  exit 0
fi

if [[ "$make_latest" != true ]]; then
  printf 'Skipping latest: canonical=%s head=%s release_branch=%s release_sha=%s\n' \
    "$canonical_branch" "$canonical_sha" "$RELEASE_BRANCH" "$RELEASE_SHA"
  exit 0
fi

: "${RELEASE_VERSION:?RELEASE_VERSION is required for promote mode}"
if [[ ! "$RELEASE_VERSION" =~ ^[0-9]{4}\.[1-9][0-9]*\.[1-9][0-9]*(-[1-9][0-9]*)?$ ]]; then
  echo "RELEASE_VERSION must be a UTC CalVer version" >&2
  exit 64
fi

IMAGE_REPOSITORY=${IMAGE_REPOSITORY:-ghcr.io/mifunedev/openharness}
VERSION_IMAGE="${IMAGE_REPOSITORY}:${RELEASE_VERSION}"
LATEST_IMAGE="${IMAGE_REPOSITORY}:latest"
INSPECTION=$(docker buildx imagetools inspect "$VERSION_IMAGE")
digest=""
while IFS= read -r line; do
  if [[ "$line" =~ ^Digest:[[:space:]]+(sha256:[0-9a-f]{64})[[:space:]]*$ ]]; then
    [[ -z "$digest" ]] || { echo "multiple top-level digests returned for $VERSION_IMAGE" >&2; exit 1; }
    digest=${BASH_REMATCH[1]}
  fi
done <<< "$INSPECTION"

if [[ -z "$digest" ]]; then
  echo "docker did not return one valid top-level digest for $VERSION_IMAGE" >&2
  exit 1
fi

# Address the immutable source by digest so latest never depends on a mutable
# local tag or on a second registry tag lookup after the canonical-head check.
docker buildx imagetools create --tag "$LATEST_IMAGE" "${VERSION_IMAGE}@${digest}"
printf 'Promoted %s@%s to %s from canonical %s\n' \
  "$VERSION_IMAGE" "$digest" "$LATEST_IMAGE" "$canonical_branch"
