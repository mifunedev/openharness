# Advisor-led reference inventory — docs project root

Issue #857 moves the tracked GitHub-readable documentation tree from `.oh/docs/` to root `docs/`. The advisor first read the governing context and returned a bounded five-job plan. Five read-only explorers then ran in parallel before implementation. This artifact records the synthesized findings and the decisions passed to execution.

## Decision summary

- Move the complete tracked tree with `git mv`; do not leave a duplicate or `.oh/docs` symlink.
- Root `docs/` is project-owned human-facing documentation. The `.oh/manifest.json` and `copyOhPayload()` contract remains `.oh`-scoped, so root docs are not copied or overwritten by `oh init`/`oh update`.
- Change CLI catalog display paths to `docs/...`; keep `/docs/...` rendered-site URLs and unrelated external docs URLs unchanged.
- Add root `docs/**` to the harness CI path filter, but do not widen the substrate-only sandbox boot workflow.
- Update current source-backed knowledge and fixtures. Preserve `CHANGELOG.md`, archived task artifacts, immutable wiki raw snapshots, eval history, and `docs/rfcs/preserved-changelog-rationale.md` as historical records.
- Root `docs/` needs no extra directory-anchor README: the migrated `docs/README.md` is the index and the directory name is self-evident under `.oh/context/directory-readme.md`.

## Explorer 1 — literal references and links

| Surface | Findings | Action | Exception |
|---|---|---|---|
| Root guidance | `README.md`, `AGENTS.md`, `CONTRIBUTING.md` point at `.oh/docs` | Rewrite to `docs` | Changelog history stays |
| Runtime/user output | `Makefile`, `.oh/cli/src/cli.ts`, `.oh/scripts/install.sh`, `.devcontainer/*`, issue templates | Rewrite printed and instructional paths | None |
| CLI catalogs | Harness/runtime/tool `docsPath` literals use `.oh/docs` | Use root-relative `docs/...` and update tests | None |
| Context and skills | `.oh/context/REPO_MAP.md`, audit context, git/herdr skills | Rewrite live routing/citations | Raw/history records stay |
| Probes/tests | Docs, lifecycle, image, Slack, stale-reference, script and CLI tests | Repoint and strengthen root guard | Eval results are regenerated |
| Wiki/current tasks | Current wiki entries and non-archive task requirements cite `.oh/docs` | Update current source references | `.oh/tasks/archive/**`, raw snapshots, and completed historical records are classified, not mass-rewritten |

The exhaustive search covered tracked files with `git grep -n -I -F '.oh/docs'`, `docs/README.md`, and `docs/`, plus URL searches. Every live hit was assigned to a required action or an explicit historical exception.

## Explorer 2 — CLI, manifest, and payload

| Consumer | Current contract | Root-docs impact | Required action |
|---|---|---|---|
| `.oh/manifest.json` | `docs/**` is relative to `.oh` and currently ships `.oh/docs/**` | Root `docs/**` is not visible to the `.oh` walker | Remove `docs/**`; keep the `.oh` boundary |
| `lib/vendor.ts` | Walks source `.oh`, writes only below target `.oh`, and rejects escapes | Cannot and must not copy root docs | Preserve `assertDestInTarget()`; test root docs are untouched |
| `init`/`update` | Source and target payload operations are `.oh`-scoped | Root docs otherwise stay project-owned | Add explicit non-vendoring/preservation assertions; retain legacy coverage |
| Harness/runtime/tool catalogs | Commands forward literal `docsPath` values | Old paths become stale | Change all values and output assertions to `docs/...` |
| CLI package/remote source | Bundled/remote resolution centers on checkout `.oh` | No implicit root-doc payload | Do not broaden npm payload or source path semantics |

## Explorer 3 — guards, tests, and CI

