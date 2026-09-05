import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "oh-standard-skills-"));
  scratch.push(dir);
  for (const path of [".oh/skills", ".oh/hooks", ".claude/protected-paths.txt"]) {
    mkdirSync(resolve(dir, path, ".."), { recursive: true });
    cpSync(join(root, path), join(dir, path), { recursive: true });
  }
  return dir;
}

function link(dir: string, mode: string) {
  return spawnSync("bash", [join(root, ".oh/scripts/link-providers.sh"), mode], {
    cwd: dir, encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: dir, OH_PROJECT_ROOT: dir },
  });
}

describe("standard project skills", () => {
  it("creates, verifies and repairs a link to canonical skills", () => {
    const dir = fixture();
    const initialized = link(dir, "--init");
    expect(initialized.status, initialized.stderr).toBe(0);
    const path = join(dir, ".agents/skills");
    expect(readlinkSync(path)).toBe("../.oh/skills");
    expect(readFileSync(join(path, "git/SKILL.md"), "utf8")).toBe(readFileSync(join(root, ".oh/skills/git/SKILL.md"), "utf8"));
    expect(link(dir, "--check").status).toBe(0);
    rmSync(path);
    symlinkSync("../missing", path);
    expect(link(dir, "--check").status).toBe(1);
    expect(link(dir, "--init").status).toBe(0);
    expect(readlinkSync(path)).toBe("../.oh/skills");
    for (const retired of [".oh/agents", ".claude/agents", ".codex/agents", ".pi/agents"]) expect(existsSync(join(dir, retired))).toBe(false);
  });

  it("refuses a real-directory collision without losing user skills", () => {
    const dir = fixture();
    const path = join(dir, ".agents/skills");
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "keep.txt"), "user-owned");
    const result = link(dir, "--init");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exists and is not a symlink");
    expect(lstatSync(path).isDirectory()).toBe(true);
    expect(readFileSync(join(path, "keep.txt"), "utf8")).toBe("user-owned");
  });
});
