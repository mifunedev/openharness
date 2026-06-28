import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { globToRegExp, shouldShip, loadManifest } from "../lib/manifest.js";
import { runUpdate } from "../commands/update.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

// Track every tmpdir created so afterEach can remove them all.
let tmpdirs: string[] = [];

function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oh-manifest-"));
  tmpdirs.push(d);
  return d;
}

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

interface IoCapture {
  out: string[];
  err: string[];
  io: { stdout: (s: string) => void; stderr: (s: string) => void };
}

function mkIo(): IoCapture {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    stdout: (s: string) => out.push(s),
    stderr: (s: string) => err.push(s),
  };
  return { out, err, io };
}

beforeEach(() => {
  tmpdirs = [];
});

afterEach(() => {
  for (const d of tmpdirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpdirs = [];
});

// ---------------------------------------------------------------------------
// globToRegExp — matcher semantics
// ---------------------------------------------------------------------------

describe("globToRegExp", () => {
  it("1. `cli/**` matches nested + shallow under cli/ but not siblings/prefix/bare", () => {
    const re = globToRegExp("cli/**");
    expect(re.test("cli/src/cli.ts")).toBe(true);
    expect(re.test("cli/x.ts")).toBe(true);
    expect(re.test("scripts/x.sh")).toBe(false);
    expect(re.test("clix")).toBe(false);
    expect(re.test("cli")).toBe(false);
  });

  it("2. exact literal (no wildcard) is an anchored full-path match", () => {
    const readme = globToRegExp("README.md");
    expect(readme.test("README.md")).toBe(true);
    expect(readme.test("cli/README.md")).toBe(false);

    const manifest = globToRegExp("manifest.json");
    expect(manifest.test("manifest.json")).toBe(true);
    expect(manifest.test("cli/manifest.json")).toBe(false);
    expect(manifest.test("manifestxjson")).toBe(false);
  });

  it("3. leading `**/` matches zero leading segments AND nested segments", () => {
    const re = globToRegExp("**/node_modules/**");
    expect(re.test("node_modules/x")).toBe(true);
    expect(re.test("cli/node_modules/pkg/i.js")).toBe(true);
  });

  it("4. single `*` is segment-bounded (does not cross `/`)", () => {
    const re = globToRegExp("cli/*.ts");
    expect(re.test("cli/a.ts")).toBe(true);
    expect(re.test("cli/sub/a.ts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldShip — include/exclude with exclude-wins
// ---------------------------------------------------------------------------

describe("shouldShip", () => {
  it("5. exclude wins over include; non-included paths are dropped", () => {
    expect(
      shouldShip("cli/dist/oh.js", {
        include: ["cli/**"],
        exclude: ["**/dist/**"],
      }),
    ).toBe(false);

    expect(
      shouldShip("cli/src/cli.ts", {
        include: ["cli/**"],
        exclude: ["**/dist/**"],
      }),
    ).toBe(true);

    expect(
      shouldShip("docs/intro.md", {
        include: ["cli/**", "README.md"],
        exclude: [],
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadManifest — parsing + the hollow-out guard
// ---------------------------------------------------------------------------

describe("loadManifest", () => {
  it("present + valid → returns parsed {include, exclude}", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ include: ["cli/**"], exclude: ["**/dist/**"] }),
    );
    expect(loadManifest(dir)).toEqual({
      include: ["cli/**"],
      exclude: ["**/dist/**"],
    });
  });

  it("absent manifest.json → null", () => {
    const dir = mkTmp();
    expect(loadManifest(dir)).toBeNull();
  });

  it("invalid JSON → null", () => {
    const dir = mkTmp();
    fs.writeFileSync(path.join(dir, "manifest.json"), "{ not json");
    expect(loadManifest(dir)).toBeNull();
  });

  it("present but no `include` array → null", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ exclude: ["**/dist/**"] }),
    );
    expect(loadManifest(dir)).toBeNull();
  });

  it("EMPTY `include: []` → null (the hollow-out guard)", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ include: [], exclude: ["**/dist/**"] }),
    );
    expect(loadManifest(dir)).toBeNull();
  });

  it("`include` present but no `exclude` → exclude defaults to []", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ include: ["cli/**", "README.md"] }),
    );
    expect(loadManifest(dir)).toEqual({
      include: ["cli/**", "README.md"],
      exclude: [],
    });
  });
});

