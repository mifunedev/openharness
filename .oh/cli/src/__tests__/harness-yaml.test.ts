import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInRoot,
  harnessYamlPath,
  isInstallFlagEnabled,
  readConfigValue,
  seedHarnessYaml,
  setInstallFlag,
} from "../lib/harness-yaml.js";
import type { LifecycleRunner } from "../lib/execution/runner.js";

/**
 * Tests for the harness.yaml reader/writer.
 *
 * mkdtemp fixtures only — NEVER the real worktree root, whose harness.yaml.example
 * would fire the seed and whose harness.yaml the writer would edit for real.
 *
 * The round-trip test is the ONLY place a real subprocess is acceptable: it runs
 * the vendored `sh .oh/scripts/harness-config.sh` against a temp fixture. That is
 * the whole point of the test — proving the TS writer emits something the awk
 * parser actually reads back — and it spawns no docker.
 */

// src/__tests__ -> src -> .oh/cli -> .oh -> repo root
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const REAL_SCRIPT = join(REPO_ROOT, ".oh", "scripts", "harness-config.sh");
const REAL_EXAMPLE = join(REPO_ROOT, "harness.yaml.example");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

/** A repo fixture carrying the REAL vendored parser and the REAL template. */
function makeRepo(withYaml = true): string {
  const d = mkdtempSync(join(tmpdir(), "oh-harness-yaml-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  copyFileSync(REAL_SCRIPT, join(d, ".oh", "scripts", "harness-config.sh"));
  copyFileSync(REAL_EXAMPLE, join(d, "harness.yaml.example"));
  if (withYaml) copyFileSync(REAL_EXAMPLE, join(d, "harness.yaml"));
  return d;
}

/** Runner that shells out to the real `sh` — reads a fixture, spawns no docker. */
const realSh: LifecycleRunner = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

const readYaml = (root: string): string => readFileSync(harnessYamlPath(root), "utf8");

describe("assertInRoot", () => {
  it("allows the root itself and anything under it", () => {
    expect(() => assertInRoot("/a/b", "/a/b")).not.toThrow();
    expect(() => assertInRoot("/a/b/c.yaml", "/a/b")).not.toThrow();
  });

  it("refuses a sibling that merely shares a name prefix", () => {
    // `/a/bc` starts with `/a/b` as a STRING but is not inside it.
    expect(() => assertInRoot("/a/bc", "/a/b")).toThrow(/outside the project root/);
    expect(() => assertInRoot("/etc/passwd", "/a/b")).toThrow(/outside the project root/);
  });
});

describe("seedHarnessYaml", () => {
  it("copies the example when harness.yaml is missing, and reports that it wrote", () => {
    const root = makeRepo(false);
    expect(seedHarnessYaml(root)).toBe(true);
    expect(readYaml(root)).toBe(readFileSync(REAL_EXAMPLE, "utf8"));
  });

  it("is a no-op when harness.yaml already exists", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "sandbox:\n  name: mine\n");
    expect(seedHarnessYaml(root)).toBe(false);
    expect(readYaml(root)).toContain("name: mine");
  });

  it("is a no-op when there is no example to copy", () => {
    const root = mkdtempSync(join(tmpdir(), "oh-harness-yaml-"));
    cleanups.push(root);
    expect(seedHarnessYaml(root)).toBe(false);
  });
});

describe("readConfigValue", () => {
  it("returns undefined for a key that ships commented out", () => {
    const root = makeRepo();
    expect(readConfigValue(root, "install.opencode", realSh)).toBeUndefined();
  });

  it("returns undefined when harness.yaml is absent rather than guessing", () => {
    const root = makeRepo(false);
    expect(readConfigValue(root, "sandbox.name", realSh)).toBeUndefined();
  });

  it("reads a live value through the vendored parser", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "sandbox:\n  name: custom-box\n");
    expect(readConfigValue(root, "sandbox.name", realSh)).toBe("custom-box");
  });
});

