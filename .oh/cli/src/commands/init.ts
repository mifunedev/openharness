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
import { writeEnvFile } from "../lib/env.js";
import { setKeyInEnv } from "../lib/env-file.js";
import * as prompt from "../lib/prompt.js";

export interface InitIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  ask?: (q: string) => Promise<string>;
  askSecret?: (q: string) => Promise<string>;
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

  if (!minimal) {
    const wr: WriteCtx = { t, dryRun, force, report, stats };

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
    writeNestedClaudeAliases(wr, templatesDir);

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

  const answers: WizardAnswers = interactive
    ? await runWizard(io)
    : { env: {}, secrets: {} };

  const configVars: Record<string, string> = { ...answers.env, ...answers.secrets };
  const configKeys = Object.keys(configVars);
  if (configKeys.length > 0) {
    const secretCount = Object.keys(answers.secrets).length;
    const label =
      secretCount > 0
        ? `${configKeys.length} keys, ${secretCount} secret${secretCount === 1 ? "" : "s"}`
        : `${configKeys.length} keys`;
    if (dryRun) {
      report(`update .devcontainer/.env (${label})`);
    } else {
      const envDir = path.join(t, ".devcontainer");
      mkdirSync(envDir, { recursive: true });
      const envPath = path.join(envDir, ".env");
      const examplePath = path.join(envDir, ".example.env");
      if (!existsSync(envPath) && existsSync(examplePath)) {
        copyFileSync(examplePath, envPath);
      }
      let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
      const applied: string[] = [];
      for (const [key, value] of Object.entries(configVars)) {
        const next = setKeyInEnv(content, key, value).content;
        if (next !== content) {
          content = next;
          applied.push(key);
        }
      }
      writeEnvFile(envPath, content);
      const appliedSecrets = applied.filter((k) => k in answers.secrets).length;
      report(
        `update .devcontainer/.env (${applied.length} keys${
          appliedSecrets > 0 ? `, ${appliedSecrets} secret${appliedSecrets === 1 ? "" : "s"}` : ""
        })`,
      );
    }
  }

  if (dryRun) {
    prompt.info("");
    prompt.ok(`Dry run complete — previewed the ${minimal ? "minimal" : "full"} plan, wrote nothing.`);
    prompt.info("Re-run without --dry-run to apply.");
    return 0;
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
    prompt.info("  1. Put secrets in .devcontainer/.env (gitignored — never commit them)");
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

const NESTED_AGENTS_DIRS = [".worktrees", "projects"];

function writeNestedClaudeAliases(ctx: WriteCtx, templatesDir: string): void {
  for (const dir of NESTED_AGENTS_DIRS) {
    if (!existsSync(path.join(templatesDir, dir, "AGENTS.md"))) continue;
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


interface WizardAnswers {
  env: Record<string, string>;
  secrets: Record<string, string>;
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

async function runWizard(io: InitIO): Promise<WizardAnswers> {
  const askFn = io.ask ?? prompt.ask;
  const askSecretFn = io.askSecret ?? prompt.askSecret;
  const env: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  prompt.header("Configure your harness  (press Enter to accept the shown default)");

  prompt.step(1, 4, "Project");
  const name = await askFn("Sandbox name [my-project]:");
  if (name) env.SANDBOX_NAME = name;

  const tz = await askFn("Timezone [America/Denver]:");
  if (tz) env.TZ = tz;

  const gitName = await askFn("Git user name:");
  if (gitName) env.GIT_USER_NAME = gitName;

  const gitEmail = await askFn("Git user email:");
  if (gitEmail) env.GIT_USER_EMAIL = gitEmail;

  prompt.step(2, 4, "Optional installs");
  const installs: { key: string; desc: string }[] = [
    { key: "opencode", desc: "OpenCode TUI coding agent" },
    { key: "deepagents", desc: "DeepAgents multi-agent runtime" },
    { key: "hermes", desc: "Hermes CLI + runtime (build arg + runtime)" },
    { key: "grok_build", desc: "Grok build tooling" },
    { key: "agent_browser", desc: "agent-browser + Chromium (~1 GB)" },
  ];
  for (const inst of installs) {
    const yes = await confirmWith(askFn, `Install ${inst.key} — ${inst.desc}?`, false);
    if (yes) env[`INSTALL_${inst.key.toUpperCase()}`] = "true";
  }

  prompt.step(3, 4, "Access (off by default)");
  const sshOn = await confirmWith(askFn, "Enable sshd for direct container SSH?", false);
  if (sshOn) {
    env.SANDBOX_SSH = "true";
    const sshPort = await askFn("SSH host port [2222]:");
    if (sshPort) env.SANDBOX_SSH_PORT = sshPort;
  }

  prompt.info(
    "Mounting the host Docker socket is effectively HOST ROOT — an agent can start a",
  );
  prompt.info("privileged container that mounts the host filesystem. Enable only if needed.");
  const sockOn = await confirmWith(askFn, "Mount host Docker socket into the sandbox?", false);
  if (sockOn) {
    env.DOCKER_SOCKET = "true";
  }

  prompt.step(4, 4, "Secrets");
  prompt.info("Stored in .devcontainer/.env, which is gitignored — never committed:");
  const gh = await askSecretFn("GH_TOKEN (blank to skip):");
  if (gh) {
    secrets.GH_TOKEN = gh;
    prompt.ok(`GH_TOKEN set (${prompt.redact(gh)})`);
  }

  const slackBot = await askSecretFn("PI_SLACK_BOT_TOKEN (optional, blank to skip):");
  if (slackBot) {
    secrets.PI_SLACK_BOT_TOKEN = slackBot;
    prompt.ok(`PI_SLACK_BOT_TOKEN set (${prompt.redact(slackBot)})`);
  }

  const slackApp = await askSecretFn("PI_SLACK_APP_TOKEN (optional, blank to skip):");
  if (slackApp) {
    secrets.PI_SLACK_APP_TOKEN = slackApp;
    prompt.ok(`PI_SLACK_APP_TOKEN set (${prompt.redact(slackApp)})`);
  }

  return { env, secrets };
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
