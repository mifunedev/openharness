# PRD: Move docs to project root

## Introduction

Move the GitHub-readable Open Harness documentation from `.oh/docs/` to the conventional project-root `docs/` directory. The rendered Docusaurus site and blog remain external in `mifunedev/openharness-web`; this change moves only the tracked Markdown and category metadata in this repository and updates every live consumer that points at it.

The advisor-led pre-execution reference inventory is recorded in [reference-inventory.md](reference-inventory.md). It classifies active references, CLI payload behavior, regression guards, documentation links, and historical exceptions before implementation.

## Goals

- Place every tracked file currently under `.oh/docs/` at the identical relative path under root `docs/`, with no compatibility symlink or duplicate tree.
- Repoint current repository, CLI, script, skill, wiki, template, test, probe, and CI references to the new root location.
- Keep root `docs/` human-facing and Markdown/category-metadata only; do not restore Docusaurus build machinery or move the external site.
- Make the `.oh` payload boundary explicit: root `docs/` is project documentation and is not copied or overwritten by `oh init` or `oh update`, which continue to manage only target `.oh/`.
- Preserve historical records and immutable snapshots unless a current source-backed reference must be corrected.

## User Stories

### US-001: Relocate documentation and repair internal links

**Description:** As a maintainer, I want the documentation tree at the project root so GitHub and normal repository tooling discover it at the conventional `docs/` path without broken links.

**Acceptance Criteria:**

- [ ] Every tracked file matching `.oh/docs/**` exists at the same relative path below `docs/**`.
- [ ] `.oh/docs/` is absent, and no `.oh/docs` compatibility symlink or duplicate tree is created.
- [ ] Repository-relative Markdown links and repository-location examples resolve from their new `docs/` locations; root and `.oh/` traversal depth is corrected, and extensionless local links are made explicit where required.
- [ ] Rendered-site `/docs/...` links and unrelated external documentation URLs remain external links.
- [ ] `docs/` contains the migrated `README.md` index and existing `_category_.json` metadata only in addition to Markdown; it contains no Docusaurus package, config, sidebar, or build script.
- [ ] Tests pass
- [ ] Typecheck passes

### US-002: Repoint live guidance and catalog consumers

**Description:** As an operator, I want commands, catalog output, installation guidance, skills, and repository maps to name the root docs so every current read path remains usable after the move.

**Acceptance Criteria:**

- [ ] Root `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.oh/README.md`, `.oh/context/REPO_MAP.md`, issue templates, Makefile output, devcontainer messages, and active scripts use `docs/...` for repository documentation.
- [ ] Harness, runtime, and tool catalog `docsPath` values and their command/test assertions use root-relative `docs/...` paths and resolve to existing files.
- [ ] Active skills, wiki entries, templates, and current task requirements use the new path; immutable raw snapshots, archived task evidence, the changelog, and explicitly preserved historical rationale are not mass-rewritten.
- [ ] A tracked-reference audit reports no unexplained active `.oh/docs` references.
- [ ] Tests pass
- [ ] Typecheck passes

### US-003: Make the payload and regression contracts match the root move

**Description:** As a maintainer, I want the CLI payload and regression guards to state the new ownership boundary so an update cannot silently vendor or overwrite a project's root documentation.

**Acceptance Criteria:**

- [ ] `.oh/manifest.json` no longer declares `docs/**`; its paths remain relative to `.oh/` and its `patches/**` exclusion remains intact.
- [ ] `oh init` and `oh update` tests prove root `docs/` is not copied through the `.oh` payload and an existing target root `docs/` file is preserved; legacy `.oh` payload behavior remains covered where applicable.
- [ ] Catalog, manifest, vendor, init, and update tests pass with the new root-docs boundary.
- [ ] `docs-build-fast-path.sh` guards root `docs/` as Markdown/category-metadata only, rejects Docusaurus/build machinery, points the README check at `docs/README.md`, and retains the external-site invariant.
- [ ] Related lifecycle, image, Slack, stale-reference, payload, and CI-path guards point at root `docs/`; `ci-harness.yml` runs for `docs/**` changes without widening the sandbox-only boot workflow unnecessarily.
- [ ] Tests pass
- [ ] Typecheck passes

### US-004: Align durable knowledge and complete verification

**Description:** As a maintainer, I want durable knowledge and benchmark expectations to describe the new docs location so future agents do not rediscover the old layout.

**Acceptance Criteria:**

