# `projects/`

Durable clones of repositories that are **not** harnesses — collateral projects,
extracted packages, app repos, and anything whose layout is not the Open Harness
shape. They live next to the harness for convenience; they are not part of it.

Each clone is its own git boundary, with its own remote, branches, CI, and history.
Never commit into one from the harness root, and never resolve a change here by
resetting the harness checkout — the two repositories are independent.

Folder shape mirrors the remote:

```
projects/<owner>/<repo>/
```

Each clone keeps its own worktrees at `projects/<owner>/<repo>/.worktrees/`, the
same rule the harness follows at its root.

Lifecycle is `git clone` / `rm -rf`, never `git worktree` — these are separate
repositories, not checkouts of this one. Override the root with `PROJECTS_DIR`;
`.oh/scripts/oh-path projects` resolves the effective path.

Everything here is gitignored except this file. See the `/worktrees` skill
§ PROJECT CLONE for the procedure.
