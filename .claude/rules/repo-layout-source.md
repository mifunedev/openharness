# Repository Layout — Single Source of Truth

The annotated repository tree lives ONLY at
`docs/architecture/container-runtime.md` under the `## Repo Layout
{#repo-layout}` heading.

## Do not

- Add a directory tree (├── / └── / │ box-drawing) to `AGENTS.md`,
  `CLAUDE.md`, `README.md`, `docs/`, or any other file.
- Duplicate the layout in commit messages, PR descriptions, or
  CHANGELOG entries beyond a single sentence.

## Do

- Update `docs/architecture/container-runtime.md#repo-layout` whenever
  a top-level directory is added, renamed, or removed.
- Replace any duplicate tree found elsewhere with a one-line pointer
  to the canonical anchor.
- When adding a new directory whose purpose is non-obvious, add a
  one-line annotation to the canonical tree at the same time.

## Why

Three independent tree copies drifted across `AGENTS.md`, `README.md`,
and `docs/architecture/container-runtime.md` before this rule existed.
The single-source pattern keeps the next drift round from happening.
