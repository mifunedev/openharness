import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSandboxName,
  entryRoot,
  listEntries,
  materialize,
  nextDefaultName,
  registryRoot,
  resolveSandboxRoot,
} from "../registry.js";
import type { LifecycleRunner, RunResult } from "../execution/runner.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function registry(): string {
  const home = mkdtempSync(join(tmpdir(), "oh-registry-"));
  cleanups.push(home);
  vi.stubEnv("OH_HOME", home);
  return join(home, "sandboxes");
}

function addEntry(name: string, config: Record<string, unknown> = {}): string {
  const root = entryRoot(name);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "oh.json"), `${JSON.stringify({ version: 1, name, ...config })}\n`);
  return root;
}

function noDocker(): LifecycleRunner {
  return () => ({ status: 1, error: { code: "ENOENT" } }) as RunResult;
}

function dockerNames(names: string[]): LifecycleRunner {
  return () => ({ status: 0, stdout: `${names.join("\n")}\n` });
}

function walk(base: string, dir: string = base): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(base, abs));
    else out.push(relative(base, abs));
  }
  return out.sort();
}

describe("registryRoot", () => {
  it("is ${OH_HOME}/sandboxes", () => {
    const root = registry();
    expect(registryRoot()).toBe(root);
  });
});

describe("sandbox names", () => {
  it("accepts lowercase names with digits and dashes", () => {
    for (const name of ["oh-sbx-1", "box", "a1-b2"]) {
      expect(() => assertSandboxName(name)).not.toThrow();
    }
  });

  it("rejects anything else, naming the rule", () => {
    for (const name of ["Box", "-box", "a b", "box/../etc", ""]) {
      expect(() => assertSandboxName(name), name).toThrow(/invalid sandbox name/);
    }
  });
});

describe("nextDefaultName", () => {
  it("hands out oh-sbx-1 then oh-sbx-2 as entries appear", () => {
    registry();
    expect(nextDefaultName(noDocker())).toBe("oh-sbx-1");
    addEntry("oh-sbx-1");
    expect(nextDefaultName(noDocker())).toBe("oh-sbx-2");
  });

  it("skips a name a running container already owns", () => {
    registry();
    expect(nextDefaultName(dockerNames(["oh-sbx-1", "unrelated"]))).toBe("oh-sbx-2");
  });

  it("tolerates docker being absent", () => {
    registry();
    expect(
      nextDefaultName(() => {
        throw new Error("spawn docker ENOENT");
      }),
    ).toBe("oh-sbx-1");
  });
});

describe("listEntries", () => {
  it("lists only directories that carry an oh.json, sorted", () => {
    const root = registry();
    addEntry("beta");
    addEntry("alpha");
    mkdirSync(join(root, "not-an-entry"), { recursive: true });
    expect(listEntries()).toEqual(["alpha", "beta"]);
  });

  it("is empty when the registry does not exist yet", () => {
    registry();
    expect(listEntries()).toEqual([]);
  });
});

describe("materialize", () => {
  it("writes exactly the five bundled files, executable where they are scripts", () => {
    registry();
    const root = addEntry("box");
    materialize(root);

    expect(walk(root)).toEqual([
      ".devcontainer/docker-compose.docker-sock.yml",
      ".devcontainer/docker-compose.ssh.yml",
      ".devcontainer/docker-compose.yml",
      ".oh/scripts/check-host-port.sh",
      ".oh/scripts/docker-compose.sh",
      "oh.json",
    ]);
    for (const script of ["docker-compose.sh", "check-host-port.sh"]) {
      expect(statSync(join(root, ".oh", "scripts", script)).mode & 0o111, script).not.toBe(0);
    }
  });

  it("materialises the tracked file texts byte for byte", () => {
    registry();
    const root = addEntry("box");
    materialize(root);
    const tracked = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

    expect(readFileSync(join(root, ".devcontainer", "docker-compose.ssh.yml"), "utf8")).toBe(
      tracked(".devcontainer/docker-compose.ssh.yml"),
    );
    expect(readFileSync(join(root, ".oh", "scripts", "docker-compose.sh"), "utf8")).toBe(
      tracked(".oh/scripts/docker-compose.sh"),
    );
  });

  it("picks the image-only base without a repo and the build base with one", () => {
    registry();
    const root = addEntry("box");

    materialize(root);
    const imageOnly = readFileSync(join(root, ".devcontainer", "docker-compose.yml"), "utf8");
    expect(imageOnly).not.toContain("build:");

    materialize(root, { repo: "/srv/checkout" });
    const withRepo = readFileSync(join(root, ".devcontainer", "docker-compose.yml"), "utf8");
    expect(withRepo).toContain("context: ${OH_REPO_DIR:-..}");
    expect(withRepo).toContain("${OH_REPO_DIR:-..}:/home/sandbox/harness");
  });

  it("overwrites a drifted file so the entry always matches the CLI", () => {
    registry();
    const root = addEntry("box");
    materialize(root);
    writeFileSync(join(root, ".oh", "scripts", "docker-compose.sh"), "drifted\n");

    materialize(root);
    expect(readFileSync(join(root, ".oh", "scripts", "docker-compose.sh"), "utf8")).toBe(
      readFileSync(join(REPO_ROOT, ".oh/scripts/docker-compose.sh"), "utf8"),
    );
  });

  it("writes nothing outside the entry it was given", () => {
    const registryPath = registry();
    const root = addEntry("box");
    materialize(root, { repo: "/srv/checkout" });

    for (const rel of walk(root)) expect(rel.startsWith("..")).toBe(false);
    expect(readdirSync(registryPath)).toEqual(["box"]);
    expect(existsSync(join(registryPath, "..", ".devcontainer"))).toBe(false);
    expect(existsSync(join("/srv", "checkout"))).toBe(false);
  });
});

describe("resolveSandboxRoot", () => {
  it("resolves an explicit name to its entry", () => {
    registry();
    const root = addEntry("box");
    addEntry("other");
    expect(resolveSandboxRoot({ name: "box" })).toBe(root);
  });

  it("errors naming the registry path when the named entry is absent", () => {
    const registryPath = registry();
    expect(() => resolveSandboxRoot({ name: "absent" })).toThrow(registryPath);
    expect(() => resolveSandboxRoot({ name: "absent" })).toThrow("no sandbox named `absent`");
  });

  it("resolves the single registered entry when no name is given", () => {
    registry();
    const root = addEntry("only");
    expect(resolveSandboxRoot({ cwd: tmpdir() })).toBe(root);
  });

  it("falls back to the entry whose repo contains the cwd", () => {
    registry();
    const checkout = mkdtempSync(join(tmpdir(), "oh-registry-repo-"));
    cleanups.push(checkout);
    addEntry("elsewhere", { repo: "/nowhere" });
    const root = addEntry("mine", { repo: checkout });
    expect(resolveSandboxRoot({ cwd: join(checkout, "packages", "app") })).toBe(root);
  });

  it("errors listing the registered names when nothing matches", () => {
    registry();
    addEntry("alpha");
    addEntry("beta");
    expect(() => resolveSandboxRoot({ cwd: tmpdir() })).toThrow(/alpha, beta/);
  });

  it("errors pointing at the install verb when the registry is empty", () => {
    registry();
    expect(() => resolveSandboxRoot({ cwd: tmpdir() })).toThrow(
      /no sandbox is registered .* `oh sandbox install docker`/,
    );
  });
});
