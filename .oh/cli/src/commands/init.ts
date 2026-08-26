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
import { copyOhPayload, type CopyReport } from "../lib/vendor.js";
import { writeEnvFile } from "../lib/env.js";
import { setKeyInEnv } from "../lib/env-file.js";
import * as prompt from "../lib/prompt.js";

export interface InitIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /**
   * Reader for the config wizard. Defaults to `prompt.ask` (real stdin) when
   * omitted. Tests inject a fake so they never touch real stdin. Providing it
   * ALSO flips the wizard on without a TTY (the DI seam) — production cli.ts
   * leaves it unset, so the wizard there gates purely on `process.stdin.isTTY`.
   */
  ask?: (q: string) => Promise<string>;
  /** Secret reader for the wizard. Defaults to `prompt.askSecret`. */
  askSecret?: (q: string) => Promise<string>;
}

export interface InitOptions {
  targetDir: string; // dir to scaffold into (resolved by caller; default cwd)
  templatesDir: string; // absolute path to .oh/templates
  /**
   * Absolute path to the source `.oh/` directory to vendor FROM (already
   * resolved by cli.ts: `--from <checkout>` → `<checkout>/.oh`, a fetched
   * `--from-remote` checkout's `.oh`, or the CLI's own bundled `.oh/` via
   * DEFAULT_SOURCE_OH_DIR).
   */
  sourceOhDir?: string;
  yes?: boolean; // non-interactive: skip the wizard
  force?: boolean;
  dryRun?: boolean;
  /**
   * FULL scaffold is the DEFAULT. `minimal: true` reverts to the old thin
   * scaffold (the compat template files + vendored `.oh/` only) — no full
   * devcontainer, empty seeds, or provider surfaces.
   */
  minimal?: boolean;
  /**
   * Write `CLAUDE.md` as a COPY of `AGENTS.md` instead of a symlink — for
   * filesystems without symlink support. Default: symlink.
   */
  copyClaude?: boolean;
  /**
   * Show every per-file action, including the `skip … (not in payload/volatile)`
   * vendor noise that is summarized away by default.
   */
  verbose?: boolean;
}

/**
 * Recursively enumerate FILE relpaths (POSIX-style separators) under `root`,
 * skipping directory entries themselves. Used for the trusted, repo-shipped
 * template payload (the user-supplied `.oh/` source uses the stricter
 * symlink-skipping walk in lib/vendor.ts).
 */
