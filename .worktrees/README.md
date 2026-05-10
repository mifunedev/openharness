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
| `agent/`  | `agent/<agent-name>` — agent worktrees or clones   |

The `agent/` subfolder holds two patterns: harness branch worktrees
(legacy in-tree agents) and standalone agent-repo clones with their own
`.git` (post-graduation agents). Example: `dc-designer` is cloned from
`https://github.com/ryaneggz/dc-designer` to `.worktrees/agent/dc-designer/`
as a full clone. Both patterns coexist.

See `.claude/rules/git.md` § Worktrees for the canonical workflow,
including the stale-worktree policy.

## Project clones — `project/<project-name>/`

Groupings of independent repos that have **their own git tracking** and
are NOT branches of the harness. Each `<project-name>/` is a workspace
for one project; the leaf repos inside it are full clones with their
own `.git`. Folder shape mirrors `agent/<agent-name>` — long-lived,
named, no issue prefix.

Example layout:

```
project/
  foo/
    web/    # standalone repo, own .git
    api/    # standalone repo, own .git
  bar/
    site/   # standalone repo, own .git
```

Create on demand:

```bash
mkdir -p .worktrees/project/<project-name>
git clone <url> .worktrees/project/<project-name>/<repo>
```

The `project/` directory is gitignored — it materializes only when you
clone something into it. Lifecycle is `git clone` / `rm -rf`, not
`git worktree`.

---

Everything under `.worktrees/` is gitignored except this README.
