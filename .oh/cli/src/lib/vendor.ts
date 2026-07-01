import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { shouldShip, type Manifest } from "./manifest.js";

/**
 * Throws unless `dest` is `targetOh` itself or strictly inside it.
 * This is the path-escape safety invariant shared by `oh init` (vendor) and
 * `oh update` (overlay) — never weaken it. `commands/update.ts` re-exports this
 * so its existing import keeps working.
 */
export function assertDestInTarget(dest: string, targetOh: string, sep: string): void {
  if (dest === targetOh || dest.startsWith(targetOh + sep)) {
    return;
  }
  throw new Error("oh: refusing to write outside target .oh: " + dest);
}

/**
 * Recurse `dir` (anchored at `root`), pushing POSIX relpaths of every REAL file.
 *
 * Symlinks (file AND dir) are skipped via `lstatSync` and never followed, so a
 * malicious source `.oh/` symlink can never pull external content into the
 * target (the stricter invariant that `oh update` always enforced). The
 * volatile `node_modules/` and `dist/` directories are pruned during the walk —
 * they are never shipped, and pruning avoids descending into a
 * multi-thousand-file `node_modules` when vendoring a built checkout.
 */
function walkFiles(root: string, dir: string, acc: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.resolve(dir, entry.name);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) {
      continue;
    }
    if (st.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      walkFiles(root, abs, acc);
    } else if (st.isFile()) {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
}

export type CopyAction =
  | "create"
  | "overwrite"
  | "skip-exists"
  | "skip-volatile"
  | "skip-not-in-payload";

export type CopyReport = (action: CopyAction, rel: string) => void;

export interface CopyOptions {
  /** Overwrite existing destinations even when `skipExisting` is set. */
  force?: boolean;
  /** Report the plan but write nothing. */
  dryRun?: boolean;
  /** Leave an already-present destination untouched (reported `skip-exists`). */
  skipExisting?: boolean;
}

export interface CopyResult {
  written: number;
  skipped: number;
}

/**
 * Copy the manifest-shipped `.oh/` payload from `fromOh` into `targetOh`.
 * Shared by `oh init` (initial vendor) and `oh update` (overlay). Every
 * destination is guarded by `assertDestInTarget` so nothing is ever written
 * outside `targetOh`. A `null` manifest means legacy mode — ship everything the
 * walk yields (minus the pruned volatile dirs).
 *
 * `init` passes `skipExisting: !force` (non-destructive default); `update` omits
 * it (always overwrites). `dryRun` reports the plan and writes nothing.
 */
export function copyOhPayload(
  fromOh: string,
  targetOh: string,
  manifest: Manifest | null,
  opts: CopyOptions,
  report?: CopyReport,
): CopyResult {
  const force = opts.force === true;
  const dryRun = opts.dryRun === true;
  const skipExisting = opts.skipExisting === true;

  const relpaths: string[] = [];
  walkFiles(fromOh, fromOh, relpaths);
  relpaths.sort();

  let written = 0;
  let skipped = 0;

  for (const rel of relpaths) {
    const segments = rel.split("/");
    // Defense-in-depth: the walk already prunes node_modules/dist dirs, but a
    // stray volatile segment must never be shipped.
    if (segments.includes("node_modules") || segments.includes("dist")) {
      report?.("skip-volatile", rel);
      skipped++;
      continue;
    }
    if (manifest && !shouldShip(rel, manifest)) {
      report?.("skip-not-in-payload", rel);
      skipped++;
      continue;
    }

    const dest = path.join(targetOh, rel);
    assertDestInTarget(dest, targetOh, path.sep);

    const exists = existsSync(dest);
    if (exists && skipExisting && !force) {
      report?.("skip-exists", rel);
      skipped++;
      continue;
    }

    report?.(exists ? "overwrite" : "create", rel);
    written++;

    if (!dryRun) {
      const src = path.join(fromOh, rel);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }

  return { written, skipped };
}
