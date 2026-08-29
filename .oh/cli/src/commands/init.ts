import {
  existsSync,
  statSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
  readlinkSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { loadManifest } from "../lib/manifest.js";
import { copyOhPayload, copyRootPayload, type CopyReport } from "../lib/vendor.js";
import { loadEnvInto } from "../lib/env.js";
import {
  defaultOhConfig,
  ohConfigPath,
  readOhConfig,
  validateOhConfig,
  writeOhConfig,
  type OhConfig,
} from "../lib/oh-config.js";
import { isSecretKey, setSecret } from "../lib/secrets.js";
import type { LifecycleRunner } from "../lib/execution/runner.js";
import { runConfigRepo } from "./config.js";
import * as prompt from "../lib/prompt.js";

export interface InitIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  ask?: (q: string) => Promise<string>;
  askSecret?: (q: string) => Promise<string>;
  isTTY?: boolean;
}

export interface InitOptions {
  targetDir: string;
  templatesDir: string;
  sourceOhDir?: string;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  minimal?: boolean;
  copyClaude?: boolean;
  verbose?: boolean;
  run?: LifecycleRunner;
}

function walkFiles(root: string, dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, abs, acc);
    } else if (entry.isFile()) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      acc.push(rel);
    }
  }
}

export async function runInit(
  opts: InitOptions,
  io: InitIO,
): Promise<number> {
  const t = path.resolve(opts.targetDir);
  const templatesDir = path.resolve(opts.templatesDir);
  const dryRun = opts.dryRun === true;
  const force = opts.force === true;
  const minimal = opts.minimal === true;
  const copyClaude = opts.copyClaude === true;
  const verbose = opts.verbose === true;
  const prefix = dryRun ? "[dry-run] " : "";
  const report = (line: string): void => io.stdout(`${prefix}${line}\n`);
  const stats = { created: 0, overwritten: 0, skipped: 0 };

  if (!existsSync(templatesDir) || !statSync(templatesDir).isDirectory()) {
    io.stderr(
      `oh init: scaffold templates not found at ${templatesDir}. Pass --templates <dir>, run from a built OpenHarness checkout, or use --from-remote to fetch one.\n`,
    );
    return 1;
  }

  if (existsSync(t) && !statSync(t).isDirectory()) {
    io.stderr(`oh init: target path is a file, not a directory: ${t}\n`);
    return 1;
  }

  const sourceOh = opts.sourceOhDir ? path.resolve(opts.sourceOhDir) : "";
  if (!sourceOh || !existsSync(sourceOh) || !statSync(sourceOh).isDirectory()) {
    io.stderr(
      `oh init: vendor source .oh/ not found${sourceOh ? ` at ${sourceOh}` : ""}. ` +
        `Pass --from <built-OpenHarness-checkout> or --from-remote; ` +
        `installed-binary payload bundling is gated on publishing (#564).\n`,
    );
    return 1;
  }

  if (!existsSync(t) && !dryRun) {
    mkdirSync(t, { recursive: true });
  }

  const relpaths: string[] = [];
  walkFiles(templatesDir, templatesDir, relpaths);
  const files = relpaths
    .filter((r) => r !== "README.md")
    .filter((r) => r !== "full" && !r.startsWith("full/"))
    .filter((r) => minimal || r !== ".devcontainer/devcontainer.json")
    .sort();

  for (const R of files) {
    const src = path.join(templatesDir, R);

    if (R === "gitignore") {
      appendGitignore(src, t, dryRun, report);
      continue;
    }

    const resolved = path.resolve(t, R);
    if (!(resolved === t || resolved.startsWith(t + path.sep))) {
      throw new Error(
        `oh init: refusing to write outside target dir: ${R} -> ${resolved}`,
      );
    }

    if (existsSync(resolved)) {
      if (force) {
        if (!dryRun) {
          mkdirSync(path.dirname(resolved), { recursive: true });
          copyFileSync(src, resolved);
        }
        report(`overwrite ${R}`);
      } else {
        report(`skip ${R} (exists)`);
      }
    } else {
      if (!dryRun) {
        mkdirSync(path.dirname(resolved), { recursive: true });
        copyFileSync(src, resolved);
      }
      report(`create ${R}`);
    }
  }

  const targetOh = path.join(t, ".oh");
  const manifest = loadManifest(sourceOh);
  if (manifest === null) {
    report("oh init: no .oh/manifest.json in source; vendoring all of .oh/ (legacy mode)");
  }

  let vCreated = 0;
  let vOverwritten = 0;
  let vFiltered = 0;
  const vReport: CopyReport = (action, rel) => {
    const r = `.oh/${rel}`;
    switch (action) {
      case "create":
        report(`create ${r}`);
        vCreated++;
        break;
      case "overwrite":
        report(`overwrite ${r}`);
        vOverwritten++;
        break;
      case "skip-exists":
        report(`skip ${r} (exists)`);
        stats.skipped++;
        break;
      case "skip-not-in-payload":
        if (verbose) report(`skip ${r} (not in payload)`);
        vFiltered++;
        break;
      case "skip-volatile":
        if (verbose) report(`skip ${r} (volatile)`);
        vFiltered++;
        break;
    }
  };
  copyOhPayload(
    sourceOh,
    targetOh,
    manifest,
    { force, dryRun, skipExisting: !force },
    vReport,
  );

  const rootReport: CopyReport = (action, rel) => {
    switch (action) {
      case "create":
        report(`create ${rel}`);
        vCreated++;
        break;
      case "overwrite":
        report(`overwrite ${rel}`);
        vOverwritten++;
        break;
      case "skip-exists":
        report(`skip ${rel} (exists)`);
        stats.skipped++;
        break;
      case "skip-not-in-payload":
        if (verbose) report(`skip ${rel} (not in payload)`);
        vFiltered++;
        break;
      case "skip-volatile":
        if (verbose) report(`skip ${rel} (volatile)`);
        vFiltered++;
        break;
    }
  };
  copyRootPayload(
    path.dirname(sourceOh),
    t,
    manifest,
    { force, dryRun, skipExisting: !force },
    rootReport,
  );

  const wr: WriteCtx = { t, dryRun, force, report, stats };

  if (!minimal) {
    writeGenerated(
      wr,
      ".oh/tasks/README.md",
      "# tasks/\n\nPer-task `tasks/<slug>/` folders (PRD + plan + critique + " +
        "prd.json) produced by `/spec plan` and consumed by `/spec execute`.\n",
    );

    const sourceDevcontainer = path.join(sourceOh, "..", ".devcontainer");
    if (existsSync(sourceDevcontainer) && statSync(sourceDevcontainer).isDirectory()) {
      copyDevcontainer(sourceDevcontainer, wr);
      writeGenerated(wr, ".devcontainer/devcontainer.json", DEVCONTAINER_JSON);
    } else {
      prompt.warn(
        `Source devcontainer not found at ${sourceDevcontainer}; skipped full .devcontainer/ scaffold.`,
      );
    }

    writeClaudeAlias(wr, copyClaude);
    writeNestedClaudeAliases(wr, [templatesDir, path.join(sourceOh, "..")]);

    const fullTemplates = path.join(templatesDir, "full");
    if (existsSync(fullTemplates) && statSync(fullTemplates).isDirectory()) {
      const rels: string[] = [];
      collectRealFiles(fullTemplates, fullTemplates, rels);
      rels.sort();
      for (const rel of rels) {
        copyFileReport(wr, path.join(fullTemplates, rel), rel);
      }
    }

    for (const [linkRel, linkTarget] of PROVIDER_LINKS) {
      linkReport(wr, linkRel, linkTarget);
    }
  }

  const interactive =
    opts.yes !== true && (process.stdin.isTTY === true || io.ask !== undefined);
  const askFn = io.ask ?? prompt.ask;

  const configPath = ohConfigPath(t);
  const config: OhConfig = existsSync(configPath)
    ? readOhConfig(configPath)
    : defaultOhConfig(path.basename(t));
  const secrets: Record<string, string> = {};

  const legacy = readLegacyDevcontainerEnv(t);
  if (legacy) {
    for (const [key, value] of legacy.vars) {
      if (isSecretKey(key)) {
        secrets[key] = value;
        legacy.movedSecrets.push(key);
      } else if (applyEnvToConfig(config, key, value)) {
        legacy.movedSettings.push(key);
      } else {
        legacy.unrecognised.push(key);
      }
    }
  }

  if (interactive) {
    await runWizard(io, config, secrets);
  }

  writeConfigFile(wr, config);

  const secretKeys = Object.keys(secrets).sort();
  if (secretKeys.length > 0) {
    if (!dryRun) {
      for (const key of secretKeys) setSecret(t, key, secrets[key]);
    }
    report(`update .env (${secretKeys.length} secret${secretKeys.length === 1 ? "" : "s"})`);
  }

  if (legacy) {
    report(
      `migrate .devcontainer/.env (${legacy.movedSecrets.length} secret${
        legacy.movedSecrets.length === 1 ? "" : "s"
      } -> .env, ${legacy.movedSettings.length} setting${
        legacy.movedSettings.length === 1 ? "" : "s"
      } -> oh.json)`,
    );
    for (const key of legacy.unrecognised) {
      io.stderr(
        `oh init: ${key} in .devcontainer/.env is neither an oh.json setting nor a known secret; ` +
          `left in place — move it yourself, then delete .devcontainer/.env.\n`,
      );
    }
    const retire =
      legacy.unrecognised.length === 0 &&
      !dryRun &&
      interactive &&
      (await confirmWith(
        askFn,
        "Replace the migrated .devcontainer/.env with a symlink to ../.env?",
        false,
      ));
    if (retire) {
      rmSync(legacy.path, { force: true });
      report("remove .devcontainer/.env (migrated)");
    } else {
      report("keep .devcontainer/.env (not removed)");
    }
  }

  if (!minimal && !isRealFile(path.join(t, ".devcontainer", ".env"))) {
    linkReport(wr, ".devcontainer/.env", "../.env");
  }

  if (dryRun) {
    prompt.info("");
    prompt.ok(`Dry run complete — previewed the ${minimal ? "minimal" : "full"} plan, wrote nothing.`);
    prompt.info("Re-run without --dry-run to apply.");
    return 0;
  }

  const repoStepAllowed =
    interactive && !dryRun && (io.isTTY ?? process.stdin.isTTY === true);
  if (repoStepAllowed) {
    prompt.step(5, 5, "Your own repo (optional)");
    await runConfigRepo(
      { cwd: t, run: opts.run },
      { stdout: io.stdout, stderr: io.stderr, ask: io.ask, isTTY: true },
    );
  }

  const totalOverwritten = vOverwritten + stats.overwritten;
  prompt.header(`OpenHarness ${minimal ? "minimal" : "full"} scaffold — done`);
  prompt.ok(`Vendored .oh/ (${vCreated + vOverwritten} files)`);
  if (vFiltered > 0 && !verbose) {
    prompt.info(`  (${vFiltered} non-payload source file(s) skipped — pass --verbose to list)`);
  }
  if (!minimal) {
    prompt.ok("Wrote AGENTS.md + CLAUDE.md and seeded an empty tasks/");
    prompt.ok("Copied the full .devcontainer/ (local image build)");
    prompt.ok(
      "Configured 5 provider surfaces (.claude .codex .pi .prime .hermes) → vendored .oh/skills",
    );
  }
  if (force && totalOverwritten > 0) {
    prompt.warn(`--force overwrote ${totalOverwritten} existing file(s).`);
  }

  prompt.header("Next steps");
  if (!minimal) {
    prompt.ok("Provider skills are live — symlinks resolve into the vendored .oh/skills.");
    prompt.info("  1. Put secrets in the project-root dotenv (gitignored — never commit them)");
    prompt.info("  2. Build + start the sandbox:  oh sandbox");
    prompt.info("       (or: docker compose -f .devcontainer/docker-compose.yml up -d --build)");
    prompt.info("  3. Connect to the sandbox:  oh shell");
    prompt.info("  4. Build the CLI:  cd .oh/cli && npm install && npm run build");
    prompt.info("  5. Commit .oh/ (incl. .oh/skills) and the provider surfaces + AGENTS.md");
  } else {
    prompt.info(".oh/ is your portable control plane — commit it to your repo.");
    prompt.info("Build the CLI:  cd .oh/cli && npm install && npm run build");
    prompt.info("Re-run `oh init` (full, default) for the complete scaffold.");
  }

  return 0;
}


