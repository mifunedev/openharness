# `.oh/knowledge/local/` — per-machine scratch, never an input

Gitignored working space for knowledge that is not ready to be shared: a draft
page, a half-verified note, an experiment. Everything here is invisible to every
other machine and to CI.

**Nothing reads this directory.** `/wiki query` enumerates `../source/` and
`../patterns/`. Every `/spec` flow consumes tracked knowledge only. There is no
flag that folds a local page into a normal result set, and that is the point: a
plan grounded in a page one machine can see is a plan nobody else can reproduce.

## Promotion

Promotion is explicit and goes through the one authorized write path:

```bash
/wiki ingest --from-draft <slug>          # a draft at $TMPDIR/oh-wiki-drafts/<slug>.md
/wiki ingest .oh/knowledge/local/<slug>.md --slug <slug>
```

Either lands a schema-valid, tracked page under `.oh/knowledge/source/`. Moving
the file by hand is not promotion — it skips the schema, the provenance, and the
index.

## Canonical docs

[`.oh/skills/wiki/references/schema.md`](../../skills/wiki/references/schema.md).