- [ ] Current wiki entries that describe repository docs or the CLI payload are updated with root `docs/` paths, source-backed claims, relevant system relationships, and `## See Also` navigation; immutable raw snapshots remain unchanged.
- [ ] `.oh/skills/wiki/corpus/README.md` is refreshed and `bash .oh/evals/probes/wiki-readme-index.sh` passes.
- [ ] `.oh/evals/capability/repo-orientation/tasks.json` and current guard fixtures expect root `docs/` paths; generated eval results are refreshed by the eval runner rather than hand-edited.
- [ ] Focused link/reference checks, relevant CLI/script tests, the docs and payload probes, and the full applicable test/typecheck commands pass.
- [ ] The implementation records any deliberate divergence and remaining unverified items in `.oh/tasks/docs-project-root/evidence.md` before the PR is promoted.
- [ ] Tests pass
- [ ] Typecheck passes

## Functional Requirements

- **FR-1:** Move the complete tracked `.oh/docs/` tree to `docs/` without changing each file's path relative to the documentation root.
- **FR-2:** Treat repository-relative `docs/...` paths as the current source location. Treat `/docs/...` and `https://.../docs/...` links as rendered-site or external URLs unless their surrounding text proves they are repository paths.
- **FR-3:** Keep the `.oh` manifest and vendor writer scoped to `.oh`; do not add parent-directory globs or weaken `assertDestInTarget()` to reach root `docs/`.
- **FR-4:** Expose root-relative `docsPath` values from the CLI catalogs and update all output/tests that consume them.
- **FR-5:** Keep `docs/` free of Docusaurus build dependencies and configuration. The rendered site remains owned by `mifunedev/openharness-web`.
- **FR-6:** Update current source-backed wiki and capability references while preserving changelog, archive, raw-snapshot, and preserved-rationale history.

## Non-Goals

- Do not move or recreate the rendered Docusaurus site, blog, or its build workflow.
- Do not make `oh init` or `oh update` write outside the target `.oh/` control-plane boundary.
- Do not create a `.oh/docs` compatibility symlink or maintain two documentation copies.
- Do not rewrite historical `CHANGELOG.md`, archived task artifacts, immutable wiki raw snapshots, or `docs/rfcs/preserved-changelog-rationale.md` merely to normalize old paths.
- Do not change application behavior unrelated to documentation discovery, catalog output, or payload guards.

## Technical Considerations

- The existing manifest is relative to `.oh/`, and `copyOhPayload()` walks only that directory and writes only below target `.oh/`. Root docs therefore become project-owned source documentation and are intentionally outside the portable `.oh` payload.
- Catalogs expose display paths but do not copy files. Their values must be root-relative and must resolve in this checkout.
- The migrated `docs/README.md` remains the docs index. The directory README convention does not require a second anchor for a self-evident root `docs/` directory.
- The root CI harness workflow must include `docs/**` so docs-only pull requests receive a check; the expensive sandbox boot workflow remains substrate-scoped.

## Success Metrics

- The transformed tracked-file set is exact: no missing or extra documentation files.
- Zero unexplained active `.oh/docs` references remain outside the documented historical exceptions.
- Root-relative documentation links resolve, and all relevant focused tests and probes pass.
- A fresh PR receives green CI and reaches ready-for-review without auto-merge.

## Open Questions

- None. The approved boundary is root-owned `docs/`, no `.oh/docs` compatibility symlink, and no root-doc copying by the `.oh` payload commands.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/oh-cli-portable-lifecycle.md`, `.oh/skills/wiki/corpus/fresh-machine-setup.md`, `.oh/skills/wiki/corpus/managed-agents.md`, `.oh/skills/wiki/corpus/molt-agentic-reinforcement-learning.md`, `.oh/skills/wiki/corpus/runtime-isolation-landscape.md`, `.oh/skills/wiki/corpus/recursive-self-improvement-survey.md`, `.oh/skills/wiki/corpus/prime-agent-harness.md` (update only entries whose current source references are affected)
- **Spec alignment**: Current entries must describe human-facing docs at root `docs/`, the `.oh` manifest/vendor boundary, and the unchanged external rendered-site ownership. Historical raw snapshots and archived evidence retain the paths that were true when captured.
- **Acceptance criteria**: Update affected entries with relevant source files and line-cited claims, include system relationships for the CLI payload or runtime boundary where applicable, retain `## See Also`, refresh `.oh/skills/wiki/corpus/README.md`, and pass `bash .oh/evals/probes/wiki-readme-index.sh`.
