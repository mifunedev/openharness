# `tasks/`

Ralph task workdirs. Each `<taskdesc>/` subfolder is one autonomous
Ralph session created by the `/ralph` skill (or by running
`scripts/ralph.sh <taskdesc>` directly).

A task directory typically contains:

| File           | Purpose                                                  |
| -------------- | -------------------------------------------------------- |
| `prd.json`     | Ralph-formatted PRD — the runner's authoritative spec    |
| `prd.md`       | Human-readable PRD that `prd.json` was generated from    |
| `prompt.md`    | Optional standing prompt prepended to each Ralph turn    |
| `progress.txt` | Ralph's running log; ends with `STATUS: COMPLETE` on done |
| `critique.md`  | Optional critic notes from PRD review                    |

## Conventions

- `<taskdesc>` is kebab-case and matches the branch name's `<short-desc>`
  segment when the task corresponds to a harness branch.
- `prd.json` and `progress.txt` are tracked so a session can be resumed
  from another checkout; transient runner state under
  `.ralph/` (logs, archives, last-branch pointer) is gitignored.
- **Do not edit `progress.txt` by hand** — the runner appends to it.

## Lifecycle

- Tasks are created under `tasks/<taskdesc>/`.
- The weekly `cleanup-tasks` cron (`crons/cleanup-tasks.md`) sweeps any
  task whose `progress.txt` ends with `STATUS: COMPLETE` into
  `tasks/archive/<YYYY-MM-DD>/<taskdesc>/`.
- `archive/` contents are gitignored except for archived task files
  themselves (see root `.gitignore`).

See `docs/architecture/container-runtime.md#repo-layout` for where this
sits in the broader tree, and `scripts/ralph.sh` for the runner entry
point.
