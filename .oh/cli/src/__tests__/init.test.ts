import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runInit, type InitOptions, type InitIO } from "../commands/init.js";

function listOh(root: string): string[] {
  const ohRoot = join(root, ".oh");
  const acc: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else acc.push(relative(ohRoot, p).split("/").join("/"));
    }
  };
  if (existsSync(ohRoot)) walk(ohRoot);
  return acc.sort();
}

const TEMPLATES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates",
);

const SOURCE_OH = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

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
  return { targetDir, templatesDir: TEMPLATES, sourceOhDir: SOURCE_OH, ...extra };
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
    expect(existsSync(join(t, ".devcontainer/devcontainer.json"))).toBe(true);
    expect(existsSync(join(t, ".env.example"))).toBe(true);
    expect(existsSync(join(t, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(t, ".gitignore"))).toBe(true);
    expect(existsSync(join(t, "README.md"))).toBe(false);
    expect(out.some((l) => l.includes("create .env.example"))).toBe(true);
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
    expect(existsSync(join(t, ".env.example"))).toBe(false);
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

    const lines = afterSecond.split("\n").filter((l) => l.trim() !== "");
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("partial-existing .gitignore: appends only the missing entries", async () => {
    const t = freshTmp();
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
      { targetDir: t, templatesDir: onlyReadme, sourceOhDir: SOURCE_OH },
      io,
    );

    expect(code).toBe(0);
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
    expect(parsed.workspaceFolder).toBe("/home/sandbox/harness");
  });


  it("vendor: init --yes populates .oh/ with manifest-shipped files, excludes volatile", async () => {
    const t = freshTmp();
    const { io } = makeIO();
    const code = await runInit(opts(t, { yes: true }), io);

    expect(code).toBe(0);
    expect(existsSync(join(t, ".oh/manifest.json"))).toBe(true);
    expect(existsSync(join(t, ".oh/README.md"))).toBe(true);
    expect(existsSync(join(t, ".oh/cli/package.json"))).toBe(true);
    expect(existsSync(join(t, ".oh/cli/src/cli.ts"))).toBe(true);
    expect(existsSync(join(t, ".oh/templates/.env.example"))).toBe(true);
    expect(existsSync(join(t, ".oh/cli/node_modules"))).toBe(false);
    expect(existsSync(join(t, ".oh/cli/dist"))).toBe(false);
    expect(existsSync(join(t, ".oh/devcontainer"))).toBe(false);
  });

  it("manifest payload: preserves root docs, excludes patches, and preserves project files", async () => {
    const source = freshTmp();
    const sourceOh = join(source, ".oh");
    const target = freshTmp();
    const sentinel = "project file must remain byte-identical\n";
    const sentinelPath = join(target, "project-sentinel.txt");
    const sourceDocsPath = join(
      source,
      "docs/rfcs/rfc-brain-hands-boundary.md",
    );
    const targetDocsPath = join(
      target,
      "docs/rfcs/rfc-brain-hands-boundary.md",
    );

    mkdirSync(dirname(sourceDocsPath), { recursive: true });
    mkdirSync(dirname(targetDocsPath), { recursive: true });
    mkdirSync(join(sourceOh, "patches"), { recursive: true });
    writeFileSync(sourceDocsPath, "# source project docs\n");
    writeFileSync(targetDocsPath, "# target project docs\n");
    writeFileSync(join(sourceOh, "README.md"), "# control plane\n");
    writeFileSync(join(sourceOh, "patches/p.diff"), "source patch\n");
    writeFileSync(
      join(sourceOh, "manifest.json"),
      JSON.stringify({ include: ["README.md", "manifest.json"], exclude: [] }),
    );
    writeFileSync(sentinelPath, sentinel);

    expect(
      await runInit(
        opts(target, { sourceOhDir: sourceOh, minimal: true, yes: true }),
        makeIO().io,
      ),
    ).toBe(0);

    expect(readFileSync(targetDocsPath, "utf8")).toBe(
      "# target project docs\n",
    );
    expect(existsSync(join(target, ".oh", "docs"))).toBe(false);
    expect(existsSync(join(target, ".oh/README.md"))).toBe(true);
    expect(existsSync(join(target, ".oh/patches/p.diff"))).toBe(false);
    expect(readFileSync(sentinelPath, "utf8")).toBe(sentinel);
  });

  it("legacy source without a manifest still vendors its .oh/ files", async () => {
    const source = freshTmp();
    const sourceOh = join(source, ".oh");
    const target = freshTmp();
    mkdirSync(sourceOh, { recursive: true });
    writeFileSync(join(sourceOh, "legacy.txt"), "legacy payload\n");

    const { io, out } = makeIO();
    expect(
      await runInit(
        opts(target, { sourceOhDir: sourceOh, minimal: true, yes: true }),
        io,
      ),
    ).toBe(0);

    expect(readFileSync(join(target, ".oh/legacy.txt"), "utf8")).toBe(
      "legacy payload\n",
    );
    expect(out.join("")).toContain("legacy mode");
  });

  it("--yes determinism: two runs vendor an identical .oh/ file set", async () => {
    const a = freshTmp();
    const b = freshTmp();
    expect(await runInit(opts(a, { yes: true }), makeIO().io)).toBe(0);
    expect(await runInit(opts(b, { yes: true }), makeIO().io)).toBe(0);

    const listA = listOh(a);
    expect(listA.length).toBeGreaterThan(0);
    expect(listA).toEqual(listOh(b));
  });

  it("missing vendor source: exit 1, stderr names the path + the --from/--from-remote sources", async () => {
    const t = freshTmp();
    const bogus = join(t, "no-such-source");
    const { io, err } = makeIO();
    const code = await runInit(opts(t, { sourceOhDir: bogus, yes: true }), io);

    expect(code).toBe(1);
    const msg = err.join("");
    expect(msg).toContain(resolve(bogus));
    expect(msg).toContain("--from-remote");
    expect(existsSync(join(t, ".oh"))).toBe(false);
  });

  it("--dry-run leaves an empty tree (no .oh/, no scaffold)", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();
    const code = await runInit(opts(t, { dryRun: true, yes: true }), io);

    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) expect(line.startsWith("[dry-run] ")).toBe(true);
    expect(out.some((l) => l.includes("create .oh/manifest.json"))).toBe(true);
    expect(existsSync(join(t, ".oh"))).toBe(false);
    expect(readdirSync(t)).toHaveLength(0);
  });

  it("idempotent re-run: vendor reports skip for existing .oh/, no .gitignore dupes", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const giBefore = readFileSync(join(t, ".gitignore"), "utf8");
    const ohBefore = listOh(t);

    const { io, out } = makeIO();
    expect(await runInit(opts(t, { yes: true }), io)).toBe(0);

    expect(out.some((l) => l.includes("skip .oh/manifest.json (exists)"))).toBe(true);
    expect(readFileSync(join(t, ".gitignore"), "utf8")).toBe(giBefore);
    expect(listOh(t)).toEqual(ohBefore);
  });


  it("wizard: non-secrets land in oh.json and secrets land in the root dotenv, no crossover", async () => {
    const t = freshTmp();
    const ask = async (q: string): Promise<string> => {
      if (q.includes("Sandbox name")) return "my-cool-sandbox";
      if (q.includes("Timezone")) return "America/New_York";
      if (q.includes("Git user name")) return "Ada Lovelace";
      if (q.includes("Git user email")) return "ada@example.com";
      if (q.includes("agent_browser")) return "y";
      if (q.includes("tailscale")) return "y";
      return "";
    };
    const askSecret = async (q: string): Promise<string> =>
      q.includes("GH_TOKEN") ? "ghp_supersecrettoken12345" : "";

    const out: string[] = [];
    const io: InitIO = {
      stdout: (s) => out.push(s),
      stderr: () => {},
      ask,
      askSecret,
    };

    const code = await runInit(opts(t, { yes: false }), io);
    expect(code).toBe(0);

    const config = JSON.parse(readFileSync(join(t, "oh.json"), "utf8"));
    expect(config.version).toBe(1);
    expect(config.name).toBe("my-cool-sandbox");
    expect(config.timezone).toBe("America/New_York");
    expect(config.git).toEqual({ userName: "Ada Lovelace", userEmail: "ada@example.com" });
    expect(config.install.agentBrowser).toBe(true);
    expect(config.install.tailscale).toBe(true);
    expect(config.install.hermes).toBe(false);
    expect(config.access.ssh).toBe(false);
    expect(config.access.dockerSocket).toBe(false);

    const configText = readFileSync(join(t, "oh.json"), "utf8");
    expect(configText).not.toContain("ghp_supersecrettoken12345");
    expect(configText).not.toContain("GH_TOKEN");

    const dotenv = readFileSync(join(t, ".env"), "utf8");
    expect(dotenv).toMatch(/^GH_TOKEN=ghp_supersecrettoken12345$/m);
    for (const nonSecret of [
      "SANDBOX_NAME",
      "TZ",
      "GIT_USER_NAME",
      "GIT_USER_EMAIL",
      "INSTALL_AGENT_BROWSER",
      "INSTALL_TAILSCALE",
      "DOCKER_SOCKET",
    ]) {
      expect(dotenv).not.toContain(nonSecret);
    }

    expect(out.filter((l) => l.includes("create oh.json"))).toHaveLength(1);
    expect(out.filter((l) => l.includes("update .env (1 secret)"))).toHaveLength(1);
  });

  it("wizard: .devcontainer/.env is a symlink to ../.env", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();
    expect(await runInit(opts(t, { yes: true }), io)).toBe(0);

    const link = join(t, ".devcontainer/.env");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe("../.env");
    expect(out.some((l) => l.includes("create .devcontainer/.env"))).toBe(true);
  });

  it("wizard: --yes writes a default oh.json, prompts zero times, and writes no dotenv", async () => {
    const t = freshTmp();
    let asked = 0;
    const io: InitIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "should-not-be-asked";
      },
      askSecret: async () => {
        asked++;
        return "should-not-be-asked";
      },
    };
    const code = await runInit(opts(t, { yes: true }), io);

    expect(code).toBe(0);
    expect(asked).toBe(0);
    const config = JSON.parse(readFileSync(join(t, "oh.json"), "utf8"));
    expect(config.version).toBe(1);
    expect(config.install).toEqual({
      opencode: false,
      grokBuild: false,
      hermes: false,
      agentBrowser: false,
      tailscale: false,
    });
    expect(existsSync(join(t, ".env"))).toBe(false);
    expect(lstatSync(join(t, ".devcontainer/.env")).isSymbolicLink()).toBe(true);
  });

  it("migration: splits a real .devcontainer/.env and preserves an unrecognised key", async () => {
    const t = freshTmp();
    mkdirSync(join(t, ".devcontainer"), { recursive: true });
    const legacy = join(t, ".devcontainer/.env");
    writeFileSync(
      legacy,
      [
        "SANDBOX_NAME=legacy-box",
        "INSTALL_HERMES=true",
        "SANDBOX_SSH_PORT=2299",
        "GH_TOKEN=ghp_legacytoken",
        "MY_CUSTOM_THING=keep-me",
        "",
      ].join("\n"),
    );

    const { io, out, err } = makeIO();
    expect(await runInit(opts(t, { yes: true }), io)).toBe(0);

    const config = JSON.parse(readFileSync(join(t, "oh.json"), "utf8"));
    expect(config.name).toBe("legacy-box");
    expect(config.install.hermes).toBe(true);
    expect(config.access.sshPort).toBe(2299);
    expect(readFileSync(join(t, "oh.json"), "utf8")).not.toContain("ghp_legacytoken");
    expect(readFileSync(join(t, "oh.json"), "utf8")).not.toContain("MY_CUSTOM_THING");

    expect(readFileSync(join(t, ".env"), "utf8")).toMatch(/^GH_TOKEN=ghp_legacytoken$/m);

    const joinedErr = err.join("");
    expect(joinedErr).toContain("MY_CUSTOM_THING");
    expect(joinedErr).toContain("left in place");
    expect(joinedErr).not.toContain("SANDBOX_NAME");

    expect(lstatSync(legacy).isFile()).toBe(true);
    expect(readFileSync(legacy, "utf8")).toContain("MY_CUSTOM_THING=keep-me");
    expect(out.some((l) => l.includes("keep .devcontainer/.env (not removed)"))).toBe(true);
  });

  it("migration: a fully-classified legacy file is retired only after confirmation", async () => {
    const t = freshTmp();
    mkdirSync(join(t, ".devcontainer"), { recursive: true });
    const legacy = join(t, ".devcontainer/.env");
    writeFileSync(legacy, "SANDBOX_NAME=legacy-box\nGH_TOKEN=ghp_legacytoken\n");

    const declined = makeIO();
    declined.io.ask = async () => "";
    declined.io.askSecret = async () => "";
    expect(await runInit(opts(t, { yes: false }), declined.io)).toBe(0);
    expect(lstatSync(legacy).isFile()).toBe(true);
    expect(declined.out.some((l) => l.includes("keep .devcontainer/.env (not removed)"))).toBe(
      true,
    );

    const accepted = makeIO();
    accepted.io.ask = async (q: string) => (q.includes("Replace the migrated") ? "y" : "");
    accepted.io.askSecret = async () => "";
    expect(await runInit(opts(t, { yes: false, force: true }), accepted.io)).toBe(0);
    expect(accepted.out.some((l) => l.includes("remove .devcontainer/.env (migrated)"))).toBe(true);
    expect(lstatSync(join(t, ".devcontainer/.env")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(t, ".devcontainer/.env"))).toBe("../.env");
    expect(readFileSync(join(t, ".env"), "utf8")).toMatch(/^GH_TOKEN=ghp_legacytoken$/m);
  });


  it("full (default): vendors crons/evals as content, not context", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".oh/context/REPO_MAP.md"))).toBe(false);
    expect(existsSync(join(t, "crons/heartbeat.md"))).toBe(true);
    expect(existsSync(join(t, ".oh/crons"))).toBe(false);
    expect(readdirSync(join(t, ".oh/evals")).length).toBeGreaterThan(0);
  });

  it("full (default): seeds tasks/ EMPTY (README stub only)", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(readdirSync(join(t, ".oh/tasks"))).toEqual(["README.md"]);
    expect(existsSync(join(t, ".oh/memory"))).toBe(false);
  });

  it("full (default): copies the full .devcontainer/ + a local-build devcontainer.json", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".devcontainer/Dockerfile"))).toBe(true);
    expect(existsSync(join(t, ".devcontainer/docker-compose.yml"))).toBe(true);
    expect(existsSync(join(t, ".devcontainer/entrypoint.sh"))).toBe(true);

    const dc = JSON.parse(
      readFileSync(join(t, ".devcontainer/devcontainer.json"), "utf8"),
    );
    expect(dc.dockerComposeFile).toBe("docker-compose.yml");
    expect(dc.service).toBe("sandbox");
    expect(dc.workspaceFolder).toBe("/home/sandbox/harness");
    expect(dc.image).toBeUndefined();
    expect(dc["// image"]).toContain("ghcr.io/mifunedev/openharness");

    const compose = readFileSync(join(t, ".devcontainer/docker-compose.yml"), "utf8");
    expect(compose).toContain("context: ..");
    expect(compose).not.toContain("context: ../..");

    expect(compose).toContain("/home/sandbox/harness");
  });

  it("--minimal: thin scaffold only (no full devcontainer, no empty seeds, no workspace)", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true, minimal: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".oh/manifest.json"))).toBe(true);
    expect(existsSync(join(t, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(t, ".devcontainer/Dockerfile"))).toBe(false);
    expect(existsSync(join(t, ".oh/tasks/README.md"))).toBe(false);
    const dc = JSON.parse(
      readFileSync(join(t, ".devcontainer/devcontainer.json"), "utf8"),
    );
    expect(dc.image).toContain("ghcr.io/mifunedev/openharness");
    expect(dc.dockerComposeFile).toBeUndefined();
  });

  it("never writes secret files (.env / auth.json) under --yes full init", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) walk(p);
        else if (e.name === ".env" || e.name === "auth.json") offenders.push(p);
      }
    };
    walk(t);
    expect(offenders).toEqual([]);
  });

  it("vendored manifest excludes secret files from the payload", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const m = JSON.parse(readFileSync(join(t, ".oh/manifest.json"), "utf8"));
    expect(m.exclude).toContain("**/.env");
    expect(m.exclude).toContain("**/auth.json");
    expect(m.rootInclude).toEqual(["crons/**"]);
    expect(m.include).not.toContain("crons/**");
    expect(m.include).toEqual(
      expect.arrayContaining([
        "evals/**",
        "skills/**",
        "hooks/**",
      ]),
    );
    expect(m.include).not.toContain("context/**");
    expect(m.include).not.toContain("agents/**");
  });


  it("full (default): writes the project AGENTS.md-lite", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const agents = readFileSync(join(t, "AGENTS.md"), "utf8");
    expect(agents).toContain("your OpenHarness project");
    expect(agents).toContain("Internal repo map");
    expect(agents).not.toMatch(/^## (How work flows|Skills)$/m);
    expect(agents).not.toMatch(/`\/[a-z][a-z0-9-]*/);
  });

  it("full (default): CLAUDE.md is a symlink -> AGENTS.md", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const claude = join(t, "CLAUDE.md");
    expect(lstatSync(claude).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claude)).toBe("AGENTS.md");
    expect(readFileSync(claude, "utf8")).toBe(readFileSync(join(t, "AGENTS.md"), "utf8"));
  });

  it("--copy-claude: CLAUDE.md is a real file copy, not a symlink", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true, copyClaude: true }), makeIO().io)).toBe(0);
    const claude = join(t, "CLAUDE.md");
    expect(lstatSync(claude).isSymbolicLink()).toBe(false);
    expect(readFileSync(claude, "utf8")).toBe(readFileSync(join(t, "AGENTS.md"), "utf8"));
  });

  it("full (default): vendors the skill pack into .oh/ and writes NO submodule", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".gitmodules"))).toBe(false);
    expect(existsSync(join(t, ".mifune"))).toBe(false);
    expect(existsSync(join(t, ".oh/skills/git/SKILL.md"))).toBe(true);
    expect(existsSync(join(t, ".oh/skills.lock"))).toBe(true);
  });

  it("full (default): scaffolds curated provider config surfaces", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    for (const rel of [
      ".claude/settings.json",
      ".claude/protected-paths.txt",
      ".claude/.example.env.claude",
      ".codex/config.toml",
      ".codex/hooks.json",
      ".codex/hooks/deny-env-dump.sh",
      ".codex/hooks/deny-local-settings.sh",
      ".pi/settings.json",
      ".pi/APPEND_SYSTEM.md",
      ".hermes/config.yaml",
      ".hermes/SOUL.md",
      ".hermes/README.md",
    ]) {
      expect(existsSync(join(t, rel))).toBe(true);
    }
    const cs = JSON.parse(readFileSync(join(t, ".claude/settings.json"), "utf8"));
    expect(cs.enabledMcpjsonServers).toBeUndefined();
    expect(statSync(join(t, ".codex/hooks/deny-env-dump.sh")).mode & 0o111).not.toBe(0);
    expect(statSync(join(t, ".codex/hooks/deny-local-settings.sh")).mode & 0o111).not.toBe(0);
  });

  it("full (default): creates provider skill/agent/hook symlinks", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const links: [string, string][] = [
      [".claude/skills", "../.oh/skills"],
      [".claude/hooks", "../.oh/hooks"],
      [".codex/skills", "../.oh/skills"],
      [".pi/skills", "../.oh/skills"],
    ];
    for (const [rel, target] of links) {
      const p = join(t, rel);
      expect(lstatSync(p).isSymbolicLink()).toBe(true);
      expect(readlinkSync(p)).toBe(target);
    }
  });

  it("provider symlinks resolve into the vendored .oh/skills pack", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".claude/skills/git/SKILL.md"))).toBe(true);
    expect(existsSync(join(t, ".codex/skills/git/SKILL.md"))).toBe(true);
    expect(existsSync(join(t, ".pi/skills/git/SKILL.md"))).toBe(true);
  });

  it("--minimal: no CLAUDE.md / .gitmodules / provider surfaces", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true, minimal: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(t, ".gitmodules"))).toBe(false);
    expect(existsSync(join(t, ".claude/settings.json"))).toBe(false);
    expect(existsSync(join(t, ".codex/config.toml"))).toBe(false);
    expect(existsSync(join(t, ".pi/settings.json"))).toBe(false);
  });


  it("--dry-run previews the WHOLE full plan and writes nothing", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();
    const code = await runInit(opts(t, { yes: true, dryRun: true }), io);

    expect(code).toBe(0);
    for (const line of out) expect(line.startsWith("[dry-run] ")).toBe(true);
    const joined = out.join("");
    expect(joined).toContain("create .devcontainer/Dockerfile");
    expect(joined).toContain("create .devcontainer/devcontainer.json");
    expect(joined).toContain("create CLAUDE.md");
    expect(joined).toContain("create .claude/settings.json");
    expect(joined).toContain("create .claude/skills");
    expect(joined).toContain("create .oh/skills/git/SKILL.md");
    expect(joined).toContain("create .oh/tasks/README.md");
    expect(existsSync(join(t, ".oh"))).toBe(false);
    expect(existsSync(join(t, ".devcontainer"))).toBe(false);
    expect(existsSync(join(t, ".gitmodules"))).toBe(false);
    expect(existsSync(join(t, ".claude"))).toBe(false);
    expect(readdirSync(t)).toHaveLength(0);
  });

  it("vendor noise is summarized by default; --verbose lists it", async () => {
    const quiet = freshTmp();
    const q = makeIO();
    expect(await runInit(opts(quiet, { yes: true }), q.io)).toBe(0);
    expect(q.out.join("")).not.toContain("(not in payload)");

    const loud = freshTmp();
    const l = makeIO();
    expect(await runInit(opts(loud, { yes: true, verbose: true }), l.io)).toBe(0);
    expect(l.out.join("")).toContain("(not in payload)");
  });

  it(".gitignore union includes provider runtime/secret ignores", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const gi = readFileSync(join(t, ".gitignore"), "utf8")
      .split("\n")
      .map((l) => l.trimEnd());
    for (const entry of [
      "/.env",
      "!/.env.example",
      ".claude/.env.claude",
      ".hermes/.env",
      ".hermes/auth.json",
      ".oh/cli/dist/",
      ".oh/cli/node_modules/",
    ]) {
      expect(gi).toContain(entry);
    }
  });

  it("idempotent full re-run leaves the tree byte-identical", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const ohBefore = listOh(t);
    const giBefore = readFileSync(join(t, ".gitignore"), "utf8");
    const agentsBefore = readFileSync(join(t, "AGENTS.md"), "utf8");

    const { io, out } = makeIO();
    expect(await runInit(opts(t, { yes: true }), io)).toBe(0);
    for (const line of out) expect(line.trim().startsWith("skip ")).toBe(true);
    expect(listOh(t)).toEqual(ohBefore);
    expect(readFileSync(join(t, ".gitignore"), "utf8")).toBe(giBefore);
    expect(readFileSync(join(t, "AGENTS.md"), "utf8")).toBe(agentsBefore);
  });

  it("--force re-writes provider config + reports overwrite", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    writeFileSync(join(t, ".claude/settings.json"), "{ \"sentinel\": true }\n");

    const { io, out } = makeIO();
    expect(await runInit(opts(t, { yes: true, force: true }), io)).toBe(0);
    expect(out.some((l) => l.includes("overwrite .claude/settings.json"))).toBe(true);
    const cs = JSON.parse(readFileSync(join(t, ".claude/settings.json"), "utf8"));
    expect(cs.sentinel).toBeUndefined();
    expect(cs.permissions).toBeDefined();
  });
});