function walkFiles(root: string, dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, abs, acc);
    } else if (entry.isFile()) {
      // path.relative gives platform separators; normalize to POSIX for relpaths.
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
  // Aggregate tallies for the legible end-of-run summary (UX channel).
  const stats = { created: 0, overwritten: 0, skipped: 0 };

  // Precondition: templates dir must exist and be a directory.
  if (!existsSync(templatesDir) || !statSync(templatesDir).isDirectory()) {
    io.stderr(
      `oh init: scaffold templates not found at ${templatesDir}. Pass --templates <dir>, run from a built OpenHarness checkout, or use --from-remote to fetch one.\n`,
    );
    return 1;
  }

  // Precondition: target, if it exists, must not be a plain file (applies even under dryRun).
  if (existsSync(t) && !statSync(t).isDirectory()) {
    io.stderr(`oh init: target path is a file, not a directory: ${t}\n`);
    return 1;
  }

  // Precondition: a vendor source `.oh/` must exist (checked before any write).
  const sourceOh = opts.sourceOhDir ? path.resolve(opts.sourceOhDir) : "";
  if (!sourceOh || !existsSync(sourceOh) || !statSync(sourceOh).isDirectory()) {
    io.stderr(
      `oh init: vendor source .oh/ not found${sourceOh ? ` at ${sourceOh}` : ""}. ` +
        `Pass --from <built-OpenHarness-checkout> or --from-remote; ` +
        `installed-binary payload bundling is gated on publishing (#564).\n`,
    );
    return 1;
  }

  // Create the target dir if missing (real runs only).
  if (!existsSync(t) && !dryRun) {
    mkdirSync(t, { recursive: true });
  }

  // --- Thin compat scaffold (templates) ---------------------------------------
  // Enumerate template files, skip the top-level README.md, sort for determinism.
  // The `full/` subtree holds full-scaffold-only payloads (provider configs)
  // copied explicitly by the full-mode phases — never by this generic walk.
  // In full mode the local-build `.devcontainer/devcontainer.json` is written by
  // the devcontainer phase, so the thin stub template is skipped there.
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

    // Path-escape guard (PIN): the resolved target must stay inside `t`.
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

  // --- Vendor the .oh/ control plane (US-001) ---------------------------------
  const targetOh = path.join(t, ".oh");
  const manifest = loadManifest(sourceOh);
  if (manifest === null) {
    report("oh init: no .oh/manifest.json in source; vendoring all of .oh/ (legacy mode)");
  }

  let vCreated = 0;
  let vOverwritten = 0;
  let vFiltered = 0; // not-in-payload + volatile (the noise we summarize away)
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
        // Noise: dozens of source files outside the manifest. Summarized away
        // by default; surfaced per-file only under --verbose.
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

  // --- Full scaffold phases (default; skipped under --minimal) -----------------
  if (!minimal) {
    const wr: WriteCtx = { t, dryRun, force, report, stats };

    // Phase 2a: seed tasks/ as an EMPTY dir (README stub). This harness's own
    // PRDs are NEVER shipped — init creates the directory fresh.
    writeGenerated(
      wr,
      ".oh/tasks/README.md",
      "# tasks/\n\nPer-task `tasks/<slug>/` folders (PRD + plan + critique + " +
        "prd.json) produced by `/spec plan` and consumed by `/spec execute`.\n",
    );

    // Phase 2b: full .devcontainer/ (Dockerfile, compose, entrypoint, *.sh) +
    // a local-build devcontainer.json. The published image is a documented
    // fallback only. The harness keeps these assets under its own conventional
    // .devcontainer/ (a sibling of .oh/), so they copy across near-verbatim.
    const sourceDevcontainer = path.join(sourceOh, "..", ".devcontainer");
    if (existsSync(sourceDevcontainer) && statSync(sourceDevcontainer).isDirectory()) {
      copyDevcontainer(sourceDevcontainer, wr);
      writeGenerated(wr, ".devcontainer/devcontainer.json", DEVCONTAINER_JSON);
      // The harness Dockerfile `COPY workspace/` expects an in-repo workspace
      // template; seed a stub so a local image build has a source to copy.
      writeGenerated(wr, "workspace/README.md", WORKSPACE_README);
    } else {
      prompt.warn(
        `Source devcontainer not found at ${sourceDevcontainer}; skipped full .devcontainer/ scaffold.`,
      );
    }

    // Phase 3a: CLAUDE.md alias of AGENTS.md (AGENTS.md itself comes from the
    // template scaffold above). Symlink by default; copy under --copy-claude.
    writeClaudeAlias(wr, copyClaude);

    // Phase 3b: curated, secret-free provider config surfaces (.claude/.codex/
    // .pi/.hermes). Authored project defaults — NOT the harness's live files.
    const fullTemplates = path.join(templatesDir, "full");
    if (existsSync(fullTemplates) && statSync(fullTemplates).isDirectory()) {
      const rels: string[] = [];
      collectRealFiles(fullTemplates, fullTemplates, rels);
      rels.sort();
      for (const rel of rels) {
        copyFileReport(wr, path.join(fullTemplates, rel), rel);
      }
    }

    // Phase 3c: provider skill/agent/hook symlinks into the vendored `.oh/`
    // pack. The skills/agents/hooks live in `.oh/` (vendored above with the rest
    // of the control plane), so these links resolve immediately — no submodule
    // materialization, no network step. link-providers.sh repairs them later.
    for (const [linkRel, linkTarget] of PROVIDER_LINKS) {
      linkReport(wr, linkRel, linkTarget);
    }
  }

  // --- Interactive config wizard (US-002/003) ---------------------------------
  // Gate: only in a real TTY (or when a reader is injected for tests), and never
  // under --yes. Production cli.ts never injects io.ask → pure isTTY gate.
  const interactive =
    opts.yes !== true && (process.stdin.isTTY === true || io.ask !== undefined);

  const answers: WizardAnswers = interactive
    ? await runWizard(io)
    : { env: {}, secrets: {} };

  // --- Config writes (vendor → wizard → config) -------------------------------
  // ONE write, to ONE file. Non-secret answers and secrets both land in
  // `.devcontainer/.env`: since harness.yaml was removed, there is no second
  // surface to split them across, and `.env` is the only one the VS Code
  // "Reopen in Container" path can read. Non-secret keys go through
  // `setKeyInEnv` so a commented template line is uncommented in place rather
  // than shadowed by an appended duplicate.
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
      // Seed from the template that was just scaffolded, so the operator's
      // answers land as UNCOMMENTED lines inside the documented file rather
      // than as a bare list of keys with none of the prose explaining them.
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

  // --- Post-init guidance (UX channel; not the io operation log) ---------------
  // Routed through prompt.* (process.stdout) so it never pollutes the testable
  // io.stdout operation log. Suppressed under --dry-run.
  if (dryRun) {
    prompt.info("");
    prompt.ok(`Dry run complete — previewed the ${minimal ? "minimal" : "full"} plan, wrote nothing.`);
    prompt.info("Re-run without --dry-run to apply.");
    return 0;
  }

  // --- Legible summary -------------------------------------------------------
  const totalOverwritten = vOverwritten + stats.overwritten;
  prompt.header(`OpenHarness ${minimal ? "minimal" : "full"} scaffold — done`);
  prompt.ok(`Vendored .oh/ (${vCreated + vOverwritten} files)`);
  if (vFiltered > 0 && !verbose) {
    prompt.info(`  (${vFiltered} non-payload source file(s) skipped — pass --verbose to list)`);
  }
  if (!minimal) {
    prompt.ok("Wrote AGENTS.md + CLAUDE.md and seeded an empty tasks/");
    prompt.ok("Copied the full .devcontainer/ (local image build)");
    prompt.ok("Configured 4 provider surfaces (.claude .codex .pi .hermes) → vendored .oh/skills");
  }
  if (force && totalOverwritten > 0) {
    prompt.warn(`--force overwrote ${totalOverwritten} existing file(s).`);
  }

  // --- Next steps ------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Full-scaffold helpers
// ---------------------------------------------------------------------------

/** Shared context for the generated-file writers (create/skip/overwrite). */
interface WriteCtx {
  t: string;
  dryRun: boolean;
  force: boolean;
  report: (line: string) => void;
  stats: { created: number; overwritten: number; skipped: number };
}

/**
 * Path-escape guard shared by every full-scaffold writer: the resolved dest
 * MUST be `t` itself or strictly inside it. Mirrors the vendor invariant.
 */
function assertInTarget(dest: string, t: string): void {
  if (!(dest === t || dest.startsWith(t + path.sep))) {
    throw new Error(`oh init: refusing to write outside target dir: ${dest}`);
  }
}

/**
 * Write generated `content` to `<t>/<rel>` with create/skip/overwrite semantics
 * identical to the thin-scaffold loop: skip an existing file unless `force`,
 * honor `dryRun`, and report exactly one operation-log line.
 */
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

/** Copy a real file (preserving the +x bit for `*.sh`) with create/skip/overwrite. */
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

/**
 * Copy the harness's own `.devcontainer/` build assets into `<t>/.devcontainer/`.
 * Source and target share the conventional `.devcontainer/` layout (build context
 * = repo root, one level up), so every asset — `docker-compose.yml`, the
 * Dockerfile, and the client scripts — copies verbatim. The workspace path in
 * `docker-compose.yml` is already parameterized as
 * `${OH_PROJECT_ROOT:-/home/sandbox/harness}`, so no per-target rewrite is
 * needed. The source `devcontainer.json` (the consumer's is written separately)
 * and any env files (never ship secrets) are skipped. Real files only
 * (symlinks/volatile dirs skipped).
 */
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

/** POSIX relpaths of every REAL file under `dir` (skip symlinks + volatile dirs). */
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

// devcontainer.json for LOCAL BUILD (default). Valid JSON (JSON.parse-able): the
// `// image` key is a documented fallback, not a real comment. To use the
// published image instead, drop dockerComposeFile/service/shutdownAction and add
// `"image": "ghcr.io/mifunedev/openharness:latest"`.
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

const WORKSPACE_README =
  "# workspace/\n\n" +
  "In-container agent workspace template. The harness image copies this into " +
  "`$OH_PROJECT_ROOT/workspace/` at build time. Seed it with your project's " +
  "in-sandbox agent scaffolding (e.g. an `AGENTS.md` for the running agent).\n";

// Provider skill/agent/hook symlinks into the vendored `.oh/` pack. init creates
// them for the target; link-providers.sh repairs them. `.codex` reuses
// `.claude`'s agents/specs.
const PROVIDER_LINKS: [string, string][] = [
  [".pi/skills", "../.oh/skills"],
  [".claude/skills", "../.oh/skills"],
  [".codex/skills", "../.oh/skills"],
  [".claude/agents", "../.oh/agents"],
  [".claude/hooks", "../.oh/hooks"],
  [".codex/agents", "../.claude/agents"],
  [".codex/specs", "../.claude/specs"],
];

/** Create/refresh a symlink at `<t>/<linkRel>` → `linkTarget` (create/skip/overwrite). */
function linkReport(ctx: WriteCtx, linkRel: string, linkTarget: string): void {
  const dest = path.resolve(ctx.t, linkRel);
  assertInTarget(dest, ctx.t);
  let exists = false;
  try {
    lstatSync(dest);
    exists = true;
  } catch {
    /* absent */
  }
  if (exists) {
    let current: string | null = null;
    try {
      current = readlinkSync(dest);
    } catch {
      /* not a symlink */
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

/** CLAUDE.md alias of AGENTS.md — a symlink by default, a copy under --copy-claude. */
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

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

interface WizardAnswers {
  /**
   * Non-secret `.devcontainer/.env` keys to activate: each uncomments the
   * template line in place and substitutes a value. Env keys are flat and
   * globally unique, so the section coordinate the harness.yaml writer needed
   * is gone with it.
   */
  env: Record<string, string>;
  /** Secret env vars. Same file — kept separate only so the log can count them. */
  secrets: Record<string, string>;
}

/** A y/N confirm built over the injected reader (so it is test-controllable). */
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

  // Step 3 covers the two settings that most often bite a new user and are not
  // reachable any other way short of hand-editing the file. Deliberately NOT a
  // push toward full key coverage: the remaining keys are advanced and every one
  // of them is documented in `.devcontainer/.example.env`, which is now the
  // schema document — a reader who needs one edits it there.
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
    // The same key `oh sandbox`'s opt-in prompt writes, in the same file — the
    // VS Code "Reopen in Container" path reads it too, which is the whole point
    // of collapsing configuration onto `.env`.
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

/**
 * `.gitignore` append rule: union the candidate lines from the `gitignore`
 * template into the target's `.gitignore`, deduped by `trimEnd()`, with the
 * resulting file ending in exactly one `\n`.
 */
function appendGitignore(
  src: string,
  t: string,
  dryRun: boolean,
  report: (line: string) => void,
): void {
  const target = path.join(t, ".gitignore");

  // Candidate lines from the template: non-empty (after trim).
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

  // Trailing-newline care (PIN): mirror upsertEnvFile's approach in lib/env.ts.
  let output = existing;
  if (output.length > 0 && !output.endsWith("\n")) output += "\n";
  output += newLines.join("\n") + "\n";

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output, "utf8");
}
