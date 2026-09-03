---
title: "oh CLI Portable Lifecycle"
slug: oh-cli-portable-lifecycle
kind: repo
tags: [cli, oh, lifecycle, standalone, registry, sandbox, remote-fetch, execution-target, update]
created: 2026-07-03
updated: 2026-09-03
sources:
  - .oh/cli/src/cli.ts
  - .oh/cli/src/commands/sandbox.ts
  - .oh/cli/src/commands/lifecycle.ts
  - .oh/cli/src/commands/update.ts
  - .oh/cli/src/lib/registry.ts
  - .oh/cli/src/lib/bundled-assets.ts
  - .oh/cli/build.mjs
  - .oh/cli/src/lib/manifest.ts
  - .oh/cli/src/lib/vendor.ts
  - .oh/manifest.json
  - .oh/cli/src/lib/execution/target.ts
  - .oh/cli/src/lib/execution/docker-compose-target.ts
  - .oh/cli/src/lib/remote.ts
  - .oh/cli/src/lib/project.ts
  - .oh/scripts/docker-compose.sh
  - .oh/scripts/gateway.sh
  - .oh/evals/probes/sandbox-registry.sh
  - .oh/README.md
  - docs/lifecycle-commands.md
  - docs/oh-directory-layout.md
  - docs/rfcs/rfc-brain-hands-boundary.md
verified_at: 1b13bb1da5ce286f662accf2c501c6307e09e329
related: [fresh-machine-setup, compose-env-boundary]
confidence: provisional
---

# oh CLI Portable Lifecycle

## Relevant Source Files
- `.oh/cli/src/lib/registry.ts` — the sandbox registry: `registryRoot()`, `entryRoot()`, `listEntries()`, `nextDefaultName()`, `materialize()`, `resolveSandboxRoot()`.
- `.oh/cli/src/lib/bundled-assets.ts`, `.oh/cli/build.mjs` — the four compose files and two scripts esbuild inlines as text into `dist/oh.js`.
- `.oh/cli/src/commands/sandbox.ts` — `oh sandbox install <runtime>` (wizard, entry write, materialise, provision) and `oh sandbox list`.
- `.oh/cli/src/commands/lifecycle.ts` — `oh shell|stop|restart|logs|ps|destroy [name]`; thin wrappers over the `ExecutionTarget` contract and the materialised wrapper script.
- `.oh/cli/src/lib/execution/target.ts`, `docker-compose-target.ts` — the provider-neutral contract and its one adapter, which owns the engine argv.
- `.oh/cli/src/cli.ts` — arg parsing, `resolveUpdateSource` (payload precedence + auto-fallback), `runWithRemoteSource`, verb dispatch, `--sandbox` on `oh config` / `oh secret`.
- `.oh/cli/src/commands/update.ts` — the `.oh/` + `crons/` bootstrap and upgrade.
- `.oh/cli/src/lib/remote.ts` — `fetchRemoteSource`: shallow clone, `GIT_TERMINAL_PROMPT=0`, bounded timeout.
- `.oh/cli/src/lib/project.ts` — equipped-root walk-up resolver, still used by the in-repo verbs.
- `.oh/scripts/docker-compose.sh`, `gateway.sh` — the scripts the verbs delegate to.
- `.oh/evals/probes/sandbox-registry.sh` — the tier-A probe that pins the bundled texts to the tracked files and forbids engine argv outside the wrapper.

## Summary
Issue #950 moved sandbox configuration out of the project checkout. `oh sandbox install docker` runs from any directory: a wizard writes a **registry entry** under `${OH_HOME:-~/.oh}/sandboxes/<name>/`, the CLI materialises the compose files and wrapper script it bundles into that entry, and the container starts. `oh shell <name>` and the other lifecycle verbs resolve a sandbox by name from anywhere; a project checkout is an optional `--repo` bind mount. `oh update` equips an empty checkout with the `.oh/` + `crons/` payload and is also the upgrade path; `oh init`, `oh runtime`, and `.oh/templates/` no longer exist. Issue #564's standalone-consumer goal survives with one fewer moving part: an installed `oh` binary now carries everything a sandbox needs.