| Guard or fixture | Encoded assumption | Post-migration assertion |
|---|---|---|
| `docs-build-fast-path.sh` | Docs index and no-site-build checks use `.oh/docs` | Guard root `docs/`, allow Markdown plus `_category_.json`, reject Docusaurus machinery, retain external site checks |
| `oh-payload-manifest.sh` and manifest tests | `docs/**` is an allow-listed payload | Assert `docs/**` is absent and root docs are not copied by payload operations |
| Init/update/vendor tests | Docs are delivered to target `.oh/docs` | Use root source fixtures and assert target root docs are preserved/not managed; keep legacy `.oh` test where applicable |
| Catalog and script tests | Read old path | Read existing root `docs/...` files |
| Lifecycle/image/Slack/stale-reference probes | Hard-code old locations | Repoint to root and retain their behavior checks |
| Capability orientation/eval results | Expected paths and baseline mention `.oh/docs` | Update live expected paths; regenerate `RESULTS.md` via `/eval` |
| `.github/workflows/ci-harness.yml` | `.oh/**` catches the old tree | Add `docs/**` to push and pull-request filters |
| `sandbox-boot-guard.yml` | Substrate-only expensive workflow | Leave docs out unless docs become a boot dependency |

## Explorer 4 — documentation links and site boundary

### Relative links requiring rewrite

- `docs/README.md` — `../scripts/registry-portability.md` becomes `../.oh/scripts/registry-portability.md`.
- `docs/artifact-contract-schema.md` — `../skills/...` becomes `../.oh/skills/...`.
- `docs/contributing.md` — `../../CONTRIBUTING.md` and `../../.github/...` become `../...`.
- `docs/glossary.md` — `.oh` machinery links gain `../.oh/`; root `AGENTS.md` and `.devcontainer/` links lose one `../`.
- `docs/harness-manifest.md` — root `.devcontainer` depth loses one `../`; script link becomes `../.oh/scripts/...`.
- `docs/open-core.md` — `../../LICENSE` and `../../NOTICE` become `../LICENSE` and `../NOTICE`.
- `docs/deployment-prebuilt-image.md` and `docs/security-considerations.md` — root and `.oh` paths lose one parent traversal.
- `docs/oh-directory-layout.md` — links to `.oh/README.md` and `.oh/context/directory-readme.md` become explicit `../.oh/...` paths.
- Extensionless local links in installation/quickstart become explicit `.md` targets where GitHub resolution requires it.

### Retain

- Rooted rendered-site links such as `/docs/connecting`, `/docs/harnesses/...`, and `/docs/integrations/...`.
- External provider documentation URLs for Claude, Hermes, OpenCode, DeepAgents, xAI, Docker, and Herdr.
- Code-block paths that describe runtime bind mounts rather than Markdown-relative links.

### Missing/prospective references

- The RFC's references to a future `docs/integrations/mcp-exec-runner.md` and an absent prospective Railway probe are not implemented by this move; classify them as proposal content rather than inventing files.
- `docs/rfcs/preserved-changelog-rationale.md` remains verbatim historical rationale and is an explicit stale-reference exception.

## Explorer 5 — history and compatibility

- `#536` externalized the rendered site/blog, then `#543` moved GitHub-readable Markdown under `.oh/docs` to group the control plane. This task intentionally reverses only the Markdown placement.
- The current manifest change later made `.oh/docs` payload-shipped; moving to root removes that payload entry rather than weakening the `.oh` destination guard.
- Existing installed repos can retain old `.oh/docs` files because `oh update` does not delete unmanaged files. This PR does not perform destructive cleanup or create a compatibility symlink; it makes the new source and command contracts explicit.
- Historical `CHANGELOG.md`, archived tasks, raw wiki snapshots, eval history, and preserved rationale describe states that were true when recorded. They remain unchanged and are excluded/classified by guards.

## Commands run by the explorers

- `git grep -n -I -F '.oh/docs' -- .`
- `git grep -n -I -F 'docs/README.md' -- .`
- `git grep -n -I -E 'docs/|https?://[^ ]*(docs|documentation)' -- .`
- Targeted reads of `.oh/manifest.json`, CLI catalogs/vendor/init/update tests, eval probes, CI workflows, docs metadata, `.oh/README.md`, context rules, and prior rename history.

## Pre-execution acceptance

All five explorer jobs completed before the implementation plan was committed. Their outputs were synthesized into `.oh/tasks/docs-project-root/prd.md`; no implementation edits were made during the inventory phase.
