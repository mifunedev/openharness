# `.oh/tasks/`

Spec task workdirs. Each `<slug>/` subfolder is one autonomous build
session's four-file contract, created by `/spec plan` (the
`/ralph` skill produces the `prd.json` inside it) and built by
`.oh/scripts/spec-build.sh <slug>`.

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
- **This whole directory is gitignored** (`.gitignore`: `.oh/tasks/*` with
  `!.oh/tasks/README.md`), so only this guide is tracked by default. Task files a PR
  must carry — `prd.md`, `prd.json`, `prompt.md`, `progress.txt`, `evidence.md`,
  `eval-result.json` — are added explicitly with **`git add -f`**. A bare
  `git add .oh/tasks/<slug>/` stages nothing and commits silently without them, which
  is the same as never having written them from a reviewer's seat.
- **Do not edit `progress.txt` by hand** — the runner appends to it.

## Lifecycle

- Tasks are created under `.oh/tasks/<taskdesc>/`.
- The weekly `cleanup-tasks` cron (`.oh/crons/cleanup-tasks.md`) sweeps any
  task whose `progress.txt` ends with `STATUS: COMPLETE` into
  `.oh/tasks/archive/<YYYY-MM-DD>/<taskdesc>/`.
- `archive/` contents are gitignored except for archived task files
  themselves (see root `.gitignore`).

See `.oh/scripts/spec-build.sh` for the build-executor entry point.
