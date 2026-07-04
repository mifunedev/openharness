import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Equipped-project-root resolution (issue #564).
 *
 * The lifecycle verbs (`oh sandbox` / `oh shell` / `oh gateway`) all operate on
 * an `oh init`-equipped repo and must work from any subdirectory of it, so they
 * share this one resolver: walk up from the starting directory to the first
 * ancestor containing a `.oh/` directory.
 */

/**
 * Walk up from `startDir` (default: cwd) to the first directory containing a
 * `.oh/` directory and return that directory — the equipped project root.
 *
 * Throws a plain `Error` (no `oh:` prefix — cli.ts's main() adds it and maps
 * thrown errors to exit code 2) when no ancestor is equipped.
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    // `.oh` must be a directory — a stray file of that name does not equip a repo.
    const marker = statSync(join(dir, ".oh"), { throwIfNoEntry: false });
    if (marker?.isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("not an OpenHarness-equipped repo — run `oh init` first");
    }
    dir = parent;
  }
}
