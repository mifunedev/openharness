import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  copyOhPayload,
  assertDestInTarget,
  type CopyAction,
} from "../lib/vendor.js";
import { loadManifest } from "../lib/manifest.js";

let tmpdirs: string[] = [];

function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oh-vendor-"));
  tmpdirs.push(d);
  return d;
}

function write(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

beforeEach(() => {
  tmpdirs = [];
});

afterEach(() => {
  for (const d of tmpdirs) fs.rmSync(d, { recursive: true, force: true });
  tmpdirs = [];
});

describe("copyOhPayload — manifest filtering", () => {
  it("ships include-matched files, excludes not-in-payload + prunes node_modules/dist", () => {
    const from = mkTmp();
    write(
      from,
      "manifest.json",
      JSON.stringify({
        include: ["cli/**", "manifest.json"],
        exclude: ["**/node_modules/**", "**/dist/**"],
      }),
    );
    write(from, "cli/src/cli.ts", "x");
    write(from, "cli/node_modules/pkg/index.js", "y");
    write(from, "cli/dist/oh.js", "z");
    write(from, "docs/readme.md", "d"); // not in include

    const target = mkTmp();
    const targetOh = path.join(target, ".oh");
    const res = copyOhPayload(from, targetOh, loadManifest(from), {
      skipExisting: true,
    });

    expect(fs.existsSync(path.join(targetOh, "cli/src/cli.ts"))).toBe(true);
    expect(fs.existsSync(path.join(targetOh, "manifest.json"))).toBe(true);
    // Excluded / pruned / not-in-payload are absent.
    expect(fs.existsSync(path.join(targetOh, "cli/node_modules/pkg/index.js"))).toBe(false);
    expect(fs.existsSync(path.join(targetOh, "cli/dist/oh.js"))).toBe(false);
    expect(fs.existsSync(path.join(targetOh, "docs/readme.md"))).toBe(false);
    expect(res.written).toBe(2);
  });

  it("null manifest = legacy mode: ships all real files except pruned volatile dirs", () => {
    const from = mkTmp();
    write(from, "scripts/foo.sh", "x");
    write(from, "cli/node_modules/p/i.js", "y");
    write(from, "cli/dist/oh.js", "z");

    const target = mkTmp();
    const targetOh = path.join(target, ".oh");
    copyOhPayload(from, targetOh, null, {});

    expect(fs.existsSync(path.join(targetOh, "scripts/foo.sh"))).toBe(true);
    expect(fs.existsSync(path.join(targetOh, "cli/node_modules/p/i.js"))).toBe(false);
    expect(fs.existsSync(path.join(targetOh, "cli/dist/oh.js"))).toBe(false);
  });
});

describe("copyOhPayload — safety", () => {
  it("assertDestInTarget refuses paths outside target .oh, allows inside", () => {
    const targetOh = path.resolve(mkTmp(), ".oh");

    expect(() =>
      assertDestInTarget(path.resolve(targetOh, "../evil.ts"), targetOh, path.sep),
    ).toThrow("refusing to write outside target .oh");
    expect(() =>
      assertDestInTarget(path.join(targetOh, "cli/x.ts"), targetOh, path.sep),
    ).not.toThrow();
    expect(() => assertDestInTarget(targetOh, targetOh, path.sep)).not.toThrow();
  });

  it("symlinks in the source are skipped, never followed", () => {
    const from = mkTmp();
    write(from, "real.txt", "real");
    const outside = mkTmp();
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(from, "link.txt"));

    const target = mkTmp();
    const targetOh = path.join(target, ".oh");
    copyOhPayload(from, targetOh, null, {});

    expect(fs.existsSync(path.join(targetOh, "real.txt"))).toBe(true);
    expect(fs.existsSync(path.join(targetOh, "link.txt"))).toBe(false);
  });
});

describe("copyOhPayload — skipExisting vs force vs dryRun", () => {
  it("skipExisting leaves an existing dest untouched; force overwrites it", () => {
    const from = mkTmp();
    write(from, "manifest.json", JSON.stringify({ include: ["**"], exclude: [] }));
    write(from, "scripts/foo.sh", "SOURCE");

    const target = mkTmp();
    const targetOh = path.join(target, ".oh");
    write(targetOh, "scripts/foo.sh", "LOCAL"); // pre-existing local edit

    const manifest = loadManifest(from);

    copyOhPayload(from, targetOh, manifest, { skipExisting: true });
    expect(fs.readFileSync(path.join(targetOh, "scripts/foo.sh"), "utf8")).toBe("LOCAL");

    const b = copyOhPayload(from, targetOh, manifest, { skipExisting: true, force: true });
    expect(fs.readFileSync(path.join(targetOh, "scripts/foo.sh"), "utf8")).toBe("SOURCE");
    expect(b.written).toBeGreaterThan(0);
  });

  it("dryRun reports the plan but writes nothing", () => {
    const from = mkTmp();
    write(from, "manifest.json", JSON.stringify({ include: ["**"], exclude: [] }));
    write(from, "scripts/foo.sh", "x");

    const target = mkTmp();
    const targetOh = path.join(target, ".oh");

    const actions: string[] = [];
    const reporter = (a: CopyAction, rel: string): void => {
      actions.push(`${a} ${rel}`);
    };
    const res = copyOhPayload(
      from,
      targetOh,
      loadManifest(from),
      { dryRun: true, skipExisting: true },
      reporter,
    );

    expect(fs.existsSync(targetOh)).toBe(false);
    expect(res.written).toBeGreaterThan(0);
    expect(actions).toContain("create scripts/foo.sh");
  });
});
