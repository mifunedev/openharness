# Social image wiki ingest pattern

Use when the user asks to study an attached image or screenshot from a social/share URL and index the knowledge in `wiki/`.

## Capture packet

Preserve both the visual artifact and a text snapshot:

- Normalize the social URL by stripping tracking params for human-facing prose, while keeping the original acquisition URL in the raw snapshot when useful.
- Copy the attached image into `wiki/raw/<yyyy-mm-dd>-<slug>.<ext>` when the image itself is the primary source.
- Record image checksum and dimensions in `wiki/raw/<yyyy-mm-dd>-<slug>.md` so future readers can verify they are looking at the same artifact.
- Fetch lightweight social metadata when possible (`og:title`, `og:description`, `og:image`), but treat captions as wrapper context, not authoritative source truth.
- Use vision/OCR to extract visible text, chart structure, source attribution, and uncertainty notes. Mark low-resolution names as provisional rather than overclaiming exact OCR.

## Wiki synthesis shape

For market maps, charts, and screenshots, index the reusable analysis frame rather than the promotional claim:

- what the image asserts;
- source attribution visible in the image;
- the durable decomposition or technique (e.g. supply-chain layers, diligence checklist, taxonomy);
- how to reuse it;
- limitations and verification caveats.

Keep the entry under the normal 600-word cap. Put long OCR lists, checksums, and metadata in the raw snapshot, not the wiki body.

## README regeneration pitfall

When regenerating `wiki/README.md` without `/wiki-lint`, match `evals/probes/wiki-readme-index.sh` exactly: it extracts only literal single-line `tags:` values from frontmatter. Do not normalize multi-line YAML lists into bracket syntax during ad-hoc regeneration, or the probe will fail on existing entries that use block-style tags.
