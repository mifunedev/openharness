# `.oh/knowledge/raw/` — immutable external snapshots

One file per fetch, never overwritten. Each records the content of an external
URL or document at the moment `/wiki ingest` captured it. `kind: external` entity
pages under `.oh/knowledge/source/` cite these snapshots through `sources:`,
giving every outside claim a concrete provenance trail.

## Conventions

- **Naming**: `<yyyy-mm-dd>-<slug>.md` — UTC date of the fetch plus the topic slug.
- **Format**: the file opens with `# Source: <url>` followed by the fetched body
  verbatim.
- **Immutability**: never edited after creation. Re-ingesting a URL writes a new
  dated snapshot; the prior one stays.
- **Tracked**: these files are committed. An untracked snapshot is provenance a
  fresh clone cannot verify, which is the same as no provenance.
- **External only**: a `kind: repo` page cites the repository paths it depends on
  directly. It never snapshots this repository's own source into here.
- **Not queried**: `/wiki query` reads entity pages. Snapshots exist for audit
  and provenance.

## Canonical docs

Full schema and authoring conventions:
[`.oh/skills/wiki/references/schema.md`](../../skills/wiki/references/schema.md).
