# Execution prompt — wiki-consolidation

Build target: consolidate `/wiki-ingest`, `/wiki-query`, `/wiki-lint` into one
parameterized `/wiki <ingest|query|lint>` dispatcher owning its corpus at
`.mifune/skills/wiki/corpus/` (gitignored-by-default), per `prd.json`.

Status: **built + shipped**. Branch `feat/wiki-consolidation` → PR #319 on
`ryaneggz/openharness` base `development`, all CI green, MERGEABLE/CLEAN. All four
userStories `passes: true`. `/spec-execute --pr 319` resumes here to run the
post-build tail (audit → spec-retro → improve → groom) over the completed PR — no
rebuild, no new GitHub issue, no auto-merge.

Reference docs to consult when grooming: `references/schema.md` (canonical wiki
schema) and `AGENTS.md § The Workflow`.