describe("setInstallFlag", () => {
  it("uncomments the template line IN PLACE, keeping the line count", () => {
    const root = makeRepo();
    const before = readYaml(root).split("\n");
    expect(setInstallFlag(root, "opencode")).toBe("uncommented");
    const after = readYaml(root).split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((l) => /opencode:/.test(l))).toHaveLength(1);
  });

  it("preserves the trailing comment that documents the build arg", () => {
    const root = makeRepo();
    setInstallFlag(root, "opencode");
    const line = readYaml(root).split("\n").find((l) => l.startsWith("  opencode:"));
    expect(line).toContain("INSTALL_OPENCODE");
    expect(line).toMatch(/^ {2}opencode: true/);
  });

  it("is idempotent on an already-true key and does not rewrite the file", () => {
    const root = makeRepo();
    setInstallFlag(root, "hermes");
    const once = readYaml(root);
    expect(setInstallFlag(root, "hermes")).toBe("already-set");
    expect(readYaml(root)).toBe(once);
  });

  it("flips an existing false value to true without duplicating the key", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "install:\n  opencode: false\n");
    expect(setInstallFlag(root, "opencode")).toBe("updated");
    const lines = readYaml(root).split("\n").filter((l) => l.includes("opencode:"));
    expect(lines).toEqual(["  opencode: true"]);
  });

  it("appends the install: section when the file has none", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "sandbox:\n  name: box\n");
    expect(setInstallFlag(root, "hermes")).toBe("section-added");
    expect(readYaml(root)).toMatch(/install:\n {2}hermes: true\n$/);
    // The pre-existing section must survive untouched.
    expect(readConfigValue(root, "sandbox.name", realSh)).toBe("box");
  });

  it("adds a key to an existing section that never mentioned it", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "install:\n  hermes: true\n\nssh:\n  port: 2222\n");
    expect(setInstallFlag(root, "opencode")).toBe("added");
    expect(readConfigValue(root, "install.opencode", realSh)).toBe("true");
    // The key lands INSIDE install:, not in the ssh: section below it.
    expect(readConfigValue(root, "ssh.port", realSh)).toBe("2222");
  });

  it("does not touch a same-named key in a different section", () => {
    const root = makeRepo();
    writeFileSync(harnessYamlPath(root), "other:\n  # hermes: false\n\ninstall:\n  # hermes: false\n");
    setInstallFlag(root, "hermes");
    const lines = readYaml(root).split("\n");
    expect(lines[1]).toBe("  # hermes: false");
    expect(lines[4]).toBe("  hermes: true");
  });

  it("throws when harness.yaml does not exist", () => {
    const root = makeRepo(false);
    expect(() => setInstallFlag(root, "opencode")).toThrow(/harness\.yaml not found/);
  });

  it("refuses to write outside the project root", () => {
    // A root that is not a prefix of its own harness.yaml cannot happen through
    // resolveProjectRoot, so drive assertInRoot directly for the invariant.
    expect(() => assertInRoot(join(tmpdir(), "elsewhere", "harness.yaml"), "/nope")).toThrow(
      /outside the project root/,
    );
  });
});

describe("round-trip through the vendored parser", () => {
  it.each(["opencode", "grok_build", "deepagents", "hermes"])(
    "install.%s: the writer emits what harness-config.sh reads back",
    (key) => {
      const root = makeRepo();
      setInstallFlag(root, key);

      // `get` mode sees the value...
      expect(readConfigValue(root, `install.${key}`, realSh)).toBe("true");
      expect(isInstallFlagEnabled(root, key, realSh)).toBe(true);

      // ...and `env` mode emits the build arg docker compose consumes.
      const env = realSh("sh", [
        join(root, ".oh", "scripts", "harness-config.sh"),
        "env",
        harnessYamlPath(root),
      ]);
      expect(env.status).toBe(0);
      expect(env.stdout).toContain(`INSTALL_${key.toUpperCase()}=true`);
    },
  );

  it("leaves every other install key untouched", () => {
    const root = makeRepo();
    setInstallFlag(root, "opencode");
    for (const other of ["grok_build", "deepagents", "hermes", "agent_browser"]) {
      expect(readConfigValue(root, `install.${other}`, realSh)).toBeUndefined();
    }
  });
});
