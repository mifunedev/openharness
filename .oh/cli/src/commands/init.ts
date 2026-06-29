import {
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { loadManifest } from "../lib/manifest.js";
import { copyOhPayload, type CopyReport } from "../lib/vendor.js";
import { upsertEnvFile } from "../lib/env.js";
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
   * resolved by cli.ts: `--from <checkout>` → `<checkout>/.oh`, else the CLI's
   * own bundled `.oh/` via DEFAULT_SOURCE_OH_DIR).
   */
  sourceOhDir?: string;
  yes?: boolean; // non-interactive: skip the wizard
  force?: boolean;
  dryRun?: boolean;
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
  const prefix = dryRun ? "[dry-run] " : "";
  const report = (line: string): void => io.stdout(`${prefix}${line}\n`);

  // Precondition: templates dir must exist and be a directory.
  if (!existsSync(templatesDir) || !statSync(templatesDir).isDirectory()) {
    io.stderr(
      `oh init: scaffold templates not found at ${templatesDir}. Pass --templates <dir> or run from a built OpenHarness checkout; installed-binary template bundling is deferred (#531).\n`,
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
        `Pass --from <built-OpenHarness-checkout>; installed-binary payload bundling is deferred (#531).\n`,
    );
    return 1;
  }

  // Create the target dir if missing (real runs only).
  if (!existsSync(t) && !dryRun) {
    mkdirSync(t, { recursive: true });
  }

  // --- Thin compat scaffold (templates) ---------------------------------------
  // Enumerate template files, skip the top-level README.md, sort for determinism.
  const relpaths: string[] = [];
  walkFiles(templatesDir, templatesDir, relpaths);
  const files = relpaths.filter((r) => r !== "README.md").sort();

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
        break;
      case "skip-not-in-payload":
        report(`skip ${r} (not in payload)`);
        break;
      case "skip-volatile":
        report(`skip ${r} (volatile)`);
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

  // --- Interactive config wizard (US-002/003) ---------------------------------
  // Gate: only in a real TTY (or when a reader is injected for tests), and never
  // under --yes. Production cli.ts never injects io.ask → pure isTTY gate.
  const interactive =
    opts.yes !== true && (process.stdin.isTTY === true || io.ask !== undefined);

  const answers: WizardAnswers = interactive
    ? await runWizard(io)
    : { harness: [], secrets: {} };

  // --- Config writes (vendor → wizard → config) -------------------------------
  if (answers.harness.length > 0) {
    const harnessPath = path.join(t, "harness.yaml");
    if (existsSync(harnessPath) || dryRun) {
      if (dryRun) {
        report(`update harness.yaml (${answers.harness.length} keys)`);
      } else {
        let content = readFileSync(harnessPath, "utf8");
        const applied: string[] = [];
        for (const { key, value } of answers.harness) {
          const next = setHarnessKey(content, key, value);
          if (next !== content) {
            content = next;
            applied.push(key);
          }
        }
        writeFileSync(harnessPath, content, "utf8");
        report(`update harness.yaml (${applied.length} keys)`);
      }
    }
  }

  const secretKeys = Object.keys(answers.secrets);
  if (secretKeys.length > 0) {
    if (dryRun) {
      report(`update .devcontainer/.env (${secretKeys.length} secrets)`);
    } else {
      const envDir = path.join(t, ".devcontainer");
      mkdirSync(envDir, { recursive: true });
      upsertEnvFile(path.join(envDir, ".env"), answers.secrets);
      report(`update .devcontainer/.env (${secretKeys.length} secrets)`);
    }
  }

  // --- Post-init guidance (UX channel; not the io operation log) ---------------
  // Routed through prompt.* (process.stdout) so it never pollutes the testable
  // io.stdout operation log. Suppressed under --dry-run.
  if (!dryRun) {
    if (force && vOverwritten > 0) {
      prompt.warn(`--force overwrote ${vOverwritten} existing .oh/ file(s).`);
    }
    prompt.info("");
    prompt.ok(`Vendored .oh/ (${vCreated + vOverwritten} files) into ${t}`);
    prompt.info(".oh/ is your portable control plane — commit it to your repo.");
    prompt.info(
      "Build the CLI before the `oh` binary works:  cd .oh/cli && npm install && npm run build",
    );
    prompt.info("Re-run `oh init --force` to overwrite existing files.");
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

interface WizardAnswers {
  /** harness.yaml keys to activate: each uncomments + substitutes a value. */
  harness: { key: string; value: string }[];
  /** Secret env vars for .devcontainer/.env (never harness.yaml). */
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
  const harness: { key: string; value: string }[] = [];
  const secrets: Record<string, string> = {};

  prompt.header("Configure your harness (press Enter to accept the shown default)");

  const name = await askFn("Sandbox name [my-project]:");
  if (name) harness.push({ key: "name", value: name });

  const tz = await askFn("Timezone [America/Denver]:");
  if (tz) harness.push({ key: "timezone", value: tz });

  const gitName = await askFn("Git user name:");
  if (gitName) harness.push({ key: "user_name", value: gitName });

  const gitEmail = await askFn("Git user email:");
  if (gitEmail) harness.push({ key: "user_email", value: gitEmail });

  prompt.info("Optional installs:");
  const installs: { key: string; desc: string }[] = [
    { key: "opencode", desc: "OpenCode TUI coding agent" },
    { key: "deepagents", desc: "DeepAgents multi-agent runtime" },
    { key: "hermes", desc: "Hermes CLI + runtime (build arg + runtime)" },
    { key: "grok_build", desc: "Grok build tooling" },
    { key: "agent_browser", desc: "agent-browser + Chromium (~1 GB)" },
  ];
  for (const inst of installs) {
    const yes = await confirmWith(askFn, `Install ${inst.key} — ${inst.desc}?`, false);
    if (yes) harness.push({ key: inst.key, value: "true" });
  }

  prompt.info("Secrets (stored ONLY in .devcontainer/.env, never in harness.yaml):");
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

  return { harness, secrets };
}

/**
 * harness.yaml write = line-regex uncomment (NO YAML parser). Find the COMMENTED
 * two-level key line (`<indent># <key>: <default> [ # inline comment]`) and
 * replace it with `<indent><key>: <value>[ inline comment]`. Every other line is
 * left byte-identical. Keys absent from the template are a no-op (the value has
 * no home). Limitation: flat two-level keys only — matches the template format.
 */
function setHarnessKey(content: string, key: string, value: string): string {
  const lines = content.split("\n");
  const keyRe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^(\\s*)#\\s?(${keyRe})\\s*:\\s*([^\\n]*?)(\\s+#.*)?\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) {
      const indent = m[1];
      const inline = m[4] ?? "";
      lines[i] = `${indent}${key}: ${value}${inline}`;
      return lines.join("\n");
    }
  }
  return content;
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
