# `apps/`

pnpm workspace packages. Each subfolder is a deployable application with
its own `package.json`, declared in `pnpm-workspace.yaml` at the repo
root.

| Subfolder | Purpose                                                    |
| --------- | ---------------------------------------------------------- |
| `docs/`   | Docusaurus documentation site (deployed to Cloudflare Pages) |

## Conventions

- One package per subfolder; the directory name matches the package's
  short identifier (not its scoped npm name).
- All build artefacts (`build/`, `.docusaurus/`, `node_modules/`) are
  gitignored — see root `.gitignore`.
- New apps must be added to `pnpm-workspace.yaml` *and* to the layout
  tree in `docs/architecture/container-runtime.md` (single source of
  truth for repo layout).

## Working in an app

From the repo root:

```bash
pnpm --filter @openharness/docs dev      # run a workspace package
pnpm --filter @openharness/docs build    # build it
```

Inside the sandbox, long-running dev servers go in named tmux sessions
(`app-<name>`) — see `.claude/rules/sandbox-processes.md`.
