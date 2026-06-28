# `.worktrees/`

Scratch space for two kinds of checkouts that live next to the harness
repo without polluting it.

The split is by **kind of repo**, not by *who* owns it:

| Top-level | What lives here |
| --------- | --------------- |
| `agent/`  | **Harnesses** — anything that adopts the Open Harness shape. Either a `git worktree` of a harness branch in *this* repo, or a standalone harness repo (private or public) with its own remote — including a fork of an Open Harness orchestrator, even when it is not a branch of this repo. |
| `project/`| **Non-harness repos** — independent projects that happen to live next to the harness for convenience. They do not inherit the Open Harness layout. |
| `feat/` `bug/` `task/` `audit/` `skill/` | `git worktree` checkouts of in-flight harness branches, named after the branch prefix in `.mifune/skills/git/SKILL.md`. |
| `archive/` | `archive/<YYYY-MM-DD>` — weekly cleanup-tasks archive sweeps. |

## `agent/` — harness branches and standalone harness repos

Two sub-shapes share this folder because they share the same shape on
disk: they all look like Open Harness inside. A fork of an Open Harness
orchestrator belongs here even when it is not a branch of this repo — pick
whichever sub-shape fits.

### A. Harness branch worktree

`git worktree add` of a branch in *this* repo:

```bash
git worktree add -b agent/<name> .worktrees/agent/<name> $BASE
```

### B. Standalone harness repo (private or public)

A separate repo that adopts the Open Harness shape but has its own remote
— for example, a fork of an Open Harness orchestrator. Cloned into
`.worktrees/agent/<repo-name>/`:

```bash
git clone git@github.com:<owner>/<repo>.git .worktrees/agent/<repo>
```

The operator designates which of (A) or (B) applies when the path is
first created. There is no automatic distinction; treat the folder as a
self-contained harness either way.

## `project/<owner>/<repo>/` — non-harness repos

Durable clones of independent repos that are **not** harnesses. Use this
for collateral projects, extracted packages, app repos, and anything
whose layout is not the Open Harness shape.

Folder shape mirrors the remote owner/repo:

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

## Branch-prefix subfolders (`feat/`, `bug/`, `task/`, `audit/`, `skill/`)

`git worktree` checkouts of in-flight branches in this repo. The folder
mirrors the branch prefix from `.mifune/skills/git/SKILL.md`. The dated
`archive/<YYYY-MM-DD>` folders hold weekly cleanup-tasks archive sweeps.
Lifecycle is `git worktree add` / `git worktree remove`.

---

See `.mifune/skills/git/SKILL.md` § Worktrees for the canonical workflow,
including the stale-worktree policy.

Everything under `.worktrees/` is gitignored except this README.