## Detail
**A registry entry is a root.** `registryRoot()` is `${OH_HOME}/sandboxes` with `OH_HOME` defaulting to `<homedir>/.oh` (`registry.ts:19-28`); names match `^[a-z0-9][a-z0-9-]*$` (`registry.ts:15`). Each entry holds the exact layout `.oh/scripts/docker-compose.sh` already expected of a repo: `oh.json`, an optional `.env` (secrets), `.devcontainer/docker-compose.yml` plus the ssh and docker-sock overlays, and `.oh/scripts/docker-compose.sh` + `check-host-port.sh`. `materialize()` (`registry.ts:117`) rewrites those six files from the bundled texts on every lifecycle call, so the entry always matches the CLI version and the operator edits only `oh.json`. Without `repo` the base is the image-only compose file; with `repo` it is the checkout-binding file, whose bind and build context read `${OH_REPO_DIR:-..}` — the `..` default keeps CI and an in-checkout run byte-identical.

**Bundled assets.** `build.mjs:19` registers esbuild's text loader for `.yml` and `.sh`; `bundled-assets.ts:1-13` imports the six tracked files and re-exports them as typed constants. `dist/oh.js` remains the only artifact. `sandbox-registry.sh` compares what a materialised entry contains against the tracked files byte for byte, so a change to a compose file without a rebuild is a REGRESSION, and it fails if `lifecycle.ts` or `sandbox.ts` ever spawns `docker` directly.

**`oh sandbox install <runtime>`** (`sandbox.ts:139`) accepts `docker`; `microsandbox` refuses with a pointer to `docs/rfcs/rfc-runtime-support.md` and to `oh tool install microsandbox` (the runtime catalog in `lib/runtimes/catalog.ts` now lists only those two). On a TTY without `--yes` the wizard asks name, timezone, git identity, SSH (with host port), and the Docker socket; `--yes` keeps every default (name `oh-sbx-<n>` for the lowest unused integer, `registry.ts:80`; host `TZ`; global git identity; SSH and socket off). With `--repo <dir>` the defaults seed from that checkout's `oh.json` and `repo` is written into the entry. `--image=<ref>` is persisted as `image.ref` so later verbs render the same image; `--print-argv` materialises into a temporary preview root and writes no entry (`sandbox.ts:192`). Success prints `next: oh shell <name>`. `oh sandbox list [--json]` shows name, runtime, status from `target.status()`, and repo. Bare `oh sandbox` prints help and exits 1; there is no implicit `up`.

**Name resolution.** Every lifecycle verb calls `resolveSandboxRoot({ name, cwd })` (`registry.ts:134`; `lifecycle.ts:93`): an explicit name → that entry; else the single registered entry; else the entry whose `repo` contains `cwd`; else an error listing the registered names (or, with an empty registry, `create one with oh sandbox install docker`). `oh destroy <name>` prompts for the name unless `--yes`, runs `down -v`, then removes the entry directory (`lifecycle.ts:370`). `oh config show|set --sandbox <name>` and `oh secret set|list --sandbox <name>` act on the entry; without the flag they use `resolveProjectRoot` on the equipped checkout as before (`cli.ts:121-148`).

**Rendering.** The verbs still render `oh.json` into a temporary `compose.env` passed as `--extra-env-file` (`lifecycle.ts:42-75`); the rendered set gained `OH_REPO_DIR` (`config-render.ts:40`). Nothing seeds a `.devcontainer/.env`; the wrapper reads `<root>/.env` for secrets.

