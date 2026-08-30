# Memory — Lessons Learned

Durable, distilled lessons for this harness instance. The `/retro` skill
appends supported findings here under `## Lessons Learned`, one bullet per
lesson (`- **YYYY-MM-DD**: <lesson>`). This file is gitignored and local to
this instance; it is auto-seeded by `.oh/scripts/ensure-memory-file.sh` when
missing. A lesson graduates to `.oh/context/IDENTITY.md` once it recurs across
sessions. See `.oh/skills/retro/references/memory-protocol.md`.

## Lessons Learned
- **2026-07-08**: Pi Agent tool may not discover `.oh/agents/*` custom agents in this checkout; invoking `advisor` fell back to `general-purpose`, so advisor handoffs should verify agent discovery or create/use a provider bridge before relying on custom agent semantics.
- **2026-08-03**: An archive run showed that `gh` repository inference can target a configured upstream even when Git pushes to `origin`; origin-bound PR operations should pass an explicit `--repo` derived from the origin URL.
- **2026-08-10**: A weekly cleanup run showed that orphan-directory scans under `.oh/worktrees/` must exclude every descendant of registered worktree roots before running `rmdir`; checking only exact roots or ancestors traverses valid checkouts and misclassifies their directories.
