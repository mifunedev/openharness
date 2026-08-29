import { afterEach, describe, expect, it } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHarnessInstall } from "../commands/harness.js";
import { runToolInstall } from "../commands/tool.js";
import { ohConfigPath } from "../lib/oh-config.js";
import { secretsFilePath, setSecret } from "../lib/secrets.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-install-flag-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  mkdirSync(join(d, ".devcontainer"), { recursive: true });
  setSecret(d, "GH_TOKEN", "ghp_example");
  symlinkSync("../.env", join(d, ".devcontainer", ".env"));
  return d;
}

function makeIo(): { io: { stdout: (s: string) => void; stderr: (s: string) => void }; out: string[] } {
  const out: string[] = [];
  return { io: { stdout: (s) => out.push(s), stderr: (s) => out.push(s) }, out };
}

const readConfig = (root: string): Record<string, never> =>
  JSON.parse(readFileSync(ohConfigPath(root), "utf8"));

describe("install flags never reach the secrets dotenv", () => {
  it("`oh tool install --persist-only` writes oh.json and leaves .env byte-identical", async () => {
    const root = makeRepo();
    const before = readFileSync(secretsFilePath(root), "utf8");
    const { io, out } = makeIo();

    expect(await runToolInstall("agent-browser", { cwd: root, persistOnly: true }, io)).toBe(0);

    expect(readConfig(root)).toMatchObject({ install: { agentBrowser: true } });
    expect(readFileSync(secretsFilePath(root), "utf8")).toBe(before);
    expect(before).not.toMatch(/INSTALL_/);
    expect(out.join("")).toContain("oh.json: set install.agentBrowser=true");
    expect(out.join("")).not.toContain(".devcontainer/.env");
  });

  it("the .devcontainer/.env symlink still resolves to the untouched secrets file", async () => {
    const root = makeRepo();
    const link = join(root, ".devcontainer", ".env");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const before = readFileSync(link, "utf8");

    const { io } = makeIo();
    await runToolInstall("agent-browser", { cwd: root, persistOnly: true }, io);

    expect(readFileSync(link, "utf8")).toBe(before);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("`oh tool install tailscale --persist-only` writes oh.json and leaves .env byte-identical", async () => {
    const root = makeRepo();
    const before = readFileSync(secretsFilePath(root), "utf8");
    const { io, out } = makeIo();

    expect(await runToolInstall("tailscale", { cwd: root, persistOnly: true }, io)).toBe(0);

    expect(readConfig(root)).toMatchObject({ install: { tailscale: true } });
    expect(readFileSync(secretsFilePath(root), "utf8")).toBe(before);
    expect(before).not.toMatch(/INSTALL_/);
    expect(out.join("")).toContain("oh.json: set install.tailscale=true");
    expect(out.join("")).not.toContain(".devcontainer/.env");
  });

  it("`oh harness install --persist-only` writes oh.json and leaves .env byte-identical", async () => {
    const root = makeRepo();
    const before = readFileSync(secretsFilePath(root), "utf8");
    const { io, out } = makeIo();

    expect(await runHarnessInstall("hermes", { cwd: root, persistOnly: true }, io)).toBe(0);

    expect(readConfig(root)).toMatchObject({ install: { hermes: true } });
    expect(readFileSync(secretsFilePath(root), "utf8")).toBe(before);
    expect(out.join("")).toContain("oh.json: set install.hermes=true");
  });

  it("--no-persist writes neither surface", async () => {
    const root = makeRepo();
    const before = readFileSync(secretsFilePath(root), "utf8");
    const { io } = makeIo();

    await runToolInstall("agent-browser", { cwd: root, persistOnly: true, noPersist: true }, io);

    expect(readFileSync(secretsFilePath(root), "utf8")).toBe(before);
    expect(() => readConfig(root)).toThrow();
  });
});