// ---------------------------------------------------------------------------
// runUpdate — manifest-honoring integration (the headline contract)
// ---------------------------------------------------------------------------

describe("runUpdate — manifest payload filtering", () => {
  it("INTEGRATION: overlays only allow-listed payload; docs/patches/dist excluded; project untouched", async () => {
    // Use ONE dedicated base dir so the project-untouched assertion owns its parent.
    const base = mkTmp();
    const src = path.join(base, "src-checkout");
    const tgt = path.join(base, "target-repo");
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(tgt, { recursive: true });

    // Fake NEWER source checkout: version 9.9.9 + manifest + a mix of files.
    writeFile(
      src,
      ".oh/cli/package.json",
      JSON.stringify({ version: "9.9.9" }),
    );
    writeFile(
      src,
      ".oh/manifest.json",
      JSON.stringify({
        include: ["cli/**", "README.md", "manifest.json"],
        exclude: ["**/dist/**"],
      }),
    );
    writeFile(src, ".oh/cli/cli.ts", "export const x = 1;\n");
    writeFile(src, ".oh/cli/dist/oh.js", "console.log('built');\n");
    writeFile(src, ".oh/README.md", "# control plane\n");
    writeFile(src, ".oh/docs/site.md", "# docs site\n");
    writeFile(src, ".oh/patches/p.diff", "--- a\n+++ b\n");

    // Fake equipped target: older version + a PROJECT file outside .oh/.
    writeFile(
      tgt,
      ".oh/cli/package.json",
      JSON.stringify({ version: "0.1.0" }),
    );
    writeFile(tgt, "harness.yaml", "name: my-harness\n");

    const harnessBefore = fs.readFileSync(
      path.join(tgt, "harness.yaml"),
      "utf8",
    );

    const { out, io } = mkIo();
    const rc = await runUpdate({ targetDir: tgt, fromDir: src }, io);

    expect(rc).toBe(0);

    // Allow-listed payload landed.
    expect(fs.existsSync(path.join(tgt, ".oh/cli/cli.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh/README.md"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh/manifest.json"))).toBe(true);

    // docs/, patches/, and dist/ were NOT shipped.
    expect(fs.existsSync(path.join(tgt, ".oh/docs/site.md"))).toBe(false);
    expect(fs.existsSync(path.join(tgt, ".oh/patches/p.diff"))).toBe(false);
    expect(fs.existsSync(path.join(tgt, ".oh/cli/dist/oh.js"))).toBe(false);

    // Project file outside .oh/ is byte-identical (untouched).
    expect(fs.readFileSync(path.join(tgt, "harness.yaml"), "utf8")).toBe(
      harnessBefore,
    );

    // The skip line for a non-payload file is emitted.
    expect(
      out.some((l) => l.includes("skip docs/site.md (not in payload)")),
    ).toBe(true);
  });

  it("BACK-COMPAT: source with NO manifest.json overlays all of .oh/ in legacy mode", async () => {
    const base = mkTmp();
    const src = path.join(base, "src-checkout");
    const tgt = path.join(base, "target-repo");
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(tgt, { recursive: true });

    // Same fixture but WITHOUT a manifest.json in the source .oh/.
    writeFile(
      src,
      ".oh/cli/package.json",
      JSON.stringify({ version: "9.9.9" }),
    );
    writeFile(src, ".oh/cli/cli.ts", "export const x = 1;\n");
    writeFile(src, ".oh/README.md", "# control plane\n");
    writeFile(src, ".oh/docs/site.md", "# docs site\n");
    writeFile(src, ".oh/patches/p.diff", "--- a\n+++ b\n");

    writeFile(
      tgt,
      ".oh/cli/package.json",
      JSON.stringify({ version: "0.1.0" }),
    );
    writeFile(tgt, "harness.yaml", "name: my-harness\n");

    const { out, io } = mkIo();
    const rc = await runUpdate({ targetDir: tgt, fromDir: src }, io);

    expect(rc).toBe(0);
    // Overlay-all: docs/ IS created when there is no manifest.
    expect(fs.existsSync(path.join(tgt, ".oh/docs/site.md"))).toBe(true);
    // The legacy-mode warning is emitted.
    expect(out.some((l) => l.includes("legacy mode"))).toBe(true);
  });
});
