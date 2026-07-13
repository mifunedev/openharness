# Raw evidence — CodeLayer bounded local coding harness

Captured 2026-07-12 UTC for issue #635. Secret-free; no provider credentials or authenticated remote execution were used.

## Pinned package inspection

Artifact: `@humanlayer/codelayer@0.0.61`, tarball `https://registry.npmjs.org/@humanlayer/codelayer/-/codelayer-0.0.61.tgz`.

- `package.json` version: `0.0.61`.
- `package.json` bin: `{ "codelayer": "./dist/cli.js" }`.
- Tarball omits `dist/cli.js` and includes `src/cli.ts`, `src/command.ts`, `src/providers.ts`, and JavaScript bundles.
- Pinned source: https://unpkg.com/@humanlayer/codelayer@0.0.61/package.json
- CLI options/source: https://unpkg.com/@humanlayer/codelayer@0.0.61/src/command.ts
- credential/provider source: https://unpkg.com/@humanlayer/codelayer@0.0.61/src/providers.ts

## Harness contract inspected

- `.devcontainer/Dockerfile:140-152`: exact-true gate, exact package/prefix, Bun/source checks, unconditional wrapper removal, root-owned regular executable, non-symlink assertion.
- `.oh/install/codelayer-wrapper.sh:1-2`: exact Bun dispatch with `"$@"`.
- `.oh/scripts/ralph.sh:246-301`: safe simple flags parser, array invocation, provider/prompt ownership, output-vs-progress completion functions.
- `.oh/install/codelayer-status.sh:3-12`: command/help status reports installed separately from authentication.
- `harness.yaml.example:34` and `.oh/templates/harness.yaml:24`: commented default-off keys.

## Enabled/default image proof

Command:

```bash
CODELAYER_SMOKE_ID=local-20260712-pass \
  bash .oh/scripts/codelayer-image-smoke.sh
```

Identifiers:

```text
enabled_project=oh-codelayer-enabled-project-local-20260712-pass
disabled_project=oh-codelayer-default-project-local-20260712-pass
enabled_image=sandbox-oh-codelayer-enabled-local-20260712-pass
disabled_image=sandbox-oh-codelayer-default-local-20260712-pass
no_egress_network=oh-codelayer-no-egress-local-20260712-pass
```

Enabled checks passed: `/usr/local/bin/codelayer` was `root:root 755`, regular, executable, and not a symlink; `/usr/local/bin/bun` and only the exact published `/usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts` existed; wrapper bytes matched; real `codelayer --help` exited 0 and contained `Multi-provider coding agent`.

Exact no-egress adapter-shape command (scrubbed environment):

```bash
codelayer --model gpt-4.1 --verbose --provider openai \
  --prompt 'openharness credential-boundary smoke'
```

Observed exit `1`, pinned-source oracle:

```text
error: Missing OPENAI_API_KEY. Set it in your environment before running codelayer.
at requireEnv (/usr/local/lib/node_modules/@humanlayer/codelayer/src/providers.ts:42:13)
```

Default-image checks passed: command, package, wrapper, and source absent. Cleanup removed only the exact unique containers, images, and internal network. This proves local executable/parser compatibility, not authentication or remote E2E behavior.

## Scope

Accepted: default-off local `@humanlayer/codelayer@0.0.61` coding harness and explicit Ralph adapter.

Draft/deferred/unsupported: `@humanlayer/cli`, daemon, login, launch tokens, browser control, ports, remote workspace, credential storage, and remote control plane.
