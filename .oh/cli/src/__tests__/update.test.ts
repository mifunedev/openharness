import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runUpdate, assertDestInTarget } from "../commands/update.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

// Track every tmpdir created so afterEach can remove them all.
let tmpdirs: string[] = [];

function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "oh-update-"));
  tmpdirs.push(d);
  return d;
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

function writeFile(root: string, rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function readFile(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Build a fake OpenHarness-equipped repo at `root`.
 * Creates an `.oh/` control plane (cli/package.json with `version`, plus a
 * couple of control-plane files) AND project files OUTSIDE `.oh/` used to
 * assert non-mutation. Everything is written by explicit writeFileSync —
 * nothing is read from the real repo `.oh/`.
 */
function buildEquippedRepo(
  root: string,
  opts: {
    version: string;
    controlPlane?: Record<string, string>;
    project?: Record<string, string>;
  },
): void {
  // The version package.json that gates the update.
  writeFile(
    root,
    ".oh/cli/package.json",
    JSON.stringify({ name: "oh", version: opts.version }, null, 2),
  );

  const control = opts.controlPlane ?? {
    ".oh/scripts/foo.sh": "#!/bin/sh\necho foo\n",
    ".oh/cli/src/cli.ts": "export const x = 1;\n",
  };
  for (const [rel, content] of Object.entries(control)) {
    writeFile(root, rel, content);
  }

  const project = opts.project ?? {
    "harness.yaml": "name: my-harness\n",
    "src/app.ts": "console.log('app');\n",
  };
  for (const [rel, content] of Object.entries(project)) {
    writeFile(root, rel, content);
  }
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
// runUpdate — behavior contract
// ---------------------------------------------------------------------------

describe("runUpdate", () => {
  it("1. UPGRADE: newer source version overlays changed + new files (rc 0)", async () => {
    const from = mkTmp();
    const target = mkTmp();

    // Source is newer (0.2.0) and carries a CHANGED control-plane file plus a NEW file.
    buildEquippedRepo(from, {
      version: "0.2.0",
      controlPlane: {
        ".oh/scripts/foo.sh": "#!/bin/sh\necho foo-NEW\n",
        ".oh/cli/src/cli.ts": "export const x = 1;\n",
        ".oh/scripts/brand-new.sh": "#!/bin/sh\necho brand-new\n",
      },
    });
    buildEquippedRepo(target, {
      version: "0.1.0",
      controlPlane: {
        ".oh/scripts/foo.sh": "#!/bin/sh\necho foo-OLD\n",
        ".oh/cli/src/cli.ts": "export const x = 1;\n",
      },
    });

    const { io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);

    expect(rc).toBe(0);
    // Changed file now matches source content.
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe(
      "#!/bin/sh\necho foo-NEW\n",
    );
    // New file now exists with source content.
    expect(fs.existsSync(path.join(target, ".oh/scripts/brand-new.sh"))).toBe(
      true,
    );
    expect(readFile(target, ".oh/scripts/brand-new.sh")).toBe(
      "#!/bin/sh\necho brand-new\n",
    );
  });

  it("2. PROJECT UNTOUCHED: nothing outside <target>/.oh/ is mutated or created", async () => {
    // Put `from` and `target` under ONE dedicated base dir so the "nothing
    // created outside <target>/.oh/" backstop can assert on a parent we own —
    // os.tmpdir() itself is a shared namespace concurrent vitest workers write
    // to, so snapshotting it would be flaky.
    const base = mkTmp();
    const from = path.join(base, "from");
    const target = path.join(base, "target");
    fs.mkdirSync(from);
    fs.mkdirSync(target);

    buildEquippedRepo(from, {
      version: "0.2.0",
      controlPlane: {
        ".oh/scripts/foo.sh": "#!/bin/sh\necho foo-NEW\n",
        ".oh/scripts/brand-new.sh": "#!/bin/sh\necho brand-new\n",
      },
    });
    buildEquippedRepo(target, {
      version: "0.1.0",
      controlPlane: {
        ".oh/scripts/foo.sh": "#!/bin/sh\necho foo-OLD\n",
      },
    });

    // Capture project files + top-level dir listing before.
    const harnessBefore = readFile(target, "harness.yaml");
    const appBefore = readFile(target, "src/app.ts");
    const topBefore = fs.readdirSync(target).sort();
    // Snapshot the dedicated base dir (parent of <target>) so we can prove
    // nothing new appears alongside <target> — runUpdate writes ONLY under
    // <target>/.oh/, so `base` must still list exactly [from, target].
    const baseBefore = fs.readdirSync(base).sort();

    const { io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(0);

    // Project files byte-identical.
    expect(readFile(target, "harness.yaml")).toBe(harnessBefore);
    expect(readFile(target, "src/app.ts")).toBe(appBefore);

    // No NEW top-level entry in <target> (only .oh/ contents should change).
    expect(fs.readdirSync(target).sort()).toEqual(topBefore);
    // No new entries alongside <target> in the dedicated base dir.
    expect(fs.readdirSync(base).sort()).toEqual(baseBefore);
  });

  it("3. EQUAL NO-OP: equal versions, no force → rc 0, 'already up to date', no writes", async () => {
    const from = mkTmp();
    const target = mkTmp();

    buildEquippedRepo(from, {
      version: "0.1.0",
      controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho from\n" },
    });
    buildEquippedRepo(target, {
      version: "0.1.0",
      controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho target\n" },
    });

    const ctlBefore = readFile(target, ".oh/scripts/foo.sh");
    const mtimeBefore = fs.statSync(
      path.join(target, ".oh/scripts/foo.sh"),
    ).mtimeMs;

    const { out, io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);

    expect(rc).toBe(0);
    expect(out.join("")).toContain("already up to date");
    // No target file changed (content + mtime unchanged).
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe(ctlBefore);
    expect(fs.statSync(path.join(target, ".oh/scripts/foo.sh")).mtimeMs).toBe(
      mtimeBefore,
    );
  });

  it("4. FORCE: --force re-overlays even on equal versions", async () => {
    const from = mkTmp();
    const target = mkTmp();

    buildEquippedRepo(from, {
      version: "0.1.0",
      controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho SOURCE\n" },
    });
    buildEquippedRepo(target, {
      version: "0.1.0",
      controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho LOCAL-EDIT\n" },
    });

    const opts = { targetDir: target, fromDir: from };
    const { io } = mkIo();
    const rc = await runUpdate({ ...opts, force: true }, io);

    expect(rc).toBe(0);
    // Force overlay overwrote the local edit back to source content.
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe("#!/bin/sh\necho SOURCE\n");
  });

  it("5. DOWNGRADE REFUSE: older source refused (rc 1, 'downgrade'); --force overrides; pre-release suffix treated equal", async () => {
    // (a) downgrade refused.
    {
      const from = mkTmp();
      const target = mkTmp();
      buildEquippedRepo(from, { version: "0.1.0" });
      buildEquippedRepo(target, { version: "0.2.0" });

      const { err, io } = mkIo();
      const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
      expect(rc).toBe(1);
      expect(err.join("")).toContain("downgrade");
    }

    // (b) downgrade with --force succeeds.
    {
      const from = mkTmp();
      const target = mkTmp();
      buildEquippedRepo(from, { version: "0.1.0" });
      buildEquippedRepo(target, { version: "0.2.0" });

      const { io } = mkIo();
      const rc = await runUpdate(
        { targetDir: target, fromDir: from, force: true },
        io,
      );
      expect(rc).toBe(0);
    }

    // (c) pre-release suffix-strip: 0.1.0 (source) vs 0.1.0-dev (target) are EQUAL → no-op.
    // A naive parseInt would mis-rank these; the suffix must be stripped per segment.
    {
      const from = mkTmp();
      const target = mkTmp();
      buildEquippedRepo(from, { version: "0.1.0" });
      buildEquippedRepo(target, { version: "0.1.0-dev" });

      const { out, io } = mkIo();
      const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
      expect(rc).toBe(0);
      expect(out.join("")).toContain("already up to date");
    }
  });

  it("6. DRY-RUN: every line prefixed [dry-run], no writes (even with force on a downgrade)", async () => {
    // (a) upgrade dry-run: rc 0, all lines prefixed, target unchanged on disk.
    {
      const from = mkTmp();
      const target = mkTmp();
      buildEquippedRepo(from, {
        version: "0.2.0",
        controlPlane: {
          ".oh/scripts/foo.sh": "#!/bin/sh\necho from\n",
          ".oh/scripts/brand-new.sh": "#!/bin/sh\necho brand-new\n",
        },
      });
      buildEquippedRepo(target, {
        version: "0.1.0",
        controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho target\n" },
      });

      const overwriteBefore = readFile(target, ".oh/scripts/foo.sh");

      const { out, io } = mkIo();
      const rc = await runUpdate(
        { targetDir: target, fromDir: from, dryRun: true },
        io,
      );

      expect(rc).toBe(0);
      // Each pushed string is one line; every one must carry the prefix.
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((l) => l.startsWith("[dry-run] "))).toBe(true);

      // A file that would be overwritten still has its OLD content.
      expect(readFile(target, ".oh/scripts/foo.sh")).toBe(overwriteBefore);
      // A file that would be created does NOT exist.
      expect(fs.existsSync(path.join(target, ".oh/scripts/brand-new.sh"))).toBe(
        false,
      );
    }

    // (b) force + dryRun on a DOWNGRADE: writes NOTHING, rc 0.
    {
      const from = mkTmp();
      const target = mkTmp();
      buildEquippedRepo(from, {
        version: "0.1.0",
        controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho from\n" },
      });
      buildEquippedRepo(target, {
        version: "0.2.0",
        controlPlane: { ".oh/scripts/foo.sh": "#!/bin/sh\necho target\n" },
      });

      const before = readFile(target, ".oh/scripts/foo.sh");

      const { io } = mkIo();
      const rc = await runUpdate(
        { targetDir: target, fromDir: from, force: true, dryRun: true },
        io,
      );

      expect(rc).toBe(0);
      // Target untouched despite force, because dryRun suppresses writes.
      expect(readFile(target, ".oh/scripts/foo.sh")).toBe(before);
    }
  });

  it("9. VOLATILE SKIP: nested node_modules/ and dist/ segments are not copied", async () => {
    const from = mkTmp();
    const target = mkTmp();

    buildEquippedRepo(from, {
      version: "0.2.0",
      controlPlane: {
        ".oh/scripts/foo.sh": "#!/bin/sh\necho from\n",
        // Nested volatile segments (NOT top-level) — proves per-segment skip.
        ".oh/cli/node_modules/pkg/index.js": "module.exports = {};\n",
        ".oh/cli/dist/oh.js": "console.log('built');\n",
      },
    });
    buildEquippedRepo(target, { version: "0.1.0" });

    const { io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(0);

    // Neither volatile path was copied into the target .oh/.
    expect(
      fs.existsSync(path.join(target, ".oh/cli/node_modules/pkg/index.js")),
    ).toBe(false);
    expect(fs.existsSync(path.join(target, ".oh/cli/dist/oh.js"))).toBe(false);
    // A normal control-plane file still copied.
    expect(fs.existsSync(path.join(target, ".oh/scripts/foo.sh"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runUpdate — preconditions
// ---------------------------------------------------------------------------

describe("runUpdate — preconditions", () => {
  it("8a. missing source .oh/ → rc 1, 'update source not found'", async () => {
    // fromDir has no .oh/ at all.
    const from = mkTmp();
    const target = mkTmp();
    buildEquippedRepo(target, { version: "0.1.0" });

    const { err, io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(1);
    expect(err.join("")).toContain("update source not found");
  });

  it("8b. target has no .oh/ → rc 1, 'not an OpenHarness-equipped repo'", async () => {
    const from = mkTmp();
    const target = mkTmp();
    buildEquippedRepo(from, { version: "0.1.0" });
    // target is just an empty dir (no .oh/).

    const { err, io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(1);
    expect(err.join("")).toContain("not an OpenHarness-equipped repo");
  });

  it("8c. source and target are the same .oh → rc 1, 'same .oh'", async () => {
    const root = mkTmp();
    buildEquippedRepo(root, { version: "0.1.0" });

    const { err, io } = mkIo();
    const rc = await runUpdate({ targetDir: root, fromDir: root }, io);
    expect(rc).toBe(1);
    expect(err.join("")).toContain("same .oh");
  });
});

// ---------------------------------------------------------------------------
// assertDestInTarget — exported path-escape guard
// ---------------------------------------------------------------------------

describe("assertDestInTarget", () => {
  it("7. throws on escape outside target .oh, allows paths inside", () => {
    const someTarget = mkTmp();
    const targetOh = path.resolve(someTarget, ".oh");

    // Escaping the target .oh/ must throw.
    expect(() =>
      assertDestInTarget(
        path.resolve(targetOh, "../outside.ts"),
        targetOh,
        path.sep,
      ),
    ).toThrow("refusing to write outside target .oh");

    // A path properly nested inside target .oh/ must NOT throw.
    expect(() =>
      assertDestInTarget(path.join(targetOh, "cli/x.ts"), targetOh, path.sep),
    ).not.toThrow();

    // The target .oh/ itself must NOT throw (dest === targetOh).
    expect(() =>
      assertDestInTarget(targetOh, targetOh, path.sep),
    ).not.toThrow();
  });
});
