import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runInit, type InitOptions, type InitIO } from "../commands/init.js";

// THREE levels up from src/__tests__/ to reach .oh/, then into templates.
// (Two levels would wrongly resolve .oh/cli/templates.)
const TEMPLATES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates",
);

function makeIO(): { io: InitIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: InitIO = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  };
  return { io, out, err };
}

function opts(targetDir: string, extra: Partial<InitOptions> = {}): InitOptions {
  return { targetDir, templatesDir: TEMPLATES, ...extra };
}

const cleanups: string[] = [];

function freshTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "oh-init-"));
  cleanups.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("runInit", () => {
  it("create-from-empty: scaffolds all template files into a fresh dir", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();

    const code = await runInit(opts(t), io);

    expect(code).toBe(0);
    expect(existsSync(join(t, "harness.yaml"))).toBe(true);
    expect(existsSync(join(t, ".devcontainer/devcontainer.json"))).toBe(true);
    expect(existsSync(join(t, ".devcontainer/.example.env"))).toBe(true);
    expect(existsSync(join(t, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(t, ".gitignore"))).toBe(true);
    // The top-level README.md must NOT be copied.
    expect(existsSync(join(t, "README.md"))).toBe(false);
    expect(out.some((l) => l.includes("create harness.yaml"))).toBe(true);
  });

  it("skip-without-force: a second run skips existing files and changes nothing", async () => {
    const t = freshTmp();
    const first = makeIO();
    expect(await runInit(opts(t), first.io)).toBe(0);

    const before = readFileSync(join(t, "AGENTS.md"), "utf8");
    const giBefore = readFileSync(join(t, ".gitignore"), "utf8");

    const second = makeIO();
    const code = await runInit(opts(t), second.io);

    expect(code).toBe(0);
    // Every per-file action is a skip (gitignore reports its own skip phrasing).
    for (const line of second.out) {
      const trimmed = line.trim();
      expect(trimmed.startsWith("skip ")).toBe(true);
    }
    expect(
      second.out.some((l) => l.includes("skip .gitignore (no new entries)")),
    ).toBe(true);
    expect(readFileSync(join(t, "AGENTS.md"), "utf8")).toBe(before);
    expect(readFileSync(join(t, ".gitignore"), "utf8")).toBe(giBefore);
  });

  it("overwrite-with-force: replaces an existing file with the template content", async () => {
    const t = freshTmp();
    const first = makeIO();
    expect(await runInit(opts(t), first.io)).toBe(0);

    const template = readFileSync(join(TEMPLATES, "AGENTS.md"), "utf8");
    writeFileSync(join(t, "AGENTS.md"), "SENTINEL — should be overwritten\n");

    const { io, out } = makeIO();
    const code = await runInit(opts(t, { force: true }), io);

    expect(code).toBe(0);
    expect(out.some((l) => l.includes("overwrite AGENTS.md"))).toBe(true);
    expect(readFileSync(join(t, "AGENTS.md"), "utf8")).toBe(template);
  });

  it("dry-run-writes-nothing: reports with [dry-run] prefix, creates no files", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();

    const code = await runInit(opts(t, { dryRun: true }), io);

    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) {
      expect(line.startsWith("[dry-run] ")).toBe(true);
    }
    expect(existsSync(join(t, "harness.yaml"))).toBe(false);
    expect(existsSync(join(t, ".devcontainer/devcontainer.json"))).toBe(false);
    expect(existsSync(join(t, ".gitignore"))).toBe(false);
    expect(existsSync(join(t, "AGENTS.md"))).toBe(false);
  });

  it("dry-run missing targetDir does NOT create it", async () => {
    const parent = freshTmp();
    const missing = join(parent, "does-not-exist-yet");
    expect(existsSync(missing)).toBe(false);

    const { io } = makeIO();
    const code = await runInit(opts(missing, { dryRun: true }), io);

    expect(code).toBe(0);
    expect(existsSync(missing)).toBe(false);
  });

  it(".gitignore append idempotency: two real runs produce byte-identical output", async () => {
    const t = freshTmp();
    const first = makeIO();
    expect(await runInit(opts(t), first.io)).toBe(0);
    const afterFirst = readFileSync(join(t, ".gitignore"), "utf8");

    const second = makeIO();
    expect(await runInit(opts(t), second.io)).toBe(0);
    const afterSecond = readFileSync(join(t, ".gitignore"), "utf8");

    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond.endsWith("\n")).toBe(true);

    // No duplicate non-empty lines.
    const lines = afterSecond.split("\n").filter((l) => l.trim() !== "");
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("partial-existing .gitignore: appends only the missing entries", async () => {
    const t = freshTmp();
    // Pre-seed with one of the template's entries.
    writeFileSync(join(t, ".gitignore"), ".devcontainer/.env\n");

    const templateLines = readFileSync(join(TEMPLATES, "gitignore"), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    const missingCount = templateLines.filter(
      (l) => l.trimEnd() !== ".devcontainer/.env",
    ).length;

    const { io, out } = makeIO();
    const code = await runInit(opts(t), io);

    expect(code).toBe(0);
    expect(
      out.some((l) => l.includes(`update .gitignore (+${missingCount})`)),
    ).toBe(true);

    const result = readFileSync(join(t, ".gitignore"), "utf8");
    const resultLines = result.split("\n").filter((l) => l.trim() !== "");
    // All template entries present, exactly once each, no dupes.
    expect(new Set(resultLines).size).toBe(resultLines.length);
    for (const l of templateLines) {
      expect(resultLines).toContain(l.trimEnd());
    }
  });

  it("empty-payload no-op: a templatesDir with only README.md writes nothing", async () => {
    const t = freshTmp();
    const onlyReadme = freshTmp();
    writeFileSync(join(onlyReadme, "README.md"), "# nothing to scaffold\n");

    const { io } = makeIO();
    const code = await runInit(
      { targetDir: t, templatesDir: onlyReadme },
      io,
    );

    expect(code).toBe(0);
    // Target stays empty: no scaffolded files.
    expect(existsSync(join(t, ".gitignore"))).toBe(false);
    expect(existsSync(join(t, "README.md"))).toBe(false);
    expect(statSync(t).isDirectory()).toBe(true);
  });

  it("precondition: target is a file → exit 1, nothing written", async () => {
    const parent = freshTmp();
    const filePath = join(parent, "iam-a-file");
    writeFileSync(filePath, "not a dir\n");

    const { io, err } = makeIO();
    const code = await runInit(opts(filePath), io);

    expect(code).toBe(1);
    expect(err.join("")).not.toBe("");
    // No scaffolding occurred next to the file.
    expect(existsSync(join(parent, ".gitignore"))).toBe(false);
  });

  it("contextual error when templatesDir absent: exit 1, stderr names path + --templates", async () => {
    const t = freshTmp();
    const bogus = join(t, "no-such-templates-dir");

    const { io, err } = makeIO();
    const code = await runInit(
      { targetDir: t, templatesDir: bogus },
      io,
    );

    expect(code).toBe(1);
    const msg = err.join("");
    expect(msg).toContain(resolve(bogus));
    expect(msg).toContain("--templates");
  });

  it("devcontainer.json parses with the expected workspaceFolder", async () => {
    const t = freshTmp();
    const { io } = makeIO();
    expect(await runInit(opts(t), io)).toBe(0);

    const parsed = JSON.parse(
      readFileSync(join(t, ".devcontainer/devcontainer.json"), "utf8"),
    );
    expect(parsed.workspaceFolder).toBe("/home/sandbox/project");
  });
});
