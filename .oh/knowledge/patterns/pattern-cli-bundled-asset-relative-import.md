---
title: "Bundling repository files by relative import breaks the build site that stages the package alone"
slug: pattern-cli-bundled-asset-relative-import
kind: pattern
tags: [cli, esbuild, dockerfile, ci, bundling, build-context]
created: 2026-09-03
updated: 2026-09-03
sources:
  - .devcontainer/Dockerfile@9d52d780
  - .oh/cli/src/lib/registry.ts@9d52d780
  - .oh/cli/build.mjs@9d52d780
  - .oh/tasks/sandbox-registry/evidence.md@6cd1c99f
confidence: provisional
---

# Bundling repository files by relative import breaks the build site that stages the package alone

## Relevant Source Files
- `.devcontainer/Dockerfile@9d52d780` — `COPY .oh/cli/ /opt/oh/` then `npm run build` inside it: the one build site with no checkout around the package.
- `.oh/cli/src/lib/registry.ts@9d52d780` — six `../../../../.devcontainer/*.yml` and `../../../scripts/*.sh` text imports.
- `.oh/cli/build.mjs@9d52d780` — the esbuild text loader that made those imports work everywhere the checkout exists.

## Summary
When a package inlines files that live outside its own directory, a relative
import is the obvious way to name them and every gate that runs inside a full
checkout passes. The first build site that copies only the package — here the
sandbox image's `/opt/oh` stage — cannot resolve the paths, and the failure is
seen only on CI, after the local suite, the bundled-text probe, and the audit
were all green.

## Detail
**Symptom.** `sandbox-boot-guard`'s "Build sandbox image locally" step fails
with `Could not resolve "../../../../.devcontainer/docker-compose.yml"` (six
errors, one per bundled file) at `Dockerfile:48`, on a head where
`npm run build`, `pnpm test`, and `sandbox-registry.sh` had all passed
locally, and `/audit implementation` had classified the PR promotable.

**Root cause.** Four of the five sites that build the CLI (`publish-cli.yml`,
`build:harness`, `get-oh.sh` from a clone or a local checkout, the developer
worktree) run with the repository around the package, so a relative import
into `.devcontainer/` or `.oh/scripts/` resolves. The Dockerfile stages the
package in isolation to keep the image layer small. The local gates cannot
notice because they never build the package outside a checkout, and the probe
that pins the bundled bytes reads them from the built `dist/oh.js` produced in
the checkout.

**Workaround.** Give the bundle one asset root instead of relative paths: a
virtual specifier (`oh-asset:<repo-relative path>`) resolved by the build from
`OH_ASSET_ROOT` (default: the repository root above the package), and a
Dockerfile stage that copies exactly the bundled files under that root before
the build. Before pushing, run the image stage that builds the package
(`docker build --target base -f .devcontainer/Dockerfile .`) as a local gate
whenever `build.mjs`, the Dockerfile's CLI layer, or the set of bundled files
changes; the full `sandbox-boot-guard` job is the CI form of the same check.
