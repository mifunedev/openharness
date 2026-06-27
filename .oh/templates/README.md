# `.oh/templates/` — the `oh init` scaffold payload

This directory is the source payload that `oh init` materializes into a
target repository. Running `oh init [targetDir]` recursively copies every
file under `.oh/templates/` into the target, with two special cases:

- The top-level file named `gitignore` is **appended** to the target's
  `.gitignore` (only new, non-duplicate lines), rather than copied verbatim.
- **`README.md` (this file) is NOT copied** — `oh init` excludes it by name,
  because it documents the payload rather than belonging to a target repo.

## Why `devcontainer.json` carries a stub image

`.devcontainer/devcontainer.json` must be valid JSON (it is `JSON.parse`d by
tooling and tests), and JSON cannot carry comments. Its `image` value,
`ghcr.io/mifunedev/openharness:latest`, is a **documented stub** — replace it
with the image your project actually publishes.

## Running `oh init`

The installed on-PATH `oh` binary does not yet bundle these templates, so run
`oh init` from a built OpenHarness checkout or pass `--templates <dir>`
pointing at this directory (Phase 2 slice 1, issue #531).
