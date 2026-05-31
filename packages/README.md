# `packages/`

Project-local packages. Each subfolder owns its package manifest and
tooling; pnpm-managed packages are declared in `pnpm-workspace.yaml` at
the repo root.

| Subfolder | Purpose                                                     |
| --------- | ----------------------------------------------------------- |
| `docs/`   | Docusaurus documentation site (deployed to GitHub Pages)     |
| `oh/`     | In-sandbox Open Harness CLI for configuration wizards        |

## Conventions

- One package per subfolder; the directory name matches the package's
  short identifier (not its scoped npm name).
- All build artefacts (`build/`, `.docusaurus/`, `node_modules/`) are
  gitignored — see root `.gitignore`.
- New pnpm-managed packages must be added to `pnpm-workspace.yaml`.

## Working in a package

From the repo root:

```bash
pnpm --filter @openharness/docs start    # run a workspace package
pnpm --filter @openharness/docs build    # build it
```

Inside the sandbox, long-running dev servers go in named tmux sessions
(`app-<name>`) — see `.claude/rules/sandbox-processes.md`.
