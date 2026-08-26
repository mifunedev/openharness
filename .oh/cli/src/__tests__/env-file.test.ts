import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInRoot,
  envFilePath,
  installEnvKey,
  isInstallFlagEnabled,
  readEnvValue,
  seedEnvFile,
  setEnvValue,
  setInstallFlag,
  setKeyInEnv,
} from "../lib/env-file.js";


const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const REAL_EXAMPLE = join(REPO_ROOT, ".devcontainer", ".example.env");
const REAL_MIGRATOR = join(REPO_ROOT, ".oh", "scripts", "migrate-harness-yaml.sh");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeRepo(withEnv = true): string {
  const d = mkdtempSync(join(tmpdir(), "oh-env-file-"));
  cleanups.push(d);
  mkdirSync(join(d, ".devcontainer"), { recursive: true });
  copyFileSync(REAL_EXAMPLE, join(d, ".devcontainer", ".example.env"));
  if (withEnv) copyFileSync(REAL_EXAMPLE, join(d, ".devcontainer", ".env"));
  return d;
}

const readEnv = (root: string): string => readFileSync(envFilePath(root), "utf8");


describe("setKeyInEnv", () => {
  it("uncomments a template line IN PLACE, keeping the line count and the prose", () => {
    const before = [
      "# ─── Sandbox identity ───",
      "# SANDBOX_NAME=openharness              # container + compose project name",
      "# TZ=America/Los_Angeles",
      "",
    ].join("\n");

    const { content, outcome } = setKeyInEnv(before, "SANDBOX_NAME", "mine");

    expect(outcome).toBe("uncommented");
    expect(content.split("\n")).toHaveLength(before.split("\n").length);
    expect(content.split("\n")[1]).toBe("SANDBOX_NAME=mine");
    expect(content.split("\n")[0]).toBe("# ─── Sandbox identity ───");
    expect(content.split("\n")[2]).toBe("# TZ=America/Los_Angeles");
  });

  it("rewrites a live key's value without appending a duplicate", () => {
    const { content, outcome } = setKeyInEnv("A=1\nSANDBOX_NAME=old\nB=2\n", "SANDBOX_NAME", "new");
    expect(outcome).toBe("updated");
    expect(content).toBe("A=1\nSANDBOX_NAME=new\nB=2\n");
  });

  it("is idempotent — an already-correct key is left byte-identical", () => {
    const before = "SANDBOX_NAME=same\n";
    const { content, outcome } = setKeyInEnv(before, "SANDBOX_NAME", "same");
    expect(outcome).toBe("already-set");
    expect(content).toBe(before);
  });

  it("appends a key named nowhere, keeping exactly one trailing newline", () => {
    const { content, outcome } = setKeyInEnv("A=1\n", "BRAND_NEW", "x");
    expect(outcome).toBe("added");
    expect(content).toBe("A=1\nBRAND_NEW=x\n");
  });

  it("appends to empty content without a leading blank line", () => {
    expect(setKeyInEnv("", "A", "1").content).toBe("A=1\n");
  });

  it("prefers a LIVE key over a commented one — a live line is the standing choice", () => {
    const before = "# SANDBOX_NAME=commented\nSANDBOX_NAME=live\n";
    const { content, outcome } = setKeyInEnv(before, "SANDBOX_NAME", "next");
    expect(outcome).toBe("updated");
    expect(content).toBe("# SANDBOX_NAME=commented\nSANDBOX_NAME=next\n");
  });

  it("does not confuse a key with one that has it as a prefix", () => {
    const before = "SANDBOX_NAME_EXTRA=untouched\n# SANDBOX_NAME=x\n";
    const { content } = setKeyInEnv(before, "SANDBOX_NAME", "mine");
    expect(content).toBe("SANDBOX_NAME_EXTRA=untouched\nSANDBOX_NAME=mine\n");
  });

  it("keeps a `#` inside a value — in env-file format that is data, not a comment", () => {
    const { content } = setKeyInEnv("", "SANDBOX_PASSWORD", "p#ss");
    expect(content).toBe("SANDBOX_PASSWORD=p#ss\n");
    expect(setKeyInEnv(content, "SANDBOX_PASSWORD", "p#ss").outcome).toBe("already-set");
  });
});


