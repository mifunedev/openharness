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

/** Sorted POSIX relpaths of every file under `<root>/.oh/`. */
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

// THREE levels up from src/__tests__/ to reach .oh/, then into templates.
// (Two levels would wrongly resolve .oh/cli/templates.)
const TEMPLATES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../templates",
);

// The repo's own `.oh/` — the vendor source. THREE levels up from src/__tests__/.
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
      { targetDir: t, templatesDir: onlyReadme, sourceOhDir: SOURCE_OH },
      io,
    );

    expect(code).toBe(0);
    // Template scaffold writes nothing (only README.md, which is skipped).
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
    expect(parsed.workspaceFolder).toBe("/home/sandbox/harness");
  });

  // --- US-001 vendor ---------------------------------------------------------

  it("vendor: init --yes populates .oh/ with manifest-shipped files, excludes volatile", async () => {
    const t = freshTmp();
    const { io } = makeIO();
    const code = await runInit(opts(t, { yes: true }), io);

    expect(code).toBe(0);
    expect(existsSync(join(t, ".oh/manifest.json"))).toBe(true);
    expect(existsSync(join(t, ".oh/README.md"))).toBe(true);
    expect(existsSync(join(t, ".oh/cli/package.json"))).toBe(true);
    expect(existsSync(join(t, ".oh/cli/src/cli.ts"))).toBe(true);
    expect(existsSync(join(t, ".oh/templates/harness.yaml"))).toBe(true);
    expect(existsSync(join(t, ".oh/legal/herdr/NOTICE"))).toBe(true);
    expect(existsSync(join(t, ".oh/legal/herdr/SOURCE-OFFER"))).toBe(true);
    // Volatile build artifacts are never shipped.
    expect(existsSync(join(t, ".oh/cli/node_modules"))).toBe(false);
    expect(existsSync(join(t, ".oh/cli/dist"))).toBe(false);
    // The devcontainer lives at .devcontainer/, never vendored under .oh/.
    expect(existsSync(join(t, ".oh/devcontainer"))).toBe(false);
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
    // Nothing vendored on the precondition failure.
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

  // --- US-002 wizard ---------------------------------------------------------

  it("wizard: injected answers land in harness.yaml + .env; secrets stay out of harness.yaml; untouched lines byte-identical", async () => {
    const t = freshTmp();
    const ask = async (q: string): Promise<string> => {
      if (q.includes("Sandbox name")) return "my-cool-sandbox";
      if (q.includes("Timezone")) return "America/New_York";
      if (q.includes("Git user name")) return "Ada Lovelace";
      if (q.includes("Git user email")) return "ada@example.com";
      if (q.includes("agent_browser")) return "y";
      return ""; // decline other installs / accept blank text defaults
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

    // yes:false + injected reader → wizard runs even without a TTY.
    const code = await runInit(opts(t, { yes: false }), io);
    expect(code).toBe(0);

    const hy = readFileSync(join(t, "harness.yaml"), "utf8");
    // Set keys are uncommented AND given the answer value.
    expect(hy).toMatch(/^  name: my-cool-sandbox/m);
    expect(hy).toMatch(/^  timezone: America\/New_York/m);
    expect(hy).toMatch(/^  user_name: Ada Lovelace/m);
    expect(hy).toMatch(/^  user_email: ada@example.com/m);
    expect(hy).toMatch(/^  agent_browser: true/m);
    // A declined install stays commented (default applies).
    expect(hy).toMatch(/^  # hermes: false/m);
    // Secrets are NEVER written to harness.yaml.
    expect(hy).not.toContain("ghp_supersecrettoken12345");
    expect(hy).not.toContain("GH_TOKEN");

    // Every line whose key the user did NOT set is byte-identical to the template.
    const tmpl = readFileSync(join(TEMPLATES, "harness.yaml"), "utf8").split("\n");
    const result = hy.split("\n");
    expect(result).toHaveLength(tmpl.length);
    const touched = new Set([
      "name",
      "timezone",
      "user_name",
      "user_email",
      "agent_browser",
    ]);
    for (let i = 0; i < tmpl.length; i++) {
      const m = tmpl[i].match(/^\s*#\s?([A-Za-z0-9_]+)\s*:/);
      const key = m ? m[1] : undefined;
      if (key && touched.has(key)) continue;
      expect(result[i]).toBe(tmpl[i]);
    }

    // Secret lands in .devcontainer/.env only.
    const env = readFileSync(join(t, ".devcontainer/.env"), "utf8");
    expect(env).toContain("GH_TOKEN=ghp_supersecrettoken12345");
  });

  it("wizard: --yes skips the wizard even when a reader is injected", async () => {
    const t = freshTmp();
    let asked = 0;
    const io: InitIO = {
      stdout: () => {},
      stderr: () => {},
      ask: async () => {
        asked++;
        return "should-not-be-asked";
      },
      askSecret: async () => "",
    };
    const code = await runInit(opts(t, { yes: true }), io);

    expect(code).toBe(0);
    expect(asked).toBe(0);
    // Template default left commented (nothing uncommented).
    const hy = readFileSync(join(t, "harness.yaml"), "utf8");
    expect(hy).toMatch(/^  # name: my-project/m);
    expect(existsSync(join(t, ".devcontainer/.env"))).toBe(false);
  });

  // --- Full scaffold (P2: vendor content + empty seeds + full devcontainer) ---

  it("full (default): vendors context/crons/evals as content", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, ".oh/context/REPO_MAP.md"))).toBe(true);
    expect(existsSync(join(t, ".oh/crons/heartbeat.md"))).toBe(true);
    // evals/ ships its probe suite as content.
    expect(readdirSync(join(t, ".oh/evals")).length).toBeGreaterThan(0);
  });

  it("full (default): seeds memory/ and tasks/ EMPTY (README stub only)", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(readdirSync(join(t, ".oh/memory"))).toEqual(["README.md"]);
    expect(readdirSync(join(t, ".oh/tasks"))).toEqual(["README.md"]);
    // This harness's own MEMORY.md / PRDs are never shipped.
    expect(existsSync(join(t, ".oh/memory/MEMORY.md"))).toBe(false);
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
    // The ghcr image is present ONLY as a documented fallback key, never active.
    expect(dc.image).toBeUndefined();
    expect(dc["// image"]).toContain("ghcr.io/mifunedev/openharness");

    // The relocated compose build context targets the repo root (one level up).
    const compose = readFileSync(join(t, ".devcontainer/docker-compose.yml"), "utf8");
    expect(compose).toContain("context: ..");
    expect(compose).not.toContain("context: ../..");

    // The compose file is copied VERBATIM: its workspace path stays the
    // parameterized `${OH_PROJECT_ROOT:-/home/sandbox/harness}` default, which
    // resolves to the harness path — no per-target rewrite is applied.
    expect(compose).toContain("/home/sandbox/harness");
  });

  it("full (default): seeds a workspace/ stub for the image build", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    expect(existsSync(join(t, "workspace/README.md"))).toBe(true);
  });

  it("--minimal: thin scaffold only (no full devcontainer, no empty seeds, no workspace)", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true, minimal: true }), makeIO().io)).toBe(0);
    // Thin compat files + vendored .oh/ are still present.
    expect(existsSync(join(t, ".oh/manifest.json"))).toBe(true);
    expect(existsSync(join(t, "AGENTS.md"))).toBe(true);
    // Full-scaffold-only artifacts are absent.
    expect(existsSync(join(t, ".devcontainer/Dockerfile"))).toBe(false);
    expect(existsSync(join(t, ".oh/memory/README.md"))).toBe(false);
    expect(existsSync(join(t, "workspace/README.md"))).toBe(false);
    // The thin devcontainer.json stub is image-based (no dockerComposeFile).
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
    expect(m.include).toEqual(
      expect.arrayContaining([
        "context/**",
        "crons/**",
        "evals/**",
        "skills/**",
        "agents/**",
        "hooks/**",
      ]),
    );
  });

  // --- Full scaffold (P3: AGENTS-lite + CLAUDE + vendored skill pack + providers) -

  it("full (default): writes the project AGENTS.md-lite", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const agents = readFileSync(join(t, "AGENTS.md"), "utf8");
    expect(agents).toContain("your OpenHarness project");
    expect(agents).toContain("Internal repo map");
    expect(agents).toContain("/spec");
  });

  it("full (default): CLAUDE.md is a symlink -> AGENTS.md", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const claude = join(t, "CLAUDE.md");
    expect(lstatSync(claude).isSymbolicLink()).toBe(true);
    expect(readlinkSync(claude)).toBe("AGENTS.md");
    // Resolves to the same content as AGENTS.md.
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
    // The skills/agents/hooks pack is vendored directly — no submodule, no .gitmodules.
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
      ".pi/settings.json",
      ".pi/APPEND_SYSTEM.md",
      ".hermes/config.yaml",
      ".hermes/SOUL.md",
      ".hermes/README.md",
    ]) {
      expect(existsSync(join(t, rel))).toBe(true);
    }
    // settings.json is valid JSON and is the trimmed project default (no MCP / Slack).
    const cs = JSON.parse(readFileSync(join(t, ".claude/settings.json"), "utf8"));
    expect(cs.enabledMcpjsonServers).toBeUndefined();
    // The codex hook keeps its +x bit.
    expect(statSync(join(t, ".codex/hooks/deny-env-dump.sh")).mode & 0o111).not.toBe(0);
  });

  it("full (default): creates provider skill/agent/hook symlinks", async () => {
    const t = freshTmp();
    expect(await runInit(opts(t, { yes: true }), makeIO().io)).toBe(0);
    const links: [string, string][] = [
      [".claude/skills", "../.oh/skills"],
      [".claude/agents", "../.oh/agents"],
      [".claude/hooks", "../.oh/hooks"],
      [".codex/skills", "../.oh/skills"],
      [".codex/agents", "../.claude/agents"],
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
    // No DI/fake needed: the skill pack is vendored with .oh/, so the provider
    // symlinks resolve immediately — no submodule materialization step.
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

  // --- Full scaffold (P4: dry-run plan, verbose, gitignore union, idempotency)-

  it("--dry-run previews the WHOLE full plan and writes nothing", async () => {
    const t = freshTmp();
    const { io, out } = makeIO();
    const code = await runInit(opts(t, { yes: true, dryRun: true }), io);

    expect(code).toBe(0);
    for (const line of out) expect(line.startsWith("[dry-run] ")).toBe(true);
    // The plan covers every full-scaffold surface.
    const joined = out.join("");
    expect(joined).toContain("create .devcontainer/Dockerfile");
    expect(joined).toContain("create .devcontainer/devcontainer.json");
    expect(joined).toContain("create CLAUDE.md");
    expect(joined).toContain("create .claude/settings.json");
    expect(joined).toContain("create .claude/skills");
    // The vendored skill pack ships with the .oh/ payload (no submodule).
    expect(joined).toContain("create .oh/skills/git/SKILL.md");
    expect(joined).toContain("create .oh/memory/README.md");
    // Nothing was written.
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
      ".devcontainer/.env",
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
    // Every per-file action is a skip.
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
