# RFC: Bounded local CodeLayer coding-harness support

**Status:** **Accepted only for the bounded local `@humanlayer/codelayer` coding-harness integration** for [#635](https://github.com/mifunedev/openharness/issues/635). The remote-daemon appendix remains **Draft, deferred, and unaccepted**.

## Decision

Open Harness accepts a default-off local coding harness pinned to exactly `@humanlayer/codelayer@0.0.61`, selected directly or explicitly through Ralph. This decision does not accept or install `@humanlayer/cli`; it creates no daemon, login automation, launch token, browser control, port, credential store, remote workspace, or control plane.

The operator directive for #635 supersedes the former docs-only plan. GitHub issue/PR title, body, comment, and reciprocal-link mutation is intentionally deferred to the final alignment story; core implementation and documentation do not depend on a web PR URL.

## Package defect and bounded repair

The pinned package declares `./dist/cli.js` in its `bin` map but omits that file while publishing TypeScript source and JavaScript bundles ([pinned `package.json`](https://unpkg.com/@humanlayer/codelayer@0.0.61/package.json), [pinned `src/cli.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/cli.ts)). Installation therefore:

1. installs only `@humanlayer/codelayer@0.0.61` under `/usr/local/lib/node_modules`;
2. verifies `/usr/local/bin/bun` and the exact published `src/cli.ts`;
3. unconditionally runs `rm -f /usr/local/bin/codelayer`;
4. creates a root-owned `0755` regular file, not a symlink, containing:

   ```sh
   #!/bin/sh
   exec /usr/local/bin/bun /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts "$@"
   ```

5. copies or vendors no CodeLayer source; and
6. fails the image build closed when any required path or ownership assertion fails.

## Configuration and runtime contract

Both shipped templates expose only commented `# codelayer: false`. `install.codelayer: true` maps to `INSTALL_CODELAYER=true` and YAML retains precedence over the legacy `.devcontainer/.env` seam. Only exact `true` installs the package.

The banner checks the command and offline local help. It reports **installed**, never authenticated, ready, or usable. Provider, API-key, and model behavior are operator configuration from pinned source: the CLI option surface is in [`src/command.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/command.ts), provider defaults and credential requirements in [`src/providers.ts`](https://unpkg.com/@humanlayer/codelayer@0.0.61/src/providers.ts). No credentialed provider/model execution is accepted as evidence here.

Ralph accepts `--harness=codelayer`, `--harness codelayer`, or `RALPH_HARNESS=codelayer`; CodeLayer never enters automatic fallback. Ralph owns long `--prompt`. It optionally emits exactly `--provider "$RALPH_CODELAYER_PROVIDER"`. `RALPH_CODELAYER_FLAGS` is limited to simple whitespace-delimited tokens and rejects quotes, backslashes, shell metacharacters, globs, and all prompt/provider collisions. Parsing uses a Bash array without `eval`, with pathname expansion disabled. CodeLayer final output is diagnostic only; Ralph completion requires a whole exact `STATUS: COMPLETE` line in `progress.txt`.

An existing tmux server normally contributes its preexisting environment even when `new-session -E` blocks client `update-environment`; that unrelated inheritance is not prohibited by this decision. To make invoking-shell CodeLayer auth reliable, Ralph adds per-session tmux 3.3a `-e NAME=value` arguments only for `RALPH_CODELAYER_PROVIDER`, `RALPH_CODELAYER_FLAGS`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `FIREWORKS_API_KEY`, `EXA_API_KEY`, `AGENTLAYER_AUTH_PATH`, `AGENT_SDK_AUTH_PATH`, and `OPENCODE_AUTH_PATH`. Secret values never enter the pane command or Ralph log. Set-empty and unset states remain distinct; absent allowlisted names are explicitly unset in the pane so stale server copies do not win.

## Acceptance evidence

Final alignment artifacts: [issue #635](https://github.com/mifunedev/openharness/issues/635), [core PR #636](https://github.com/mifunedev/openharness/pull/636), and [openharness-web PR #21](https://github.com/mifunedev/openharness-web/pull/21). These links close the accepted local coding-harness alignment only; they do not accept the remote-daemon appendix.

On 2026-07-12, `.oh/scripts/codelayer-image-smoke.sh` built enabled and default images through build-only Compose and ran uniquely named containers on an internal no-egress Docker network. Exact local identifiers were:

```text
enabled_project=oh-codelayer-enabled-project-local-20260712-pass
disabled_project=oh-codelayer-default-project-local-20260712-pass
enabled_image=sandbox-oh-codelayer-enabled-local-20260712-pass
disabled_image=sandbox-oh-codelayer-default-local-20260712-pass
no_egress_network=oh-codelayer-no-egress-local-20260712-pass
```

The enabled image proved regular `root:root 755` wrapper state, exact source uniqueness, and successful real source-wrapper `codelayer --help` containing `Multi-provider coding agent`. The exact adapter-shaped command was:

```bash
codelayer --model gpt-4.1 --verbose --provider openai \
  --prompt 'openharness credential-boundary smoke'
```

With a scrubbed environment and no egress, it exited `1` at the pinned source boundary:

```text
error: Missing OPENAI_API_KEY. Set it in your environment before running codelayer.
at requireEnv (/usr/local/lib/node_modules/@humanlayer/codelayer/src/providers.ts:42:13)
```

The default image proved command, package, wrapper, and source absence. This is local executable/parser compatibility evidence only. It is not authentication, model availability, provider connectivity, remote execution, or authenticated E2E evidence.

A dedicated isolated Docker-in-Docker `sandbox-boot-guard` job repeats both builds and no-egress smokes. `.oh/evals/probes/codelayer-supported-harness.sh` guards the exact pin, wrapper, explicit adapter, diagnostic completion boundary, safe smoke lifecycle, and daemon-free scope.

## Rollback

Set or retain `install.codelayer: false` / `INSTALL_CODELAYER=false`, rebuild, and prove that `command -v codelayer`, `/usr/local/bin/codelayer`, `/usr/local/lib/node_modules/@humanlayer/codelayer`, and its `src/cli.ts` are absent. Smoke cleanup removes only exact unique images, containers, and network; global prune, volumes, broad Compose teardown, and operator Docker resources are forbidden. If either real help or adapter parsing evidence regresses, disable support and return this local decision to Draft.

## Draft appendix: remote daemon

**Status: Draft, deferred, unaccepted.** HumanLayer documentation describes `humanlayer login`, `humanlayer daemon launch`, launch tokens, browser session management, and managed worktrees ([Remote Daemons](https://docs.humanlayer.com/guide/remote-daemons), [Workspaces](https://docs.humanlayer.com/guide/workspaces)). None of those surfaces belongs to the accepted package or tested path.

Before any future daemon decision, a separate RFC and credentialed disposable-sandbox spike must establish exact `@humanlayer/cli` pinning, data flow, credential/revocation behavior, token argv exposure, egress and ports, lifecycle supervision, health, workspace correctness, cleanup, and rollback. Until then Open Harness supports none of it.

## Conclusion

**Accepted only for the bounded local `@humanlayer/codelayer@0.0.61` coding-harness integration.** Installation remains optional and is not authentication. The `@humanlayer/cli` remote daemon, login, launch-token, browser, workspace-control, and control-plane proposal remains **Draft, deferred, and unaccepted**.
