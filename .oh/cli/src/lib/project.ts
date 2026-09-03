import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";


export function resolveProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    const marker = statSync(join(dir, ".oh"), { throwIfNoEntry: false });
    if (marker?.isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("not an OpenHarness-equipped repo — run `oh update` first");
    }
    dir = parent;
  }
}
