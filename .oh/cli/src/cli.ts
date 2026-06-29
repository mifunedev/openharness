import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runInit, type InitIO, type InitOptions } from "./commands/init.js";
import { runUpdate } from "./commands/update.js";

// Injected at build time from package.json#version (see build.mjs).
declare const __OH_VERSION__: string;
const VERSION: string = typeof __OH_VERSION__ === "string" ? __OH_VERSION__ : "0.0.0-dev";

// Resolved once at module load. Correct from BOTH `src/cli.ts` and the bundled
// `dist/oh.js` — both live two levels under `.oh/cli`, so `../../templates`
// lands on `.oh/cli/templates`. esbuild (bundle:true, format:esm) preserves
// `import.meta.url` as a live ref to the output file, so this holds at runtime.
const DEFAULT_TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

// The CLI's own bundled `.oh/` — the default source `oh init` vendors FROM. From
// both `src/cli.ts` and `dist/oh.js` (each two levels under `.oh/cli`), `../..`
// resolves to `.oh` (verified empirically; `DEFAULT_TEMPLATES_DIR` is `.oh/templates`,
// one level deeper). Installed-binary payload bundling (e.g. /opt/oh) is deferred
// (#531); use `--from <checkout>` until then.
const DEFAULT_SOURCE_OH_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

interface Integration {
  description: string;
  runner: () => Promise<number>;
}

// No interactive wizards remain — Slack is configured natively by editing
// `.devcontainer/.env` + `.pi/msg-bridge.json` (see docs/integrations/slack.md).
// The framework stays for future integrations; `integrationLines()` renders
// "(none)" while this record is empty.
const INTEGRATIONS: Record<string, Integration> = {};

export function isHelpFlag(arg: string | undefined): boolean {
  return arg === "--help" || arg === "-h" || arg === "help";
}

export function isVersionFlag(arg: string | undefined): boolean {
  return arg === "--version" || arg === "-v";
}

function integrationLines(): string {
  const names = Object.keys(INTEGRATIONS);
  if (names.length === 0) return "  (none)";
  const width = Math.max(...names.map((n) => n.length));
  return names
    .map((n) => `  ${n.padEnd(width)}  ${INTEGRATIONS[n].description}`)
    .join("\n");
}

function printOhHelp(): void {
  process.stdout.write(`oh — Open Harness CLI (v${VERSION})

Usage:
  oh init [dir]             Scaffold OpenHarness compat files into a repo
  oh config <integration>   Configure an integration via interactive wizard
  oh update --from <dir>    Upgrade the .oh/ control plane from a newer source
  oh --version              Print version
  oh --help                 Show this help

Integrations:
${integrationLines()}
`);
}

function printConfigHelp(): void {
  process.stdout.write(`oh config — Configure integrations

Usage:
  oh config <integration>
  oh config <integration> --help

Integrations:
${integrationLines()}
`);
}

function printUpdateHelp(): void {
  process.stdout.write(`oh update — Upgrade the .oh/ control plane

Usage:
  oh update --from <dir> [--dry-run] [--force]

Upgrades ONLY the .oh/ control plane (skills, scripts, CLI). Your project
source is left untouched.

Flags:
  --from <dir>   A built OpenHarness checkout to upgrade from. Required for
                 now — remote-fetch is deferred (#531).
  --dry-run      Preview the changes without writing anything.
  --force        Override the up-to-date / downgrade gate.
`);
}

function printInitHelp(): void {
  process.stdout.write(`oh init — Equip a repo with OpenHarness

Usage:
  oh init [dir] [--minimal] [--yes] [--from <dir>] [--force] [--dry-run] [--templates <dir>]

Scaffolds a complete, locally-buildable OpenHarness project into a target repo
(default: cwd): vendors the .oh/ control plane (incl. context/crons/evals and
the skills/agents/hooks pack), seeds empty memory/ + tasks/, copies the full
.devcontainer/ for a local image build, writes a project AGENTS.md (+ CLAUDE.md),
and configures the .claude/.codex/.pi/.hermes provider surfaces as symlinks into
.oh/skills. In a TTY (without --yes) it runs a short config wizard for
harness.yaml + .devcontainer/.env.

Flags:
  --minimal          Thin scaffold only (compat files + vendored .oh/) — the old
                     behavior; skips devcontainer/providers/seeds
  --copy-claude      Write CLAUDE.md as a copy instead of a symlink -> AGENTS.md
                     (for filesystems without symlink support)
  --yes              Non-interactive: skip the wizard, keep template defaults
  --from <dir>       Vendor the .oh/ payload from this built OpenHarness checkout
                     (defaults to the CLI's own .oh/; installed-binary bundling
                     is deferred, #531)
  --force            Overwrite existing files (prints the overwrite count)
  --dry-run          Print the whole plan without writing anything
  --verbose          List every per-file action (default summarizes vendor noise)
  --templates <dir>  Override the scaffold template source directory
`);
}