describe("readEnvValue", () => {
  it("reads a live key and treats a commented one as unset", () => {
    const root = makeRepo(false);
    writeFileSync(
      envFilePath(root),
      "SANDBOX_NAME=live\n# TZ=America/Denver\n",
    );
    expect(readEnvValue(root, "SANDBOX_NAME")).toBe("live");
    expect(readEnvValue(root, "TZ")).toBeUndefined();
  });

  it("treats an empty value as unset, so a bare `KEY=` never wins a fallback", () => {
    const root = makeRepo(false);
    writeFileSync(envFilePath(root), "GH_TOKEN=\n");
    expect(readEnvValue(root, "GH_TOKEN")).toBeUndefined();
  });

  it("strips the enclosing quotes compose also strips", () => {
    const root = makeRepo(false);
    writeFileSync(envFilePath(root), "GIT_USER_NAME='Ada Lovelace'\n");
    expect(readEnvValue(root, "GIT_USER_NAME")).toBe("Ada Lovelace");
  });

  it("returns undefined when the file does not exist at all", () => {
    expect(readEnvValue(makeRepo(false), "SANDBOX_NAME")).toBeUndefined();
  });

  it("is anchored to the ROOT, never the process CWD", () => {
    const root = makeRepo(false);
    writeFileSync(envFilePath(root), "SANDBOX_NAME=anchored\n");
    const nested = join(root, "pkg", "web");
    mkdirSync(nested, { recursive: true });
    const cwd = process.cwd();
    try {
      process.chdir(nested);
      expect(readEnvValue(root, "SANDBOX_NAME")).toBe("anchored");
    } finally {
      process.chdir(cwd);
    }
  });
});


describe("seedEnvFile", () => {
  it("copies the template when .env is missing, and reports that it wrote", () => {
    const root = makeRepo(false);
    expect(seedEnvFile(root)).toBe(true);
    expect(readEnv(root)).toBe(readFileSync(REAL_EXAMPLE, "utf8"));
  });

  it("never overwrites an existing .env, and reports that it did nothing", () => {
    const root = makeRepo(false);
    writeFileSync(envFilePath(root), "MINE=1\n");
    expect(seedEnvFile(root)).toBe(false);
    expect(readEnv(root)).toBe("MINE=1\n");
  });

  it("is a no-op when there is no template to copy from", () => {
    const d = mkdtempSync(join(tmpdir(), "oh-env-file-bare-"));
    cleanups.push(d);
    mkdirSync(join(d, ".devcontainer"), { recursive: true });
    expect(seedEnvFile(d)).toBe(false);
  });
});

describe("setInstallFlag", () => {
  it("maps an install key to its INSTALL_* env var", () => {
    expect(installEnvKey("opencode")).toBe("INSTALL_OPENCODE");
    expect(installEnvKey("grok_build")).toBe("INSTALL_GROK_BUILD");
    expect(installEnvKey("agent_browser")).toBe("INSTALL_AGENT_BROWSER");
  });

  it("uncomments the real template's key in place and reads back as enabled", () => {
    const root = makeRepo();
    expect(isInstallFlagEnabled(root, "hermes")).toBe(false);

    const before = readEnv(root).split("\n").length;
    expect(setInstallFlag(root, "hermes")).toBe("uncommented");

    expect(readEnv(root).split("\n")).toHaveLength(before);
    expect(readEnv(root)).toMatch(/^INSTALL_HERMES=true$/m);
    expect(isInstallFlagEnabled(root, "hermes")).toBe(true);
  });

  it("is idempotent — a second call writes nothing", () => {
    const root = makeRepo();
    setInstallFlag(root, "opencode");
    const after = readEnv(root);
    expect(setInstallFlag(root, "opencode")).toBe("already-set");
    expect(readEnv(root)).toBe(after);
  });

  it("seeds the file first when .env does not exist yet", () => {
    const root = makeRepo(false);
    expect(setInstallFlag(root, "hermes")).toBe("uncommented");
    expect(readEnv(root)).toContain("Open Harness");
    expect(readEnv(root)).toMatch(/^INSTALL_HERMES=true$/m);
  });
});

describe("assertInRoot", () => {
  it("accepts the root itself and paths inside it", () => {
    expect(() => assertInRoot("/repo", "/repo")).not.toThrow();
    expect(() => assertInRoot("/repo/.devcontainer/.env", "/repo")).not.toThrow();
  });

  it("refuses an escape, including a sibling with the root as a string prefix", () => {
    expect(() => assertInRoot("/etc/passwd", "/repo")).toThrow(/outside the project root/);
    expect(() => assertInRoot("/repo-evil/.env", "/repo")).toThrow(/outside the project root/);
  });
});


describe("round trip with the vendored shell writer", () => {
  it("the migrator's awk writer and setEnvValue produce the same file", () => {
    const viaTs = makeRepo();
    setEnvValue(viaTs, "SANDBOX_NAME", "roundtrip");
    setEnvValue(viaTs, "TZ", "America/Denver");
    setEnvValue(viaTs, "INSTALL_HERMES", "true");

    const viaShell = makeRepo();
    writeFileSync(
      join(viaShell, "harness.yaml"),
      "sandbox:\n  name: roundtrip\n  timezone: America/Denver\ninstall:\n  hermes: true\n",
    );
    const r = spawnSync("sh", [REAL_MIGRATOR, viaShell], { encoding: "utf8" });
    expect(r.status).toBe(0);

    expect(readEnv(viaShell)).toBe(readEnv(viaTs));
  });
});
