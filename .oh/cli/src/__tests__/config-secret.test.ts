import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConfigSet, runConfigShow, type ConfigIO } from "../commands/config.js";
import { runSecretList, runSecretSet, type SecretIO } from "../commands/secret.js";
import { setSecret } from "../lib/secrets.js";
import { ohConfigPath } from "../lib/oh-config.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { parseConfigArgs, parseSecretArgs } = await import("../cli.js");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-config-cmd-"));
  cleanups.push(d);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  return d;
}

function makeIo(): { io: ConfigIO & SecretIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) }, out, err };
}

const readConfig = (root: string): Record<string, never> =>
  JSON.parse(readFileSync(ohConfigPath(root), "utf8"));

describe("parseConfigArgs", () => {
  it("routes show and set, and still routes an integration name", () => {
    expect(parseConfigArgs(["show"])).toEqual({
      ok: true,
      args: { help: false, integrationHelp: false, verb: "show" },
    });
    expect(parseConfigArgs(["set", "access.sshPort", "2200"])).toEqual({
      ok: true,
      args: {
        help: false,
        integrationHelp: false,
        verb: "set",
        key: "access.sshPort",
        value: "2200",
      },
    });
    expect(parseConfigArgs(["langfuse"])).toEqual({
      ok: true,
      args: { help: false, integrationHelp: false, integration: "langfuse" },
    });
  });

  it("routes repo as a verb and refuses flags after it", () => {
    expect(parseConfigArgs(["repo"])).toEqual({
      ok: true,
      args: { help: false, integrationHelp: false, verb: "repo" },
    });
    const parsed = parseConfigArgs(["repo", "--yes"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/unexpected argument "--yes"/);
  });

  it("requires both a field and a value", () => {
    const parsed = parseConfigArgs(["set", "access.sshPort"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/a field and a value are required/);
  });

  it("refuses a third positional so a value with spaces must be quoted", () => {
    const parsed = parseConfigArgs(["set", "git.userName", "Ada", "Lovelace"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/quote a value/);
  });
});

describe("parseSecretArgs", () => {
  it("routes set and list", () => {
    expect(parseSecretArgs(["list"])).toEqual({ ok: true, args: { help: false, verb: "list" } });
    expect(parseSecretArgs(["set", "GH_TOKEN"])).toEqual({
      ok: true,
      args: { help: false, verb: "set", key: "GH_TOKEN" },
    });
  });

  it("never accepts the value as an argument", () => {
    const parsed = parseSecretArgs(["set", "GH_TOKEN", "ghp_example"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/shell history/);
  });

  it("rejects an unknown subcommand", () => {
    const parsed = parseSecretArgs(["show"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/expected set or list/);
  });
});

describe("--sandbox <name>", () => {
  function registryEntry(name: string): string {
    const home = mkdtempSync(join(tmpdir(), "oh-config-registry-"));
    cleanups.push(home);
    vi.stubEnv("OH_HOME", home);
    const root = join(home, "sandboxes", name);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "oh.json"), `${JSON.stringify({ version: 1, name })}\n`);
    return root;
  }

  it("parses --sandbox out of `oh config` and `oh secret` argv", () => {
    expect(parseConfigArgs(["set", "access.ssh", "true", "--sandbox", "box"])).toEqual({
      ok: true,
      args: {
        help: false,
        integrationHelp: false,
        verb: "set",
        key: "access.ssh",
        value: "true",
        sandbox: "box",
      },
    });
    expect(parseSecretArgs(["--sandbox", "box", "set", "GH_TOKEN"])).toEqual({
      ok: true,
      args: { help: false, verb: "set", key: "GH_TOKEN", sandbox: "box" },
    });
    const missing = parseSecretArgs(["set", "GH_TOKEN", "--sandbox"]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("--sandbox requires a sandbox name");
  });

  it("`oh config set --sandbox` writes the entry, not the project", async () => {
    const entry = registryEntry("box");
    const project = makeRepo();
    const { io } = makeIo();

    expect(
      await runConfigSet("access.sshPort", "2345", { cwd: project, sandbox: "box" }, io),
    ).toBe(0);
    expect(readConfig(entry)).toMatchObject({ access: { sshPort: 2345 } });
    expect(existsSync(ohConfigPath(project))).toBe(false);
  });

  it("`oh config show --sandbox` reads the entry", async () => {
    registryEntry("box");
    const { io, out } = makeIo();
    expect(await runConfigShow({ cwd: makeRepo(), sandbox: "box" }, io)).toBe(0);
    expect(JSON.parse(out.join(""))).toMatchObject({ name: "box" });
  });

  it("errors when the named sandbox is not registered", async () => {
    registryEntry("box");
    const { io } = makeIo();
    await expect(runConfigShow({ sandbox: "absent" }, io)).rejects.toThrow(
      "no sandbox named `absent`",
    );
  });

  it("`oh secret set --sandbox` writes the entry .env and no .gitignore", async () => {
    const entry = registryEntry("box");
    const { io } = makeIo();
    io.askSecret = async () => "ghp_registry";

    expect(await runSecretSet("GH_TOKEN", { sandbox: "box" }, io)).toBe(0);
    expect(readFileSync(join(entry, ".env"), "utf8")).toContain("GH_TOKEN=ghp_registry");
    expect(existsSync(join(entry, ".gitignore"))).toBe(false);
  });

  it("`oh secret set` appends .env to the project .gitignore exactly once", async () => {
    const project = makeRepo();
    mkdirSync(join(project, ".git"), { recursive: true });
    const { io } = makeIo();
    io.askSecret = async () => "ghp_project";

    expect(await runSecretSet("GH_TOKEN", { cwd: project }, io)).toBe(0);
    expect(readFileSync(join(project, ".gitignore"), "utf8")).toBe(".env\n");

    expect(await runSecretSet("GH_TOKEN", { cwd: project }, io)).toBe(0);
    expect(readFileSync(join(project, ".gitignore"), "utf8")).toBe(".env\n");
  });

  it("writes no .gitignore when the project root is not a git checkout", async () => {
    const project = makeRepo();
    const { io } = makeIo();
    io.askSecret = async () => "ghp_project";

    expect(await runSecretSet("GH_TOKEN", { cwd: project }, io)).toBe(0);
    expect(existsSync(join(project, ".gitignore"))).toBe(false);
  });
});

describe("oh config show", () => {
  it("prints the resolved oh.json as JSON", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    expect(await runConfigShow({ cwd: root }, io)).toBe(0);
    const printed = JSON.parse(out.join(""));
    expect(printed.version).toBe(1);
    expect(printed.access).toBeDefined();
    expect(printed.install).toBeUndefined();
  });
});

describe("oh config set", () => {
  it("writes a validated value to oh.json", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    expect(await runConfigSet("access.sshPort", "2200", { cwd: root }, io)).toBe(0);
    expect(readConfig(root)).toMatchObject({ access: { sshPort: 2200 } });
    expect(out.join("")).toContain("oh.json: set access.sshPort=2200");
  });

  it("rejects a secret key and points at `oh secret set`", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runConfigSet("GH_TOKEN", "ghp_example", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toMatch(/is a secret/);
    expect(err.join("")).toContain("oh secret set GH_TOKEN");
    expect(existsSync(ohConfigPath(root))).toBe(false);
  });

  it("rejects a lowercased secret key too", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runConfigSet("gh_token", "ghp_example", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toContain("oh secret set GH_TOKEN");
  });

  it("rejects an unknown field and lists the settable ones", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runConfigSet("access.nope", "1", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toMatch(/unknown field "access.nope"/);
    expect(err.join("")).toContain("access.sshPort");
  });

  it("rejects an invalid value without writing", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runConfigSet("access.sshPort", "0", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toMatch(/between 1 and 65535/);
    expect(existsSync(ohConfigPath(root))).toBe(false);
  });

  it("sets the langfuse fields the old dotenv had no home for", async () => {
    const root = makeRepo();
    const { io } = makeIo();
    expect(await runConfigSet("langfuse.baseUrl", "http://langfuse-web:3000", { cwd: root }, io))
      .toBe(0);
    expect(await runConfigSet("langfuse.privacyPreset", "metadata-only", { cwd: root }, io)).toBe(0);
    expect(readConfig(root)).toMatchObject({
      langfuse: { baseUrl: "http://langfuse-web:3000", privacyPreset: "metadata-only" },
    });
  });

  it("refuses a privacy preset outside the documented set", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    expect(await runConfigSet("langfuse.privacyPreset", "everything", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toMatch(/must be one of metadata-only/);
  });
});

describe("oh secret set", () => {
  it("stores a Muse API key through the hidden prompt and redacts its listing", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    io.askSecret = async () => "meta_test_credential_not_real";
    expect(await runSecretSet("META_API_KEY", { cwd: root }, io)).toBe(0);
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("META_API_KEY=meta_test_credential_not_real");
    expect(await runSecretList({ cwd: root }, io)).toBe(0);
    expect(out.join("")).toContain("META_API_KEY");
    expect(out.join("")).not.toContain("meta_test_credential_not_real");
  });
  it("takes the value from a masked prompt, never from an argument", async () => {
    const root = makeRepo();
    const { io, out } = makeIo();
    const asked: string[] = [];
    io.askSecret = async (q) => {
      asked.push(q);
      return "ghp_supersecretvalue";
    };
    expect(await runSecretSet("GH_TOKEN", { cwd: root }, io)).toBe(0);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("input hidden");
    expect(out.join("")).not.toContain("ghp_supersecretvalue");
    expect(out.join("")).toContain("ghp_s");
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("GH_TOKEN=ghp_supersecretvalue");
  });

  it("refuses a non-secret key and points at `oh config set`", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    io.askSecret = async () => "never";
    expect(await runSecretSet("SANDBOX_NAME", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toContain("oh config set SANDBOX_NAME");
    expect(existsSync(join(root, ".env"))).toBe(false);
  });

  it("changes nothing when the prompt comes back empty", async () => {
    const root = makeRepo();
    const { io, err } = makeIo();
    io.askSecret = async () => "  ";
    expect(await runSecretSet("GH_TOKEN", { cwd: root }, io)).toBe(1);
    expect(err.join("")).toMatch(/no value entered/);
    expect(existsSync(join(root, ".env"))).toBe(false);
  });
});

describe("oh secret list", () => {
  it("redacts every value it prints", async () => {
    const root = makeRepo();
    setSecret(root, "GH_TOKEN", "ghp_supersecretvalue");
    setSecret(root, "XAI_API_KEY", "xai_anotherlongsecret");
    const { io, out } = makeIo();
    expect(await runSecretList({ cwd: root }, io)).toBe(0);
    const printed = out.join("");
    expect(printed).toContain("GH_TOKEN");
    expect(printed).toContain("XAI_API_KEY");
    expect(printed).not.toContain("ghp_supersecretvalue");
    expect(printed).not.toContain("xai_anotherlongsecret");
    expect(printed).toMatch(/\*{4}/);
  });

  it("says so when nothing is set", async () => {
    const { io, out } = makeIo();
    expect(await runSecretList({ cwd: makeRepo() }, io)).toBe(0);
    expect(out.join("")).toMatch(/no secrets set/);
  });
});