| Verb | Side | Route | Delegates to |
| --- | --- | --- | --- |
| `oh sandbox install docker` | hands | wizard → entry `oh.json` → `materialize()` → `provision()` | `bash <entry>/.oh/scripts/docker-compose.sh --repo-dir <entry> up -d --build\|--no-build` |
| `oh shell [name]` | hands | `attach({argv:["zsh"], user:"sandbox"})` | the adapter's engine argv (`docker-compose-target.ts`) |
| `oh stop\|restart\|logs\|ps\|destroy [name]` | hands | `resolveSandboxRoot()` → `materialize()` → wrapper | `bash <entry>/.oh/scripts/docker-compose.sh <compose verb>` |
| `oh gateway <args…>` | brain | none — deliberately not routed | `bash .oh/scripts/gateway.sh` with `OH_PROJECT_ROOT=<root>` |

**`oh update` is the bootstrap.** `resolveUpdateSource` (`cli.ts:898`) picks `--from <dir>` > `--from-remote [--ref]` > the CLI's own bundled payload (manifest marker) > a remote fetch with a one-line notice. A target with no `.oh/` reads as version `0.0.0` (`update.ts:56`) and receives the full payload; a second run prints `already up to date (v…)` (`update.ts:88`). It writes only what `.oh/manifest.json` ships — `.oh/**` per the include list plus `crons/**` — and never `oh.json`, `.env`, `AGENTS.md`, `.gitignore`, `.devcontainer/`, or provider directories; the operator owns those. `templates/**` left the manifest with the scaffold. `copyOhPayload()` still walks only the source `.oh/` tree and writes only below the target `.oh/` (`vendor.ts`), so root `docs/` stays project-owned.

**Remote fetch** — `git clone --depth 1 [--branch <ref>] -- <url> <tmp>` of `https://github.com/mifunedev/openharness` with `GIT_TERMINAL_PROMPT=0` and a 120 s timeout (`remote.ts`); `runWithRemoteSource` prints `fetched payload vX (installed CLI vY)` (`cli.ts:953`) so version skew is visible. Public HTTPS only.

**Troubleshooting / limits**
- Host prerequisites: Node.js ≥ 20, git, docker. No checkout is needed to create or drive a sandbox.
- A sandbox created before #950 from a checkout (compose project = the checkout's `.devcontainer/`) is not in the registry; `oh sandbox install docker --name <its name> --repo <checkout>` adopts the compose project and its volumes.
- `SANDBOX_NAME` in the process environment overrides the rendered name, so evidence runs inside another sandbox must `env -u SANDBOX_NAME`.
- The brain/hands rationale, the state classes, and why `attach()` is synchronous live in `docs/rfcs/rfc-brain-hands-boundary.md`; cite it, do not restate it.

## System Relationships
```mermaid
flowchart LR
  OP[operator, any cwd] --> SI["oh sandbox install docker"]
  SI --> WZ[wizard / --yes defaults] --> ENTRY["${OH_HOME:-~/.oh}/sandboxes/&lt;name&gt;/oh.json"]
  BUNDLE[bundled compose + wrapper texts in dist/oh.js] --> MAT["materialize()"] --> ENTRY
  ENTRY --> PV["ExecutionTarget.provision()"] --> DC["docker-compose.sh --repo-dir &lt;entry&gt; up -d"]
  REPO["--repo &lt;checkout&gt;"] -. OH_REPO_DIR bind .-> DC
  OP --> SH["oh shell|ps|logs|stop|restart|destroy [name]"] --> RS["resolveSandboxRoot()"] --> ENTRY
  OP --> UP["oh update [--from|--from-remote]"] --> PAYLOAD[".oh/ + crons/ into a checkout"]
  PROBE[sandbox-registry.sh] -.pins.-> BUNDLE
```

## See Also
- [[fresh-machine-setup]]
- [[compose-env-boundary]] — the rendered set and why `OH_REPO_DIR` is in it.
- [[release-versioning]] — the harness release version; the `@mifune/openharness` npm version is independent of it.
- `docs/rfcs/rfc-brain-hands-boundary.md` — authority for the brain/hands split this entry routes through.
