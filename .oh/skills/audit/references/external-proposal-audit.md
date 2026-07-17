# External proposal decision audit

This private protocol is reachable only from `/audit harness --external <url|path>` and is mutually exclusive with `--focus`. Convene product/alignment, implementation/feasibility, and security/reliability perspectives. Produce an evidence-backed recommendation, non-goals, acceptance criteria, risks, and gating criteria.

Default mode is report-only. `--wiki-ingest` is valid only with `--external` and composes `/wiki ingest` in audit child mode. It does not imply an issue write.

Issue create/update/comment/label operations require all of `--external ... --apply issue --confirm`. Before confirmation print the exact create-or-update decision after a fresh duplicate check, repository, title or issue number, body/comment summary, and labels. `--apply issue --dry-run` prints the identical plan and writes nothing. `--apply issue` without `--confirm` stops after preview. `--confirm` and `--apply issue` are invalid in ordinary harness survey mode.
