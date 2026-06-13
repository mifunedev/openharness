# `.worktrees/`

Scratch space for two kinds of checkouts that live next to the harness
repo without polluting it.

## Branch worktrees

`git worktree add` checkouts of in-flight harness branches. Top-level
subfolders mirror the harness branch prefix:

| Subfolder | Branches it holds                                  |
| --------- | -------------------------------------------------- |
| `feat/`   | `feat/<issue#>-...` — new features                 |
| `bug/`    | `bug/<issue#>-...` — bug fixes                     |
| `task/`   | `task/<issue#>-...` — chores / maintenance         |
| `audit/`  | `audit/<issue#>-...` — review / audit branches     |
| `skill/`  | `skill/<issue#>-...` — skill authoring             |
| `agent/`  | `agent/<agent-name>` — harness agent branches only |
| `archive/`| `archive/<YYYY-MM-DD>` — weekly cleanup-tasks archive sweeps |

The `agent/` subfolder is for work tied to a named AI agent identity in
this harness: either a true harness branch worktree (`agent/<agent-name>`)
or a legacy agent-owned clone that has not yet graduated to the project
layout. Do **not** put new long-lived external repos here just because an
agent will work on them.

Why this needed clarification: this README previously allowed
"standalone agent-repo clones" under `agent/`, which blurred the line
between agent identity and project ownership. New standalone repos should
use `project/<owner>/<repo>/` so the path reflects the remote project, not
which agent happened to clone it first.

See `.claude/rules/git.md` § Worktrees for the canonical workflow,
including the stale-worktree policy.

## Project clones — `project/<owner>/<repo>/`

Durable clones of independent repos that have **their own git tracking**
and are NOT branches of the harness. Use this for collateral projects,
extracted packages, app repos, and anything whose long-term identity is a
GitHub repo rather than a harness agent branch.

Folder shape mirrors the remote owner/repo. This prevents collisions and
makes the remote obvious from the path.

Example layout:

```
project/
  <owner>/
    <repo>/       # https://github.com/<owner>/<repo>.git
    <other-repo>/ # https://github.com/<owner>/<other-repo>.git
  <org>/
    <repo>/       # https://github.com/<org>/<repo>.git
```

Create on demand:

```bash
mkdir -p .worktrees/project/<owner>
git clone https://github.com/<owner>/<repo>.git .worktrees/project/<owner>/<repo>
```

The `project/` directory is gitignored — it materializes only when you
clone something into it. Lifecycle is `git clone` / `rm -rf`, not
`git worktree`.

---

Everything under `.worktrees/` is gitignored except this README.