interface WriteCtx {
  t: string;
  dryRun: boolean;
  force: boolean;
  report: (line: string) => void;
  stats: { created: number; overwritten: number; skipped: number };
}

function assertInTarget(dest: string, t: string): void {
  if (!(dest === t || dest.startsWith(t + path.sep))) {
    throw new Error(`oh init: refusing to write outside target dir: ${dest}`);
  }
}

function writeGenerated(ctx: WriteCtx, rel: string, content: string): void {
  const dest = path.resolve(ctx.t, rel);
  assertInTarget(dest, ctx.t);
  if (existsSync(dest)) {
    if (ctx.force) {
      if (!ctx.dryRun) {
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, content, "utf8");
      }
      ctx.report(`overwrite ${rel}`);
      ctx.stats.overwritten++;
    } else {
      ctx.report(`skip ${rel} (exists)`);
      ctx.stats.skipped++;
    }
  } else {
    if (!ctx.dryRun) {
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, content, "utf8");
    }
    ctx.report(`create ${rel}`);
    ctx.stats.created++;
  }
}

function copyFileReport(ctx: WriteCtx, src: string, rel: string): void {
  const dest = path.resolve(ctx.t, rel);
  assertInTarget(dest, ctx.t);
  const exists = existsSync(dest);
  if (exists && !ctx.force) {
    ctx.report(`skip ${rel} (exists)`);
    ctx.stats.skipped++;
    return;
  }
  if (!ctx.dryRun) {
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    if (rel.endsWith(".sh")) chmodSync(dest, 0o755);
  }
  ctx.report(exists ? `overwrite ${rel}` : `create ${rel}`);
  if (exists) ctx.stats.overwritten++;
  else ctx.stats.created++;
}

