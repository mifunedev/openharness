import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { shouldShip, type Manifest } from "./manifest.js";

export function assertDestInTarget(dest: string, targetOh: string, sep: string): void {
  if (dest === targetOh || dest.startsWith(targetOh + sep)) {
    return;
  }
  throw new Error("oh: refusing to write outside target .oh: " + dest);
}

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
  force?: boolean;
  dryRun?: boolean;
  skipExisting?: boolean;
}

export interface CopyResult {
  written: number;
  skipped: number;
}

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
