# Concurrent wiki ingest worktrees

Use this reference when an `add to wiki` request arrives while the main checkout is already on an active feature branch, has unrelated edits, or another wiki ingest is in flight.

## Pattern

1. Inspect the current git state first (`git status --short --branch`).
2. If the active checkout is not a clean branch dedicated to this ingest, create an isolated worktree under the repo-local worktree root:
   - `git fetch origin`
   - `git worktree add .worktrees/feat/<short-slug>-wiki -b feat/<short-slug>-wiki origin/development`
3. Run the normal ingest workflow from inside that worktree:
   - create `wiki/raw/<date>-<slug>.md` as local provenance
   - create/update `wiki/<slug>.md`
   - regenerate `wiki/README.md` via `/wiki-lint` or the atomic fallback
   - append `memory/<date>/log.md`
4. Commit and push only the tracked deliverables, normally `wiki/<slug>.md` and `wiki/README.md`.
5. In the final report, name the worktree path, branch, commit, and note any gitignored provenance files.

## Why

Wiki ingest often coexists with feature work. A dedicated worktree prevents unrelated branch state from leaking into the wiki commit and lets multiple ingest PRs proceed independently.
