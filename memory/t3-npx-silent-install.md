# t3 npx silent install (pingdotgg/t3code)

Created: 2026-05-09

Triage of `npx t3` (`t3@0.0.22` from https://github.com/pingdotgg/t3code) producing a fully silent exit 1 on Linux x64 / Node 22.22.2. Filed upstream as https://github.com/pingdotgg/t3code/issues/2621. This note is the topic-tier durable record per `context/rules/memory.md`.

## Reproduction

Host: WSL2, Linux 6.6.114.1-microsoft-standard-WSL2, Node v22.22.2, npm v10.9.7.

```bash
npx --yes -p t3@0.0.22 t3 --help
echo "exit=$?"
```

Observed:

- Exit code: `1`
- stdout: 0 bytes
- stderr: 0 bytes
- No console output of any kind. The user is left with no signal.

## Smoking Gun

From `~/.npm/_logs/2026-05-09T17_18_53_456Z-debug-0.log` (verbatim, lines 1401-1416):

```
1401 info run msgpackr-extract@3.0.3 install node_modules/msgpackr-extract node-gyp-build-optional-packages
1402 info run node-pty@1.1.0 install node_modules/node-pty node scripts/prebuild.js || node-gyp rebuild
1403 info run msgpackr-extract@3.0.3 install { code: 0, signal: null }
1404 info run node-pty@1.1.0 install { code: 1, signal: null }
1411 verbose cwd /tmp/t3-clean
1412 verbose os Linux 6.6.114.1-microsoft-standard-WSL2
1413 verbose node v22.22.2
1414 verbose npm  v10.9.7
1415 verbose exit 1
1416 verbose code 1
```

A separate `npm install` run surfaces the underlying gyp failure that npx swallowed:

```
npm error gyp ERR! build error
npm error gyp ERR! stack Error: not found: make
npm error gyp ERR! stack at getNotFoundError (/usr/lib/node_modules/npm/node_modules/which/lib/index.js:16:17)
npm error gyp ERR! stack at which (/usr/lib/node_modules/npm/node_modules/which/lib/index.js:77:9)
npm error gyp ERR! cwd /tmp/t3-extract/package/node_modules/node-pty
npm error gyp ERR! node -v v22.22.2
npm error gyp ERR! node-gyp -v v11.5.0
```

Prebuilds confirmation — `node-pty@1.1.0` ships no Linux artifact:

```
$ ls node_modules/node-pty/prebuilds/
darwin-arm64  darwin-x64  win32-arm64  win32-x64
# no linux-* directory
```

## Root Cause

`node-pty@1.1.0` declares an `install` hook of the form `node scripts/prebuild.js || node-gyp rebuild`. On Linux x64 there is no matching prebuild, so the fallback runs `node-gyp rebuild`, which fails because `make` is not on PATH (WSL2 default, no `build-essential`). npm/npx propagate the non-zero exit to the parent process but suppress install-script stderr — the failure surfaces as a zero-byte exit 1 with no diagnostic.

`node-pty` is listed as a regular `dependency` of `t3@0.0.22`, so this aborts the entire install rather than degrading gracefully. The one-line upstream fix is to move it to `optionalDependencies`.

## Upstream Issue

https://github.com/pingdotgg/t3code/issues/2621 — filed with reproduction, the smoking-gun excerpt above, and the `optionalDependencies` recommendation. The maintainers own the fix; this harness does not patch or fork t3code.

## Proof the CLI Itself Is Reachable

Bypassing the install hook proves the bug is the native dep, not the published bin:

```bash
mkdir -p /tmp/t3-extract && cd /tmp/t3-extract
npm install --ignore-scripts t3@0.0.22
node node_modules/t3/dist/bin.mjs --help
```

The `--help` output renders normally — the CLI entrypoint exists, parses argv, and prints its banner once `node-pty`'s broken install hook is skipped. The CLI is fine; the dependency packaging is not.
