import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInRoot,
  installFieldPath,
  isInstallFlagEnabled,
  setConfigField,
  setEnvValue,
  setInstallFlag,
  setKeyInEnv,
} from "../lib/env-file.js";
import { ohConfigPath } from "../lib/oh-config.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-env-file-"));
  cleanups.push(d);
  mkdirSync(join(d, ".devcontainer"), { recursive: true });
  return d;
}

const dotenvPaths = (root: string): string[] => [
  join(root, ".env"),
  join(root, ".devcontainer", ".env"),
];

const expectNoDotenv = (root: string): void => {
  for (const file of dotenvPaths(root)) expect(existsSync(file)).toBe(false);
};

const readConfig = (root: string): Record<string, never> =>
  JSON.parse(readFileSync(ohConfigPath(root), "utf8"));

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

describe("install flags", () => {
  it("maps an install key to its oh.json field", () => {
    expect(installFieldPath("opencode")).toBe("install.opencode");
    expect(installFieldPath("grok_build")).toBe("install.grokBuild");
    expect(installFieldPath("agent_browser")).toBe("install.agentBrowser");
    expect(installFieldPath("tailscale")).toBe("install.tailscale");
  });

  it("writes the flag to oh.json and never to a dotenv", () => {
    const root = makeRepo();
    expect(isInstallFlagEnabled(root, "hermes")).toBe(false);

    expect(setInstallFlag(root, "hermes")).toBe("updated");

    expect(readConfig(root)).toMatchObject({ install: { hermes: true } });
    expect(isInstallFlagEnabled(root, "hermes")).toBe(true);
    expectNoDotenv(root);
  });

  it("writes install.tailscale from the tailscale flag", () => {
    const root = makeRepo();
    expect(isInstallFlagEnabled(root, "tailscale")).toBe(false);

    expect(setInstallFlag(root, "tailscale")).toBe("updated");

    expect(readConfig(root)).toMatchObject({ install: { tailscale: true } });
    expect(isInstallFlagEnabled(root, "tailscale")).toBe(true);
    expectNoDotenv(root);
  });

  it("is idempotent — a second call rewrites nothing", () => {
    const root = makeRepo();
    setInstallFlag(root, "opencode");
    const after = readFileSync(ohConfigPath(root), "utf8");
    expect(setInstallFlag(root, "opencode")).toBe("already-set");
    expect(readFileSync(ohConfigPath(root), "utf8")).toBe(after);
  });

  it("reports `added` for a field the defaults leave unset", () => {
    const root = makeRepo();
    expect(setConfigField(root, "git.userName", "Ada Lovelace")).toBe("added");
  });
});

describe("setEnvValue", () => {
  it("routes a compose variable to its oh.json field", () => {
    const root = makeRepo();
    expect(setEnvValue(root, "DOCKER_SOCKET", "true")).toBe("updated");
    expect(readConfig(root)).toMatchObject({ access: { dockerSocket: true } });
    expectNoDotenv(root);
  });

  it("routes INSTALL_TAILSCALE to install.tailscale", () => {
    const root = makeRepo();
    expect(setEnvValue(root, "INSTALL_TAILSCALE", "true")).toBe("updated");
    expect(readConfig(root)).toMatchObject({ install: { tailscale: true } });
    expectNoDotenv(root);
  });

  it("refuses a key that has no oh.json field rather than falling back to a dotenv", () => {
    const root = makeRepo();
    expect(() => setEnvValue(root, "GH_TOKEN", "ghp_example")).toThrow(/oh secret set/);
    expectNoDotenv(root);
  });
});

describe("setConfigField", () => {
  it("creates a missing section and validates the value", () => {
    const root = makeRepo();
    expect(setConfigField(root, "access.sshPort", "2200")).toBe("updated");
    expect(readConfig(root)).toMatchObject({ access: { sshPort: 2200 } });
    expect(() => setConfigField(root, "access.sshPort", "0")).toThrow(/1 and 65535/);
  });

  it("refuses an unknown field", () => {
    expect(() => setConfigField(makeRepo(), "access.nope", "1")).toThrow(/unknown oh.json field/);
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

describe("the root dotenv has exactly one writer", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") out.push(...sourceFiles(full));
      } else if (entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
    return out;
  }

  it("only lib/secrets.ts reaches a dotenv write primitive", () => {
    const callers = sourceFiles(SRC)
      .filter((file) => relative(SRC, file) !== "lib/env.ts")
      .filter((file) => /\b(writeEnvFile|upsertEnvFile)\b/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file))
      .sort();
    expect(callers).toEqual(["lib/secrets.ts"]);
  });

});
