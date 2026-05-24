# wiki/raw/ — Immutable WebFetch snapshots; entries cite via `sources:` frontmatter

This directory holds immutable source captures: one file per fetch, never overwritten. Each file records the content of a URL at the moment `/wiki-ingest` captured it. Wiki entity pages in `wiki/` reference these snapshots through their `sources:` frontmatter field, providing a concrete provenance trail for every claim.

## Conventions

- **Naming**: `<yyyy-mm-dd>-<slug>.md` — UTC date of the fetch, plus the slug that identifies the topic
- **Format**: each file opens with `# Source: <url>` followed by the fetched body verbatim
- **Immutability**: files are never edited after creation; re-ingesting a URL appends a new dated snapshot rather than overwriting the existing one
- **Gitignore**: all files in this directory are gitignored (`wiki/raw/*`); only this `README.md` is tracked (exempted by `!wiki/raw/README.md`)
- **Retrieval**: snapshots are not queried directly — `/wiki-query` operates on `wiki/<slug>.md` entity pages; snapshots exist for audit and provenance only

## Canonical docs

Full schema and authoring conventions: `context/rules/wiki.md`
