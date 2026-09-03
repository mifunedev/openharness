import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runUpdate, assertDestInTarget } from "../commands/update.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";


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

function buildEquippedRepo(
  root: string,
  opts: {
    version: string;
    controlPlane?: Record<string, string>;
    project?: Record<string, string>;
  },
): void {
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
    ".devcontainer/.env": "SANDBOX_NAME=my-harness\n",
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


describe("runUpdate", () => {
  it("1. UPGRADE: newer source version overlays changed + new files (rc 0)", async () => {
    const from = mkTmp();
    const target = mkTmp();

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
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe(
      "#!/bin/sh\necho foo-NEW\n",
    );
    expect(fs.existsSync(path.join(target, ".oh/scripts/brand-new.sh"))).toBe(
      true,
    );
    expect(readFile(target, ".oh/scripts/brand-new.sh")).toBe(
      "#!/bin/sh\necho brand-new\n",
    );
  });

  it("2. PROJECT UNTOUCHED: nothing outside <target>/.oh/ is mutated or created", async () => {
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

    const envBefore = readFile(target, ".devcontainer/.env");
    const appBefore = readFile(target, "src/app.ts");
    const topBefore = fs.readdirSync(target).sort();
    const baseBefore = fs.readdirSync(base).sort();

    const { io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(0);

    expect(readFile(target, ".devcontainer/.env")).toBe(envBefore);
    expect(readFile(target, "src/app.ts")).toBe(appBefore);

    expect(fs.readdirSync(target).sort()).toEqual(topBefore);
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
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe("#!/bin/sh\necho SOURCE\n");
  });

  it("5. DOWNGRADE REFUSE: older source refused (rc 1, 'downgrade'); --force overrides; pre-release suffix treated equal", async () => {
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
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((l) => l.startsWith("[dry-run] "))).toBe(true);

      expect(readFile(target, ".oh/scripts/foo.sh")).toBe(overwriteBefore);
      expect(fs.existsSync(path.join(target, ".oh/scripts/brand-new.sh"))).toBe(
        false,
      );
    }

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
        ".oh/cli/node_modules/pkg/index.js": "module.exports = {};\n",
        ".oh/cli/dist/oh.js": "console.log('built');\n",
      },
    });
    buildEquippedRepo(target, { version: "0.1.0" });

    const { io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(0);

    expect(
      fs.existsSync(path.join(target, ".oh/cli/node_modules/pkg/index.js")),
    ).toBe(false);
    expect(fs.existsSync(path.join(target, ".oh/cli/dist/oh.js"))).toBe(false);
    expect(fs.existsSync(path.join(target, ".oh/scripts/foo.sh"))).toBe(true);
  });
});


describe("runUpdate — preconditions", () => {
  it("8a. missing source .oh/ → rc 1, 'update source not found'", async () => {
    const from = mkTmp();
    const target = mkTmp();
    buildEquippedRepo(target, { version: "0.1.0" });

    const { err, io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);
    expect(rc).toBe(1);
    expect(err.join("")).toContain("update source not found");
  });

  it("8b. BOOTSTRAP: an empty target is equipped from 0.0.0, and writes only the payload", async () => {
    const from = mkTmp();
    const target = mkTmp();
    buildEquippedRepo(from, { version: "0.6.0" });
    fs.writeFileSync(path.join(from, "AGENTS.md"), "# not payload\n");

    const { out, err, io } = mkIo();
    const rc = await runUpdate({ targetDir: target, fromDir: from }, io);

    expect(rc).toBe(0);
    expect(err.join("")).toBe("");
    expect(out.join("")).toContain("updating .oh: 0.0.0 -> 0.6.0");
    expect(readFile(target, ".oh/scripts/foo.sh")).toBe("#!/bin/sh\necho foo\n");
    expect(fs.readdirSync(target).sort()).toEqual([".oh"]);
  });

  it("8b2. BOOTSTRAP is idempotent: the second run reports up to date and writes nothing", async () => {
    const from = mkTmp();
    const target = mkTmp();
    buildEquippedRepo(from, { version: "0.6.0" });

    expect(await runUpdate({ targetDir: target, fromDir: from }, mkIo().io)).toBe(0);
    const before = fs.readFileSync(path.join(target, ".oh/scripts/foo.sh"), "utf8");

    const second = mkIo();
    expect(await runUpdate({ targetDir: target, fromDir: from }, second.io)).toBe(0);
    expect(second.out.join("")).toContain("already up to date (v0.6.0)");
    expect(second.out.join("")).not.toContain("create ");
    expect(fs.readFileSync(path.join(target, ".oh/scripts/foo.sh"), "utf8")).toBe(before);
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


describe("assertDestInTarget", () => {
  it("7. throws on escape outside target .oh, allows paths inside", () => {
    const someTarget = mkTmp();
    const targetOh = path.resolve(someTarget, ".oh");

    expect(() =>
      assertDestInTarget(
        path.resolve(targetOh, "../outside.ts"),
        targetOh,
        path.sep,
      ),
    ).toThrow("refusing to write outside target .oh");

    expect(() =>
      assertDestInTarget(path.join(targetOh, "cli/x.ts"), targetOh, path.sep),
    ).not.toThrow();

    expect(() =>
      assertDestInTarget(targetOh, targetOh, path.sep),
    ).not.toThrow();
  });
});
