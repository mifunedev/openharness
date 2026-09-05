import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, symlinkSync, existsSync, rmSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve(".oh/scripts/link-providers.sh");
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "oh-hermes-link-"));
  roots.push(root);
  mkdirSync(join(root, ".oh/skills/git"), { recursive: true });
  writeFileSync(join(root, ".oh/skills/git/SKILL.md"), "canonical");
  return root;
}

function run(root: string, mode = "--init", env = {}) {
  return spawnSync("bash", [script, mode, "--hermes-only"], {
    cwd: tmpdir(), encoding: "utf8",
    env: { ...process.env, OH_PROJECT_ROOT: root, HERMES_HOME: join(root, ".hermes"), ...env },
  });
}

const slot = (root: string) => join(root, ".hermes/skills/openharness");

describe("Hermes-only additive linking", () => {
  it("requires integration without requiring Claude scaffolding", () => {
    const root = fixture();
    expect(run(root, "--check").status).toBe(1);
    expect(run(root).status).toBe(0);
    expect(readlinkSync(slot(root))).toBe("../../.oh/skills");
    expect(readFileSync(join(slot(root), "git/SKILL.md"), "utf8")).toBe("canonical");
    expect(run(root, "--check").status).toBe(0);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, ".agents"))).toBe(false);
  });

  it("leaves correct links and native content unchanged on repetition", () => {
    const root = fixture();
    mkdirSync(join(root, ".hermes/skills/native"), { recursive: true });
    writeFileSync(join(root, ".hermes/skills/native/SKILL.md"), "native");
    expect(run(root).status).toBe(0);
    const inode = lstatSync(slot(root)).ino;
    expect(run(root).status).toBe(0);
    expect(lstatSync(slot(root)).ino).toBe(inode);
    expect(readFileSync(join(root, ".hermes/skills/native/SKILL.md"), "utf8")).toBe("native");
  });

  it("normalizes an absolute link only to the same canonical pack", () => {
    const root = fixture();
    mkdirSync(join(root, ".hermes/skills"), { recursive: true });
    symlinkSync(join(root, ".oh/skills"), slot(root));
    expect(run(root).status).toBe(0);
    expect(readlinkSync(slot(root))).toBe("../../.oh/skills");
  });

  it.each(["foreign", "dangling", "file", "directory"])("preserves an occupied %s slot", kind => {
    const root = fixture();
    const other = fixture();
    mkdirSync(join(root, ".hermes/skills"), { recursive: true });
    if (kind === "file") writeFileSync(slot(root), "sentinel");
    else if (kind === "directory") mkdirSync(slot(root));
    else symlinkSync(kind === "foreign" ? other : join(other, "missing"), slot(root));
    const before = lstatSync(slot(root));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/preserve/);
    expect(lstatSync(slot(root)).ino).toBe(before.ino);
  });

  it.each([".hermes", ".hermes/skills"])("refuses a symlinked parent %s without external writes", parent => {
    const root = fixture();
    const other = fixture();
    if (parent.endsWith("skills")) mkdirSync(join(root, ".hermes"));
    symlinkSync(other, join(root, parent));
    expect(run(root).status).toBe(1);
    expect(existsSync(join(other, "openharness"))).toBe(false);
    expect(existsSync(join(other, "skills"))).toBe(false);
  });

  it("refuses a conflicting runtime home before creating directories", () => {
    const root = fixture();
    const other = fixture();
    expect(run(root, "--init", { HERMES_HOME: other }).status).toBe(1);
    expect(existsSync(join(root, ".hermes"))).toBe(false);
    expect(existsSync(join(other, "skills"))).toBe(false);
  });

  it("refuses an unset launch home before creating integration", () => {
    const root = fixture();
    const result = run(root, "--init", { HERMES_HOME: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("launch environment");
    expect(existsSync(join(root, ".hermes"))).toBe(false);
  });

  it("rejects relative homes whose destination changes with cwd", () => {
    const root = fixture();
    const result = run(root, "--init", { HERMES_HOME: ".hermes" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be absolute");
    expect(existsSync(join(root, ".hermes"))).toBe(false);
  });

  it("does not impose the image-global Hermes home on other worktrees", () => {
    const root = fixture();
    const files = [
      ".claude/protected-paths.txt", ".oh/skills/t3/references/sandbox-processes.md",
      ".oh/skills/wiki/references/schema.md", ".oh/skills/eval/run.sh",
      ".oh/hooks/deny-env-dump.sh", ".oh/hooks/deny-secret-paths.sh", ".oh/hooks/warn-devtcp.sh",
      ".oh/skills/cloudflared/scripts/run.sh", ".oh/skills/health-check/scripts/scope-preflight.sh",
      ".oh/skills/retro/scripts/validate-retro-report.sh", ".oh/skills/t3/scripts/t3-code.sh",
      "bin/hermes",
    ];
    for (const path of files) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), path === "bin/hermes" ? "#!/bin/sh\nexit 0\n" : "", { mode: 0o755 });
    }
    const result = spawnSync("bash", [script, "--init"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, OH_PROJECT_ROOT: root,
        HERMES_HOME: "/home/sandbox/harness/.hermes", CC_SAFETY_NET_STRICT: "" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readlinkSync(join(root, ".pi/skills"))).toBe("../.oh/skills");
    expect(readlinkSync(join(root, ".agents/skills"))).toBe("../.oh/skills");
    expect(existsSync(join(root, ".hermes"))).toBe(false);
  });

  it.each([
    { OH_HERMES_SMOKE: "", SANDBOX_NAME: "oh-hermes-test" },
    { OH_HERMES_SMOKE: "1", SANDBOX_NAME: "oh-sbx-live" },
  ])("refuses smoke without both disposable scope and opt-in: %s", env => {
    const result = spawnSync("bash", [resolve(".oh/scripts/hermes-install-smoke.sh")], {
      encoding: "utf8", env: { ...process.env, ...env },
    });
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("disposable oh-hermes-*");
  });
});
