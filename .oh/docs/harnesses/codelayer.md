---
title: "CodeLayer"
---

# CodeLayer

Open Harness supports a **bounded, optional local coding-harness integration** for exactly `@humanlayer/codelayer@0.0.61`. It is off by default. This does not install or support `@humanlayer/cli`, a remote daemon, login automation, launch tokens, browser control, or a HumanLayer control plane.

## Enable and rebuild

Copy or edit `harness.yaml`, uncomment the key, and rebuild:

```yaml
install:
  codelayer: true
```

```bash
make destroy
make sandbox
make shell
```

Legacy `.devcontainer/.env` configuration can set `INSTALL_CODELAYER=true`; an explicit `harness.yaml` value wins. The image banner says **installed** only after `codelayer --help` succeeds locally. Installation does not prove provider authentication or authenticated usability.

## Why Open Harness supplies a wrapper

The pinned package declares `dist/cli.js` as its executable but omits that file while publishing `src/cli.ts` and JavaScript bundles ([pinned `package.json`](https://unpkg.com/@humanlayer/codelayer@0.0.61/package.json), [pinned `src/cli.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/cli.ts)). The image therefore unconditionally replaces `/usr/local/bin/codelayer` with a root-owned regular executable:

```sh
#!/bin/sh
exec /usr/local/bin/bun /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts "$@"
```

The build fails if Bun or that exact published source path is missing. Open Harness does not copy or vendor CodeLayer source.

## Verify installation

Inside a rebuilt sandbox:

```bash
codelayer --help
stat -c '%F %U:%G %a' /usr/local/bin/codelayer
readlink /usr/local/bin/codelayer || true
```

Expected wrapper state is `regular file root:root 755`; `readlink` prints nothing. Help is a credential-free local parser check. It is not authentication evidence.

## Direct use and operator-owned authentication

The pinned CLI exposes `--prompt`, `--provider`, and `--model`; its listed provider values and defaults are package behavior ([`src/command.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/command.ts), [`src/providers.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/providers.ts)). Provider selection, model selection, and credentials are operator configuration. Open Harness does not authenticate CodeLayer and has not run a credentialed end-to-end test.

```bash
codelayer --provider openai --model <operator-selected-model> --prompt 'Inspect this repository'
```

For example, pinned source requires `OPENAI_API_KEY` for the `openai` provider and reports a missing-key error before execution when it is absent ([`src/providers.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/providers.ts)). Consult the pinned source for other provider-specific authentication; installed never means authenticated.

## Ralph adapter

CodeLayer is explicit-only and is never in Ralph's fallback order:

```bash
RALPH_CODELAYER_PROVIDER=openai \
RALPH_CODELAYER_FLAGS='--model gpt-4.1 --verbose' \
  bash .oh/scripts/ralph.sh --harness=codelayer <task-slug>
```

`--harness codelayer` and `RALPH_HARNESS=codelayer` are also accepted. Ralph owns long `--prompt` and emits `--provider "$RALPH_CODELAYER_PROVIDER"` only when non-empty.

`RALPH_CODELAYER_FLAGS` is intentionally not shell syntax. Empty or whitespace-only means no extra flags; otherwise use simple whitespace-delimited tokens only. Quotes, backslashes, embedded spaces represented by quotes, shell metacharacters, and glob characters are rejected. So are every `--prompt*`, `--provider*`, `-p`, and attached `-pVALUE` form. Ralph parses a Bash array without `eval` and with pathname expansion disabled.

CodeLayer's final-message wrapper is diagnostic only. Ralph completes only when `progress.txt` contains a whole line exactly `STATUS: COMPLETE`.

## Tested boundary

The enabled/default image smoke builds through build-only Compose in isolated Docker-in-Docker and runs uniquely named containers on an internal no-egress network. It proves:

- the enabled wrapper is a root-owned executable regular file, not a symlink;
- the exact published source exists and `codelayer --help` succeeds;
- exact adapter-shaped `--model gpt-4.1 --verbose --provider openai --prompt ...` parsing reaches pinned source's expected missing-`OPENAI_API_KEY` boundary; and
- the default image has no command, package, wrapper, or CodeLayer source.

This proves local executable and adapter compatibility only—not provider authentication, model availability, remote execution, or authenticated E2E behavior.

## Rollback

Set `install.codelayer: false` (or remove the key and retain `INSTALL_CODELAYER=false`), then rebuild. Verify absence:

```bash
! command -v codelayer
! test -e /usr/local/bin/codelayer
! test -e /usr/local/lib/node_modules/@humanlayer/codelayer
! test -e /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts
```

If the source-wrapper help or adapter parsing evidence regresses, disable the integration and downgrade support wording to Draft. The remote-daemon appendix remains Draft regardless.
