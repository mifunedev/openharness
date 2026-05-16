# `docs/`

Source content for [skills.mifune.dev](https://skills.mifune.dev) — the browsable skill catalog and documentation site.

## Purpose

- Per-skill pages are generated from `skills/<name>/README.md` + registry metadata.
- Authoring guides, contribution docs, and architecture references live here.
- The site is built by Docusaurus (or equivalent) in CI and deployed to `skills.mifune.dev`.

## Conventions

- Markdown only. No generated output committed here.
- File names use kebab-case.
- Cross-references to skill folders use relative paths (`../skills/<name>/SKILL.md`), not absolute URLs, so they resolve correctly both locally and on the deployed site.

See the repo root `README.md` (US-008) for the public-facing project overview.
