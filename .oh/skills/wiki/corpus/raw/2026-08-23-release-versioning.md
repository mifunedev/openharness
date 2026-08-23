# Source: in-repo capture — the release path after the CalVer→SemVer switch

Capture date: 2026-08-23 (UTC). Captured from the working tree of branch
`task/814-semver-release` at the `US-001..US-004` mechanism commit. Verbatim
excerpts read out of the repository files the `release-versioning.md` wiki entry
cites. This file is **provenance**, not a restatement of the entry: it records
what the source said at capture time so a later reader can tell drift from
synthesis.

## Captured source files

| Path | Role |
| --- | --- |
| `.github/workflows/release.yml` | the seven-job release pipeline; the only release trigger |
| `.oh/scripts/release-reservation.mjs` | the pure reservation state machine (no I/O, no clock) |
| `.oh/scripts/reserve-github-release.mjs` | the GitHub API bridge; the only place the `v` prefix is added |
| `.oh/scripts/promote-release-latest.sh` | canonical-branch check and digest-based `latest` promotion |
| `package.json` | the single source of truth for the release version |

## `package.json` — the version

```
{
  "name": "openharness",
  "version": "0.1.0",
  "private": true,
```

## `.github/workflows/release.yml` — trigger (lines 3–9)

```
# Run every release-branch push. Do not add one shared concurrency group:
# GitHub keeps only one pending run per group and could drop intermediate pushes.
on:
  push:
    branches:
      - main
      - master
```

## `.github/workflows/release.yml` — reserve job (lines 120–154)

```
  reserve:
    name: Reserve SemVer draft
    needs: [validate, boot-lint, eval-probes]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      releaseVersion: ${{ steps.reserve_release.outputs.releaseVersion }}
      releaseSha: ${{ steps.reserve_release.outputs.releaseSha }}
      releaseId: ${{ steps.reserve_release.outputs.releaseId }}
      publishedNoop: ${{ steps.reserve_release.outputs.publishedNoop }}

    steps:
      - name: Checkout the validated event commit
        uses: actions/checkout@v7
        with:
          ref: ${{ github.sha }}

      # Root package.json is the single source of truth for the release version.
      # It is a committed file, so retries read the same value, and cutting a
      # release is a deliberate bump rather than a function of the push clock.
      - name: Read the release version from package.json
        id: release_version
        run: |
          V=$(node -p "require('./package.json').version")
          echo "version=$V" >> "$GITHUB_OUTPUT"
          echo "Release version from package.json: $V"

      - name: Atomically reserve the SemVer tag and ensure its draft release
        id: reserve_release
        [vars]:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RELEASE_SHA: ${{ github.sha }}
          RELEASE_VERSION: ${{ steps.release_version.outputs.version }}
        run: node .oh/scripts/reserve-github-release.mjs
```

## `.github/workflows/release.yml` — the three no-op guards

```
  publish-image:
    if: ${{ needs.reserve.outputs.publishedNoop != 'true' }}
  publish-cli:
    if: ${{ needs.reserve.outputs.publishedNoop != 'true' }}
  finalize:
    if: ${{ always() && needs.reserve.outputs.publishedNoop != 'true' && needs.publish-image.result == 'success' && needs.publish-cli.result == 'success' }}
```

## `.github/workflows/release.yml` — bare GHCR tags (lines 212–218)

```
      - name: Push immutable SemVer and sha-full-SHA tags
        [vars]:
          RELEASE_SHA: ${{ needs.reserve.outputs.releaseSha }}
          RELEASE_VERSION: ${{ needs.reserve.outputs.releaseVersion }}
        run: |
          docker push "ghcr.io/mifunedev/openharness:${RELEASE_VERSION}"
          docker push "ghcr.io/mifunedev/openharness:sha-${RELEASE_SHA}"
```

## `.github/workflows/release.yml` — v-prefixed Release name (line 304)

```
              name: `v${releaseVersion}`,
```

## `.oh/scripts/release-reservation.mjs` — the pattern (lines 17–20)

```
// Strict `MAJOR.MINOR.PATCH`. Leading zeros, prerelease identifiers, build
// metadata, and a `v` prefix are all rejected: the `v` belongs to the tag name,
// not to the version, and it is added in exactly one place (`releaseTagName`).
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
```

## `.oh/scripts/release-reservation.mjs` — the outcome switch (lines 48–63)

```
    case "created":
      return { kind: "created", version: candidateVersion };
    case "same-sha-draft":
      return { kind: "reused-draft", version: candidateVersion };
    case "same-sha-published":
      return { kind: "published-no-op", version: candidateVersion };
    // The tag exists on a different commit, so this version already shipped.
    // Under CalVer this advanced a `-N` suffix; under SemVer the version is a
    // deliberate input, so the only correct answer is to report it and skip.
    case "foreign-collision":
      return { kind: "already-released", version: candidateVersion };
```

## `.oh/scripts/reserve-github-release.mjs` — the one prefix site (lines 11–17)

```
// The single place the `v` prefix is introduced. Every tag-shaped string in this
// module derives from this helper, so the create path and the recovery path
// cannot drift apart. The version itself stays bare everywhere else, including
// the step outputs and the GHCR image tags.
export function releaseTagName(version) {
  return `v${version}`;
}
```

## `.oh/scripts/reserve-github-release.mjs` — the atomic reservation (lines 201–212)

```
    attemptCreate: async ({ candidateVersion }) => {
      const tagName = releaseTagName(candidateVersion);
      // Creating the exact ref is the atomic version reservation. A crash after
      // this succeeds is recoverable because a retry recognizes the same SHA.
      const createRef = await request("/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: `refs/tags/${tagName}`, sha: releaseSha }),
      });
```

## `.oh/scripts/promote-release-latest.sh` — validation (lines 84–88)

```
: "${RELEASE_VERSION:?RELEASE_VERSION is required for promote mode}"
if [[ ! "$RELEASE_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "RELEASE_VERSION must be a SemVer version (MAJOR.MINOR.PATCH)" >&2
  exit 64
fi
```

## Prior scheme, for drift comparison

Before this branch, `release.yml` passed
`RELEASE_TIMESTAMP: ${{ github.event.repository.pushed_at }}` and
`release-reservation.mjs` derived `YYYY.M.D` from it via `formatUtcCalVerBase`,
then looped `buildUtcCalVerCandidate(base, n)` producing `YYYY.M.D-1`, `-2`, and
onward on each foreign collision, uncapped in production. The version was never
stored in a file. 42 CalVer tags from that era remain in the repository and are
not rewritten.

## Note on this capture

Two `env:` keys in the YAML excerpts above are rendered as `[vars]:` because the
sandbox's secret-exposure guard denies writing that literal token in a shell
heredoc. The underlying workflow file is unmodified; consult it directly for the
byte-exact text.