function copyDevcontainer(srcDir: string, ctx: WriteCtx): void {
  const skip = new Set([
    "devcontainer.json",
    ".example.env",
    ".env",
    ".harness.yaml.env",
  ]);
  const rels: string[] = [];
  collectRealFiles(srcDir, srcDir, rels);
  rels.sort();
  for (const rel of rels) {
    if (skip.has(rel) || rel.startsWith(".env")) continue;
    const src = path.join(srcDir, rel);
    const destRel = `.devcontainer/${rel}`;
    copyFileReport(ctx, src, destRel);
  }
}

function collectRealFiles(root: string, dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (lstatSync(abs).isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      collectRealFiles(root, abs, acc);
    } else if (entry.isFile()) {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
}

const DEVCONTAINER_JSON = `${JSON.stringify(
  {
    name: "openharness-project",
    dockerComposeFile: "docker-compose.yml",
    service: "sandbox",
    workspaceFolder: "/home/sandbox/harness",
    remoteUser: "sandbox",
    shutdownAction: "stopCompose",
    "//":
      "Local build is the DEFAULT (see docker-compose.yml `build:`). To use the published image instead, drop dockerComposeFile/service/shutdownAction and add: \"image\": \"ghcr.io/mifunedev/openharness:latest\".",
    "// image": "ghcr.io/mifunedev/openharness:latest",
  },
  null,
  2,
)}\n`;

const PROVIDER_LINKS: [string, string][] = [
  [".pi/skills", "../.oh/skills"],
  [".claude/skills", "../.oh/skills"],
  [".codex/skills", "../.oh/skills"],
  [".claude/agents", "../.oh/agents"],
  [".claude/hooks", "../.oh/hooks"],
  [".codex/agents", "../.claude/agents"],
  [".codex/specs", "../.claude/specs"],
  [".prime/agent/skills", "../../.oh/skills"],
];

function linkReport(ctx: WriteCtx, linkRel: string, linkTarget: string): void {
  const dest = path.resolve(ctx.t, linkRel);
  assertInTarget(dest, ctx.t);
  let exists = false;
  try {
    lstatSync(dest);
    exists = true;
  } catch {
  }
  if (exists) {
    let current: string | null = null;
    try {
      current = readlinkSync(dest);
    } catch {
    }
    if (current === linkTarget) {
      ctx.report(`skip ${linkRel} (exists)`);
      ctx.stats.skipped++;
      return;
    }
    if (!ctx.force) {
      ctx.report(`skip ${linkRel} (exists)`);
      ctx.stats.skipped++;
      return;
    }
    if (!ctx.dryRun) {
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(path.dirname(dest), { recursive: true });
      symlinkSync(linkTarget, dest);
    }
    ctx.report(`overwrite ${linkRel}`);
    ctx.stats.overwritten++;
    return;
  }
  if (!ctx.dryRun) {
    mkdirSync(path.dirname(dest), { recursive: true });
    symlinkSync(linkTarget, dest);
  }
  ctx.report(`create ${linkRel}`);
  ctx.stats.created++;
}

const NESTED_AGENTS_DIRS = [".worktrees", "projects", "crons"];

function writeNestedClaudeAliases(ctx: WriteCtx, sourceRoots: string[]): void {
  for (const dir of NESTED_AGENTS_DIRS) {
    const guide = path.join(dir, "AGENTS.md");
    const shipped = sourceRoots.some((root) => existsSync(path.join(root, guide)));
    if (!shipped && !existsSync(path.join(ctx.t, guide))) continue;
    linkReport(ctx, `${dir}/CLAUDE.md`, "AGENTS.md");
  }
}

function writeClaudeAlias(ctx: WriteCtx, copyClaude: boolean): void {
  if (!copyClaude) {
    linkReport(ctx, "CLAUDE.md", "AGENTS.md");
    return;
  }
  const dest = path.resolve(ctx.t, "CLAUDE.md");
  assertInTarget(dest, ctx.t);
  if (existsSync(dest) && !ctx.force) {
    ctx.report("skip CLAUDE.md (exists)");
    ctx.stats.skipped++;
    return;
  }
  const exists = existsSync(dest);
  if (!ctx.dryRun) {
    const agents = path.join(ctx.t, "AGENTS.md");
    const body = existsSync(agents) ? readFileSync(agents, "utf8") : "";
    writeFileSync(dest, body, "utf8");
  }
  ctx.report(`${exists ? "overwrite" : "create"} CLAUDE.md (copy of AGENTS.md)`);
  if (exists) ctx.stats.overwritten++;
  else ctx.stats.created++;
}


interface LegacyEnv {
  path: string;
  vars: [string, string][];
  movedSecrets: string[];
  movedSettings: string[];
  unrecognised: string[];
}

function isRealFile(file: string): boolean {
  try {
    return lstatSync(file).isFile();
  } catch {
    return false;
  }
}

function readLegacyDevcontainerEnv(t: string): LegacyEnv | undefined {
  const file = path.join(t, ".devcontainer", ".env");
  if (!isRealFile(file)) return undefined;
  const env: Record<string, string | undefined> = {};
  loadEnvInto(file, env);
  const vars: [string, string][] = [];
  for (const [key, raw] of Object.entries(env)) {
    const value = stripQuotes((raw ?? "").trim());
    if (value === "") continue;
    vars.push([key, value]);
  }
  if (vars.length === 0) return undefined;
  vars.sort((a, b) => a[0].localeCompare(b[0]));
  return { path: file, vars, movedSecrets: [], movedSettings: [], unrecognised: [] };
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function asBool(value: string): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function asPort(value: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined;
}

type ConfigSetter = (config: OhConfig, value: string) => void;

function section<K extends keyof OhConfig>(config: OhConfig, key: K): Record<string, unknown> {
  const current = config[key];
  if (current === undefined || current === null || typeof current !== "object") {
    (config as Record<string, unknown>)[key as string] = {};
  }
  return (config as Record<string, unknown>)[key as string] as Record<string, unknown>;
}

const ENV_TO_CONFIG: Record<string, ConfigSetter> = {
  SANDBOX_NAME: (c, v) => {
    c.name = v;
  },
  TZ: (c, v) => {
    c.timezone = v;
  },
  OH_PROJECT_ROOT: (c, v) => {
    c.projectRoot = v;
  },
  GIT_USER_NAME: (c, v) => {
    section(c, "git").userName = v;
  },
  GIT_USER_EMAIL: (c, v) => {
    section(c, "git").userEmail = v;
  },
  INSTALL_OPENCODE: (c, v) => {
    section(c, "install").opencode = asBool(v);
  },
  INSTALL_GROK_BUILD: (c, v) => {
    section(c, "install").grokBuild = asBool(v);
  },
  INSTALL_DEEPAGENTS: (c, v) => {
    section(c, "install").deepagents = asBool(v);
  },
  INSTALL_HERMES: (c, v) => {
    section(c, "install").hermes = asBool(v);
  },
  INSTALL_AGENT_BROWSER: (c, v) => {
    section(c, "install").agentBrowser = asBool(v);
  },
  INSTALL_TAILSCALE: (c, v) => {
    section(c, "install").tailscale = asBool(v);
  },
  SANDBOX_SSH: (c, v) => {
    section(c, "access").ssh = asBool(v);
  },
  SANDBOX_SSH_PORT: (c, v) => {
    const port = asPort(v);
    if (port !== undefined) section(c, "access").sshPort = port;
  },
  SANDBOX_SSH_PASSWORD_AUTH: (c, v) => {
    section(c, "access").sshPasswordAuth = asBool(v);
  },
  SANDBOX_SSH_AUTHORIZED_KEYS: (c, v) => {
    section(c, "access").sshAuthorizedKeys = v;
  },
  DOCKER_SOCKET: (c, v) => {
    section(c, "access").dockerSocket = asBool(v);
  },
  HERMES_DASHBOARD: (c, v) => {
    section(c, "hermesDashboard").enabled = asBool(v);
  },
  HERMES_DASHBOARD_PORT: (c, v) => {
    const port = asPort(v);
    if (port !== undefined) section(c, "hermesDashboard").port = port;
  },
  CRON_AGENT_BIN: (c, v) => {
    section(c, "cron").agentBin = v;
  },
  SKIP_PNPM_INSTALL: (c, v) => {
    section(c, "build").skipPnpmInstall = asBool(v);
  },
  OH_SANDBOX_IMAGE: (c, v) => {
    section(c, "image").ref = v;
  },
  OH_PULL_POLICY: (c, v) => {
    if (v === "missing" || v === "always" || v === "never") section(c, "image").pullPolicy = v;
  },
  OH_CLOUD_API_URL: (c, v) => {
    section(c, "cloud").apiUrl = v;
  },
};

function applyEnvToConfig(config: OhConfig, key: string, value: string): boolean {
  const setter = ENV_TO_CONFIG[key];
  if (!setter) return false;
  setter(config, value);
  return true;
}

function writeConfigFile(ctx: WriteCtx, config: OhConfig): void {
  const dest = ohConfigPath(ctx.t);
  assertInTarget(dest, ctx.t);
  const body = `${JSON.stringify(validateOhConfig({ ...config, version: 1 }), null, 2)}\n`;
  const exists = existsSync(dest);
  if (exists && readFileSync(dest, "utf8") === body) {
    ctx.report("skip oh.json (exists)");
    ctx.stats.skipped++;
    return;
  }
  if (!ctx.dryRun) writeOhConfig(ctx.t, config);
  ctx.report(exists ? "update oh.json" : "create oh.json");
  if (exists) ctx.stats.overwritten++;
  else ctx.stats.created++;
}


async function confirmWith(
  askFn: (q: string) => Promise<string>,
  question: string,
  defaultYes = false,
): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const ans = (await askFn(`${question} ${suffix}`)).toLowerCase();
  if (ans === "") return defaultYes;
  return /^y/.test(ans);
}

async function runWizard(
  io: InitIO,
  config: OhConfig,
  secrets: Record<string, string>,
): Promise<void> {
  const askFn = io.ask ?? prompt.ask;
  const askSecretFn = io.askSecret ?? prompt.askSecret;

  prompt.header("Configure your harness  (press Enter to accept the shown default)");

  prompt.step(1, 5, "Project");
  const name = await askFn("Sandbox name [my-project]:");
  if (name) config.name = name;

  const tz = await askFn("Timezone [America/Denver]:");
  if (tz) config.timezone = tz;

  const gitName = await askFn("Git user name:");
  if (gitName) section(config, "git").userName = gitName;

  const gitEmail = await askFn("Git user email:");
  if (gitEmail) section(config, "git").userEmail = gitEmail;

  prompt.step(2, 5, "Optional installs");
  const installs: { key: string; field: string; desc: string }[] = [
    { key: "opencode", field: "opencode", desc: "OpenCode TUI coding agent" },
    { key: "deepagents", field: "deepagents", desc: "DeepAgents multi-agent runtime" },
    { key: "hermes", field: "hermes", desc: "Hermes CLI + runtime (build arg + runtime)" },
    { key: "grok_build", field: "grokBuild", desc: "Grok build tooling" },
    { key: "agent_browser", field: "agentBrowser", desc: "agent-browser + Chromium (~1 GB)" },
    {
      key: "tailscale",
      field: "tailscale",
      desc: "Tailscale (userspace) — private remote access for T3 Code",
    },
  ];
  for (const inst of installs) {
    const yes = await confirmWith(askFn, `Install ${inst.key} — ${inst.desc}?`, false);
    section(config, "install")[inst.field] = yes;
  }

  prompt.step(3, 5, "Access (off by default)");
  const sshOn = await confirmWith(askFn, "Enable sshd for direct container SSH?", false);
  section(config, "access").ssh = sshOn;
  if (sshOn) {
    const sshPort = await askFn("SSH host port [2222]:");
    const port = sshPort ? asPort(sshPort) : undefined;
    if (port !== undefined) section(config, "access").sshPort = port;
  }

  prompt.info(
    "Mounting the host Docker socket is effectively HOST ROOT — an agent can start a",
  );
  prompt.info("privileged container that mounts the host filesystem. Enable only if needed.");
  const sockOn = await confirmWith(askFn, "Mount host Docker socket into the sandbox?", false);
  section(config, "access").dockerSocket = sockOn;

  prompt.step(4, 5, "Secrets");
  prompt.info("Stored in .env at the project root, which is gitignored — never committed:");
  for (const key of ["GH_TOKEN", "PI_SLACK_BOT_TOKEN", "PI_SLACK_APP_TOKEN"] as const) {
    const value = await askSecretFn(`${key} (blank to skip):`);
    if (!value) continue;
    secrets[key] = value;
    prompt.ok(`${key} set (${prompt.redact(value)})`);
  }
}

function appendGitignore(
  src: string,
  t: string,
  dryRun: boolean,
  report: (line: string) => void,
): void {
  const target = path.join(t, ".gitignore");

  const candidates = readFileSync(src, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");

  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  const present = new Set(
    existing.split("\n").map((line) => line.trimEnd()),
  );

  const newLines: string[] = [];
  const seen = new Set<string>();
  for (const line of candidates) {
    const key = line.trimEnd();
    if (present.has(key) || seen.has(key)) continue;
    seen.add(key);
    newLines.push(line);
  }

  if (newLines.length === 0) {
    report("skip .gitignore (no new entries)");
    return;
  }

  report(`update .gitignore (+${newLines.length})`);
  if (dryRun) return;

  let output = existing;
  if (output.length > 0 && !output.endsWith("\n")) output += "\n";
  output += newLines.join("\n") + "\n";

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output, "utf8");
}
