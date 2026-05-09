# Silent `npx` install failure

`npx <pkg>` exits non-zero with empty stdout/stderr. The CLI never starts; the user has no signal. Almost always a native dependency whose `install` hook failed in a way npm/npx swallowed.

## Symptoms

- `npx <pkg> ...` exits with code `1` (or any non-zero) and produces zero bytes on stdout AND stderr.
- Repeating the command — even with `--yes` or after clearing the npx cache (`~/.npm/_npx`) — reproduces deterministically.
- Wrapping in `set -x` shows the parent `npx` invocation but no child diagnostic; the failure happens inside the dependency-install phase that npx runs before exec'ing the bin.

If you see *any* output, this recipe is the wrong one — read the output instead.

## Diagnose

Look in the npm debug log. npx writes the same logs npm does.

1. **Find the latest log.** Default location is `~/.npm/_logs/`; override with `npm config get logs-dir`. Logs are named `YYYY-MM-DDTHH_MM_SS_mmmZ-debug-0.log`.

   ```bash
   ls -t "$(npm config get logs-dir)"/*-debug-0.log | head -1
   ```

2. **Scan for a failing install hook.** The signature is the literal string `install { code: 1` (or any non-zero `code:`):

   ```bash
   grep -nE 'install \{ code: [1-9]' "$(ls -t "$(npm config get logs-dir)"/*-debug-0.log | head -1)"
   ```

   A typical hit looks like `info run <pkg>@<ver> install { code: 1, signal: null }`. The package name on that line is the one whose install hook failed.

3. **Read the surrounding context.** A few lines above the failure, npm logs the install command it ran (often `node scripts/prebuild.js || node-gyp rebuild` for native deps). A few lines below, `verbose exit 1` and `verbose code 1` confirm the failure propagated.

4. **Check for `node-gyp` / `make` failures separately.** `node-gyp rebuild` writes to its own stderr that npm captures but npx suppresses; running `npm install <pkg>` (not `npx`) in a scratch directory often surfaces `gyp ERR! stack Error: not found: make` or similar.

## Confirm

Bypass the install hook and run the CLI directly. If the bin works, the install hook is the only blocker:

```bash
mkdir -p /tmp/<pkg>-extract && cd /tmp/<pkg>-extract
npm install --ignore-scripts <pkg>
node node_modules/<pkg>/<path-to-bin>      # check the bin field of the package's package.json
```

The bin's `--help` (or whatever entrypoint) renders normally — the published artifact is fine. The failure is exclusively in the install-time native build.

You can also inspect what prebuilds the dep ships:

```bash
ls node_modules/<failing-dep>/prebuilds/
```

If your platform/arch (e.g. `linux-x64`) is absent, the install hook is forced down the source-build fallback path.

## Causes

In rough order of frequency:

1. **No matching prebuild.** The dep ships prebuilt binaries for some platforms (often `darwin-*` and `win32-*`) but not yours. The install hook falls through to compile from source.
2. **Missing build toolchain.** Source compilation needs `make`, `python`, a C/C++ compiler, etc. WSL2, minimal containers, and CI images often don't have `build-essential` or its equivalent.
3. **Mismatched Node ABI.** The shipped prebuild was compiled against a different Node major; the loader silently rejects it and the install hook errors.
4. **Permission or sandboxing.** Hooks that touch `/usr/local`, the system installer, or paths outside the project — common on hardened runners.
5. **Network blocked during install.** Some deps download a binary at install time; offline or proxied environments fail without a useful message.

In every case, npm/npx capture the failing process's stderr but **do not surface it** when the parent is `npx` rather than an interactive `npm install`. That's the bug-shaped surface this recipe exists to work around.

## Workarounds

Pick the lightest option that unblocks you, in order:

1. **Install the build toolchain.** On Debian/Ubuntu/WSL: `sudo apt-get install -y build-essential python3`. Re-run `npx <pkg>`. This fixes the majority of cases.
2. **Skip the failing hook.** If the failing dep is non-essential to the codepath you actually care about, install with `--ignore-scripts` and run the bin manually:

   ```bash
   npm install --ignore-scripts <pkg>
   node node_modules/<pkg>/<path-to-bin> ...
   ```

   Verify the affected feature still works — this is a workaround, not a fix.

3. **Pin a prior version.** Sometimes a recent release introduced the broken dep. `npx <pkg>@<earlier-version>` may work while you wait for a fix.
4. **File an upstream issue.** The right fix is usually to move the offending dep to `optionalDependencies` so install failure degrades gracefully instead of aborting. Include the smoking-gun excerpt from `Diagnose` step 2 — that's the diagnostic the maintainer needs.

What NOT to do: do not fork the upstream package, do not vendor its source into your project, and do not paper over with a wrapper script. Each adds maintenance you'll regret.

## Example

The canonical instance of this pattern in this harness: `npx t3@0.0.22` (https://github.com/pingdotgg/t3code) silently exits 1 on Linux because `node-pty@1.1.0` ships no Linux prebuild and `node-gyp rebuild` fails for lack of `make`. Full investigation: [`memory/t3-npx-silent-install.md`](../../memory/t3-npx-silent-install.md). Upstream issue: https://github.com/pingdotgg/t3code/issues/2621.