function printIntegrationHelp(name: string, integration: Integration): void {
  process.stdout.write(`oh config ${name} — ${integration.description}

Usage:
  oh config ${name}

This launches an interactive wizard. It takes no flags.
`);
}

async function main(argv: string[]): Promise<number> {
  const [first, second, third] = argv;

  if (!first || isHelpFlag(first)) {
    printOhHelp();
    return 0;
  }
  if (isVersionFlag(first)) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === "init") {
    if (isHelpFlag(second)) {
      printInitHelp();
      return 0;
    }

    let targetDir: string | undefined;
    let templatesDir = DEFAULT_TEMPLATES_DIR;
    let fromDir: string | undefined;
    let yes = false;
    let force = false;
    let dryRun = false;
    let minimal = false;
    let copyClaude = false;
    let verbose = false;

    const rest = argv.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const token = rest[i];
      if (token === "--force") {
        force = true;
      } else if (token === "--dry-run") {
        dryRun = true;
      } else if (token === "--yes") {
        yes = true;
      } else if (token === "--minimal") {
        minimal = true;
      } else if (token === "--copy-claude") {
        copyClaude = true;
      } else if (token === "--verbose") {
        verbose = true;
      } else if (token === "--from") {
        const value = rest[i + 1];
        if (value === undefined) {
          process.stderr.write(`oh init: --from requires a directory argument\n`);
          return 1;
        }
        fromDir = value;
        i++;
      } else if (token === "--templates") {
        const value = rest[i + 1];
        if (value === undefined) {
          process.stderr.write(`oh init: --templates requires a directory argument\n`);
          return 1;
        }
        templatesDir = value;
        i++;
      } else if (token.startsWith("-")) {
        process.stderr.write(`oh init: unknown flag "${token}"\n`);
        return 1;
      } else if (targetDir === undefined) {
        targetDir = token;
      } else {
        process.stderr.write(`oh init: unexpected argument "${token}"\n`);
        return 1;
      }
    }

    // `--from <checkout>` mirrors `oh update --from`: vendor from <checkout>/.oh.
    // Default to the CLI's own bundled `.oh/`.
    const sourceOhDir =
      fromDir !== undefined ? resolve(join(fromDir, ".oh")) : DEFAULT_SOURCE_OH_DIR;

    const opts: InitOptions = {
      targetDir: resolve(targetDir ?? process.cwd()),
      templatesDir: resolve(templatesDir),
      sourceOhDir,
      yes,
      force,
      dryRun,
      minimal,
      copyClaude,
      verbose,
    };
    const io: InitIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };

    return await runInit(opts, io);
  }

  if (first === "config") {
    if (!second || isHelpFlag(second)) {
      printConfigHelp();
      return second ? 0 : 1;
    }

    const integration = INTEGRATIONS[second];
    if (!integration) {
      process.stderr.write(`oh config: unknown integration "${second}"\n\n`);
      printConfigHelp();
      return 1;
    }

    if (third && isHelpFlag(third)) {
      printIntegrationHelp(second, integration);
      return 0;
    }

    if (third !== undefined) {
      process.stderr.write(
        `oh config ${second}: unexpected argument "${third}". This wizard takes no flags.\n`,
      );
      return 1;
    }

    return await integration.runner();
  }

  if (first === "update") {
    const rest = argv.slice(1);
    let fromDir: string | undefined;
    let force = false;
    let dryRun = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--from") {
        const value = rest[i + 1];
        if (value === undefined) {
          process.stderr.write("oh update: --from requires a directory\n");
          return 1;
        }
        fromDir = value;
        i++;
        continue;
      }
      if (arg === "--dry-run") {
        dryRun = true;
        continue;
      }
      if (arg === "--force") {
        force = true;
        continue;
      }
      if (isHelpFlag(arg)) {
        printUpdateHelp();
        return 0;
      }
      process.stderr.write(`oh update: unexpected argument "${arg}"\n`);
      printUpdateHelp();
      return 1;
    }

    if (fromDir === undefined) {
      process.stderr.write(
        "oh update: --from <dir> is required (remote-fetch deferred, #531)\n",
      );
      return 1;
    }

    const targetDir = process.cwd();
    return await runUpdate(
      { targetDir, fromDir, force, dryRun },
      { stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) },
    );
  }

  process.stderr.write(`oh: unknown command "${first}"\n\n`);
  printOhHelp();
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`oh: ${msg}\n`);
    process.exit(2);
  },
);
