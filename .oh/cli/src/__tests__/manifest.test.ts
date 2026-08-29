import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { globToRegExp, shouldShip, loadManifest } from "../lib/manifest.js";
import { runUpdate } from "../commands/update.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";


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
      shouldShip("docs/rfcs/rfc-brain-hands-boundary.md", {
        include: ["cli/**", "README.md", "docs/**"],
        exclude: [],
      }),
    ).toBe(true);

    expect(
      shouldShip("patches/p.diff", {
        include: ["cli/**", "README.md", "docs/**"],
        exclude: [],
      }),
    ).toBe(false);
  });
});


describe("loadManifest", () => {
  it("present + valid → returns parsed {include, exclude, rootInclude}", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        include: ["cli/**"],
        exclude: ["**/dist/**"],
        rootInclude: ["crons/**"],
      }),
    );
    expect(loadManifest(dir)).toEqual({
      include: ["cli/**"],
      exclude: ["**/dist/**"],
      rootInclude: ["crons/**"],
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

  it("`include` present but no `exclude`/`rootInclude` → both default to []", () => {
    const dir = mkTmp();
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ include: ["cli/**", "README.md"] }),
    );
    expect(loadManifest(dir)).toEqual({
      include: ["cli/**", "README.md"],
      exclude: [],
      rootInclude: [],
    });
  });
});


describe("runUpdate — manifest payload filtering", () => {
  it("INTEGRATION: overlays allow-listed .oh files; root docs stay project-owned; patches/dist excluded", async () => {
    const base = mkTmp();
    const src = path.join(base, "src-checkout");
    const tgt = path.join(base, "target-repo");
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(tgt, { recursive: true });

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
    writeFile(src, "docs/site.md", "# source docs must not be vendored\n");
    writeFile(src, ".oh/patches/p.diff", "--- a\n+++ b\n");

    writeFile(
      tgt,
      ".oh/cli/package.json",
      JSON.stringify({ version: "0.1.0" }),
    );
    writeFile(tgt, ".devcontainer/.env", "SANDBOX_NAME=my-harness\n");
    writeFile(tgt, "docs/site.md", "# project docs must remain\n");

    const envBefore = fs.readFileSync(
      path.join(tgt, ".devcontainer/.env"),
      "utf8",
    );
    const docsBefore = fs.readFileSync(path.join(tgt, "docs/site.md"), "utf8");

    const { out, io } = mkIo();
    const rc = await runUpdate({ targetDir: tgt, fromDir: src }, io);

    expect(rc).toBe(0);

    expect(fs.existsSync(path.join(tgt, ".oh/cli/cli.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh/README.md"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh/manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh", "docs", "site.md"))).toBe(false);
    expect(fs.readFileSync(path.join(tgt, "docs/site.md"), "utf8")).toBe(
      docsBefore,
    );
    expect(fs.existsSync(path.join(tgt, ".oh/patches/p.diff"))).toBe(false);
    expect(fs.existsSync(path.join(tgt, ".oh/cli/dist/oh.js"))).toBe(false);

    expect(fs.readFileSync(path.join(tgt, ".devcontainer/.env"), "utf8")).toBe(
      envBefore,
    );

    expect(
      out.some((l) => l.includes("skip patches/p.diff (not in payload)")),
    ).toBe(true);
  });

  it("BACK-COMPAT: source with NO manifest.json overlays all of .oh/ in legacy mode", async () => {
    const base = mkTmp();
    const src = path.join(base, "src-checkout");
    const tgt = path.join(base, "target-repo");
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(tgt, { recursive: true });

    writeFile(
      src,
      ".oh/cli/package.json",
      JSON.stringify({ version: "9.9.9" }),
    );
    writeFile(src, ".oh/cli/cli.ts", "export const x = 1;\n");
    writeFile(src, ".oh/README.md", "# control plane\n");
    writeFile(src, path.join(".oh", "docs", "site.md"), "# docs site\n");
    writeFile(src, ".oh/patches/p.diff", "--- a\n+++ b\n");

    writeFile(
      tgt,
      ".oh/cli/package.json",
      JSON.stringify({ version: "0.1.0" }),
    );
    writeFile(tgt, ".devcontainer/.env", "SANDBOX_NAME=my-harness\n");

    const { out, io } = mkIo();
    const rc = await runUpdate({ targetDir: tgt, fromDir: src }, io);

    expect(rc).toBe(0);
    expect(fs.existsSync(path.join(tgt, ".oh", "docs", "site.md"))).toBe(true);
    expect(fs.existsSync(path.join(tgt, ".oh/patches/p.diff"))).toBe(true);
    expect(out.some((l) => l.includes("legacy mode"))).toBe(true);
  });
});
