import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runInit, type InitIO, type InitOptions } from "./commands/init.js";
import { runUpdate } from "./commands/update.js";
import {
  runGateway,
  runSandbox,
  runShell,
  DEFAULT_CONTAINER_NAME,
  type LifecycleIO,
} from "./commands/lifecycle.js";
import {
  fetchRemoteSource,
  DEFAULT_REPO_URL,
  type FetchRemoteSourceOptions,
} from "./lib/remote.js";

// Injected at build time from package.json#version (see build.mjs).
declare const __OH_VERSION__: string;
const VERSION: string = typeof __OH_VERSION__ === "string" ? __OH_VERSION__ : "0.0.0-dev";

// Resolved once at module load. Correct from BOTH `src/cli.ts` and the bundled
// `dist/oh.js` — both live two levels under `.oh/cli`, so `../../templates`
// lands on `.oh/templates`. esbuild (bundle:true, format:esm) preserves
// `import.meta.url` as a live ref to the output file, so this holds at runtime.
const DEFAULT_TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

// The CLI's own bundled `.oh/` — the default source `oh init` vendors FROM. From
// both `src/cli.ts` and `dist/oh.js` (each two levels under `.oh/cli`), `../..`
// resolves to `.oh` (verified empirically; `DEFAULT_TEMPLATES_DIR` is `.oh/templates`,
// one level deeper). For an installed binary this parent dir is some unrelated
// real directory (e.g. `/usr`), NOT a payload — `resolveInitSource` detects that
// via the manifest marker and auto-falls back to a remote fetch (`--from-remote`).
// Bundling the payload into a published binary is gated on publishing (#564).
const DEFAULT_SOURCE_OH_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

interface Integration {
  description: string;
  runner: () => Promise<number>;
}

// No interactive wizards remain — Slack is configured natively by editing
// `.devcontainer/.env` + `.pi/msg-bridge.json` (see .oh/docs/integrations/slack.md).
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

/** Exported for tests (asserting the Usage block lists every subcommand). */
export function printOhHelp(): void {
  process.stdout.write(`oh — Open Harness CLI (v${VERSION})

Usage:
  oh init [dir]             Scaffold OpenHarness compat files into a repo
  oh config <integration>   Configure an integration via interactive wizard
  oh update                 Upgrade the .oh/ control plane from a newer source
  oh sandbox                Provision and start the sandbox (docker compose up)
  oh shell [container]      Open a zsh shell in the running sandbox container
  oh gateway <args...>      Manage a messaging client session (pi|hermes)
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
  oh update (--from <dir> | --from-remote [--ref <ref>]) [--dry-run] [--force]

Upgrades ONLY the .oh/ control plane (skills, scripts, CLI). Your project
source is left untouched.

Flags:
  --from <dir>    A built OpenHarness checkout to upgrade from.
  --from-remote   Fetch the source checkout from the public OpenHarness repo
                  instead (shallow git clone into a temp dir, removed after
                  the run). Conflicts with --from.
  --ref <ref>     Branch or tag for --from-remote (default: the clone's
                  default branch).
  --dry-run       Preview the changes without writing anything.
  --force         Override the up-to-date / downgrade gate.
`);
}

function printInitHelp(): void {
  process.stdout.write(`oh init — Equip a repo with OpenHarness

Usage:
  oh init [dir] [--minimal] [--yes] [--from <dir> | --from-remote [--ref <ref>]] [--force] [--dry-run] [--templates <dir>]

Scaffolds a complete, locally-buildable OpenHarness project into a target repo
(default: cwd): vendors the .oh/ control plane (incl. context/crons/evals and
the skills/agents/hooks pack), seeds empty memory/ + tasks/, copies the full
.devcontainer/ for a local image build, writes a project AGENTS.md (+ CLAUDE.md),
and configures the .claude/.codex/.pi/.hermes provider surfaces as symlinks into
.oh/skills. In a TTY (without --yes) it runs a short config wizard for
harness.yaml + .devcontainer/.env.

Payload source precedence: --from <dir> > --from-remote > the CLI's own bundled
.oh/ payload. With no source flag and no bundled payload (installed binary —
payload bundling is gated on publishing, #564), oh init prints a one-line
notice and auto-falls back to the remote fetch.

Flags:
  --minimal          Thin scaffold only (compat files + vendored .oh/) — the old
                     behavior; skips devcontainer/providers/seeds
  --copy-claude      Write CLAUDE.md as a copy instead of a symlink -> AGENTS.md
                     (for filesystems without symlink support)
  --yes              Non-interactive: skip the wizard, keep template defaults
  --from <dir>       Vendor the .oh/ payload from this built OpenHarness checkout.
                     Sets ONLY the payload source — templates stay at the CLI's
                     bundled default unless --templates is passed
  --from-remote      Fetch the payload from the public OpenHarness repo (shallow
                     git clone). Unlike --from, this sets BOTH the payload source
                     and the scaffold templates from the fetched checkout.
                     Conflicts with --from and --templates
  --ref <ref>        Branch or tag for --from-remote (default: the clone's
                     default branch)
  --force            Overwrite existing files (prints the overwrite count)
  --dry-run          Print the whole plan without writing anything
  --verbose          List every per-file action (default summarizes vendor noise)
  --templates <dir>  Override the scaffold template source directory
`);
}

/** Exported for tests. */
export function printSandboxHelp(): void {
  process.stdout.write(`oh sandbox — Provision and start the sandbox

Usage:
  oh sandbox

Works from any subdirectory of an equipped repo (walks up to the nearest
directory containing .oh/). Seeds harness.yaml from harness.yaml.example when
the example exists and no harness.yaml does, then delegates to the vendored
compose wrapper:

  bash .oh/scripts/docker-compose.sh --repo-dir <root> up -d --build

Build output streams live; oh sandbox exits with docker compose's exit code.
Takes no flags — it is a pass-through, not a writer.
`);
}

/** Exported for tests. */
export function printShellHelp(): void {
  process.stdout.write(`oh shell — Open a shell in the running sandbox container

Usage:
  oh shell [container]

Runs \`docker exec -it -u sandbox <container> zsh\`. Container-name precedence:
the positional argument > sandbox.name in <root>/harness.yaml (read via the
vendored .oh/scripts/harness-config.sh) > "${DEFAULT_CONTAINER_NAME}". Works from any
subdirectory of an equipped repo; exits with docker's exit code.
`);
}

/** Exported for tests. */
export function printGatewayHelp(): void {
  process.stdout.write(`oh gateway — Manage a messaging client session (Slack bridge)

Usage:
  oh gateway <pi|hermes> [--attach]   start the client session (--attach after)
  oh gateway <pi|hermes> --restart    restart the session
  oh gateway <pi|hermes> --stop       stop the session
  oh gateway status                   show both sessions

Only a LEADING --help/-h is intercepted here; everything else passes through
verbatim to the vendored .oh/scripts/gateway.sh with OH_PROJECT_ROOT set to
the equipped project root. Exits with the script's exit code.
`);
}

function printIntegrationHelp(name: string, integration: Integration): void {
  process.stdout.write(`oh config ${name} — ${integration.description}

Usage:
  oh config ${name}

This launches an interactive wizard. It takes no flags.
`);
}

// ---------------------------------------------------------------------------
// Arg parsing (exported so flag handling is unit-testable; main() stays
// dispatch-only per the cli.property.test.ts process.exit-stub pattern)
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { ok: true; args: T }
  | { ok: false; error: string; showHelp?: boolean };

/** Parsed `oh init` flags. */
export interface InitArgs {
  targetDir?: string;
  /** Set only when `--templates <dir>` was passed (default applied later). */
  templatesDir?: string;
  fromDir?: string;
  fromRemote: boolean;
  ref?: string;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
  minimal: boolean;
  copyClaude: boolean;
  verbose: boolean;
}

export function parseInitArgs(rest: string[]): ParseResult<InitArgs> {
  const args: InitArgs = {
    fromRemote: false,
    yes: false,
    force: false,
    dryRun: false,
    minimal: false,
    copyClaude: false,
    verbose: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--force") {
      args.force = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--yes") {
      args.yes = true;
    } else if (token === "--minimal") {
      args.minimal = true;
    } else if (token === "--copy-claude") {
      args.copyClaude = true;
    } else if (token === "--verbose") {
      args.verbose = true;
    } else if (token === "--from-remote") {
      args.fromRemote = true;
    } else if (token === "--ref") {
      const value = rest[i + 1];
      if (value === undefined) {
        return { ok: false, error: "oh init: --ref requires a ref argument (branch or tag)" };
      }
      args.ref = value;
      i++;
    } else if (token === "--from") {
      const value = rest[i + 1];
      if (value === undefined) {
        return { ok: false, error: "oh init: --from requires a directory argument" };
      }
      args.fromDir = value;
      i++;
    } else if (token === "--templates") {
      const value = rest[i + 1];
      if (value === undefined) {
        return { ok: false, error: "oh init: --templates requires a directory argument" };
      }
      args.templatesDir = value;
      i++;
    } else if (token.startsWith("-")) {
      return { ok: false, error: `oh init: unknown flag "${token}"` };
    } else if (args.targetDir === undefined) {
      args.targetDir = token;
    } else {
      return { ok: false, error: `oh init: unexpected argument "${token}"` };
    }
  }
  if (args.fromRemote && args.fromDir !== undefined) {
    return {
      ok: false,
      error: "oh init: --from-remote conflicts with --from — pass exactly one payload source",
    };
  }
  if (args.fromRemote && args.templatesDir !== undefined) {
    return {
      ok: false,
      error:
        "oh init: --from-remote conflicts with --templates — the remote checkout supplies its own templates",
    };
  }
  if (args.ref !== undefined && !args.fromRemote) {
    return { ok: false, error: "oh init: --ref requires --from-remote" };
  }
  return { ok: true, args };
}

/** Parsed `oh update` flags. */
export interface UpdateArgs {
  help: boolean;
  fromDir?: string;
  fromRemote: boolean;
  ref?: string;
  force: boolean;
  dryRun: boolean;
}

export function parseUpdateArgs(rest: string[]): ParseResult<UpdateArgs> {
  const args: UpdateArgs = { help: false, fromRemote: false, force: false, dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--from") {
      const value = rest[i + 1];
      if (value === undefined) {
        return { ok: false, error: "oh update: --from requires a directory" };
      }
      args.fromDir = value;
      i++;
      continue;
    }
    if (arg === "--from-remote") {
      args.fromRemote = true;
      continue;
    }
    if (arg === "--ref") {
      const value = rest[i + 1];
      if (value === undefined) {
        return { ok: false, error: "oh update: --ref requires a ref argument (branch or tag)" };
      }
      args.ref = value;
      i++;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (isHelpFlag(arg)) {
      args.help = true;
      return { ok: true, args };
    }
    return { ok: false, error: `oh update: unexpected argument "${arg}"`, showHelp: true };
  }
  if (args.fromRemote && args.fromDir !== undefined) {
    return {
      ok: false,
      error: "oh update: --from-remote conflicts with --from — pass exactly one payload source",
    };
  }
  if (args.ref !== undefined && !args.fromRemote) {
    return { ok: false, error: "oh update: --ref requires --from-remote" };
  }
  if (args.fromDir === undefined && !args.fromRemote) {
    return {
      ok: false,
      error:
        "oh update: a payload source is required — pass --from <dir> or --from-remote [--ref <ref>]",
    };
  }
  return { ok: true, args };
}

/** Parsed `oh sandbox` flags — the verb is a pass-through and takes none. */
export interface SandboxArgs {
  help: boolean;
}

export function parseSandboxArgs(rest: string[]): ParseResult<SandboxArgs> {
  if (isHelpFlag(rest[0])) return { ok: true, args: { help: true } };
  const extra = rest[0];
  if (extra !== undefined) {
    return { ok: false, error: `oh sandbox: unexpected argument "${extra}" — the verb takes no flags` };
  }
  return { ok: true, args: { help: false } };
}

/** Parsed `oh shell` args. */
export interface ShellArgs {
  help: boolean;
  container?: string;
}

export function parseShellArgs(rest: string[]): ParseResult<ShellArgs> {
  const args: ShellArgs = { help: false };
  if (isHelpFlag(rest[0])) return { ok: true, args: { help: true } };
  for (const token of rest) {
    if (token.startsWith("-")) {
      return { ok: false, error: `oh shell: unknown flag "${token}"` };
    }
    if (args.container !== undefined) {
      return { ok: false, error: `oh shell: unexpected argument "${token}"` };
    }
    args.container = token;
  }
  return { ok: true, args };
}

/** Parsed `oh gateway` args — everything after a leading help flag is verbatim. */
export interface GatewayArgs {
  help: boolean;
  /** Arguments handed to gateway.sh untouched (never re-interpreted). */
  passthrough: string[];
}

export function parseGatewayArgs(rest: string[]): ParseResult<GatewayArgs> {
  // Intercept ONLY a leading --help/-h; a later --help belongs to the script.
  if (rest[0] === "--help" || rest[0] === "-h") {
    return { ok: true, args: { help: true, passthrough: [] } };
  }
  return { ok: true, args: { help: false, passthrough: [...rest] } };
}

// ---------------------------------------------------------------------------
// Payload-source decision (the bundled-payload seam)
// ---------------------------------------------------------------------------

/** The CLI's own bundled payload paths + an injectable existence predicate. */
export interface BundledPayloadPaths {
  /** The bundled `.oh/` (production: module-level DEFAULT_SOURCE_OH_DIR). */
  sourceOhDir: string;
  /** The bundled `.oh/templates` (production: DEFAULT_TEMPLATES_DIR). */
  templatesDir: string;
  /** Injectable so tests can simulate an installed binary with no payload. */
  exists?: (path: string) => boolean;
}

/**
 * "Does the CLI's own bundled payload exist?" — the auto-fallback decision.
 * Checks for the payload manifest rather than the bare directory: an installed
 * binary's `../..` resolves to some real directory (e.g. `/usr`) that is NOT an
 * OpenHarness payload, so `manifest.json` is the marker distinguishing a real
 * bundled `.oh/` from an unrelated parent dir.
 */
export function bundledPayloadExists(
  bundled: { sourceOhDir: string; templatesDir: string },
  exists: (path: string) => boolean = existsSync,
): boolean {
  return exists(join(bundled.sourceOhDir, "manifest.json")) && exists(bundled.templatesDir);
}

export type InitSource =
  | { kind: "local"; sourceOhDir: string; templatesDir: string }
  | {
      kind: "remote";
      ref?: string;
      /** One-line auto-fallback notice — set ONLY when no source flag was given. */
      notice?: string;
      /**
       * Both payload paths inside a fetched checkout. `--from-remote` sets BOTH
       * `sourceOhDir` AND `templatesDir` (a fetched checkout is complete, so its
       * templates always match its payload) — deliberately unlike `--from`,
       * which sets only `sourceOhDir`.
       */
      paths: (checkoutDir: string) => { sourceOhDir: string; templatesDir: string };
    };

/**
 * Decide where `oh init` sources its payload from.
 *
 * Precedence: `--from-remote` > `--from <dir>` (the flags conflict, so at most
 * one is set) > the CLI's own bundled payload > auto-fallback to a remote fetch
 * when the bundled payload is absent (the installed-binary case — payload
 * bundling into a published binary is gated on publishing, #564).
 *
 * An explicit `--templates <dir>` pins the local path (never silently ignored
 * by the auto-fallback); `runInit`'s preconditions surface any missing source.
 */
export function resolveInitSource(
  args: Pick<InitArgs, "fromDir" | "fromRemote" | "ref" | "templatesDir">,
  bundled: BundledPayloadPaths,
): InitSource {
  const exists = bundled.exists ?? existsSync;
  const remotePaths = (checkoutDir: string): { sourceOhDir: string; templatesDir: string } => ({
    sourceOhDir: join(checkoutDir, ".oh"),
    templatesDir: join(checkoutDir, ".oh", "templates"),
  });

  if (args.fromRemote) {
    return { kind: "remote", ref: args.ref, paths: remotePaths };
  }
  if (args.fromDir !== undefined) {
    // `--from <checkout>` mirrors `oh update --from`: vendor from `<checkout>/.oh`.
    // Templates stay at the bundled default unless --templates overrides them.
    return {
      kind: "local",
      sourceOhDir: resolve(join(args.fromDir, ".oh")),
      templatesDir: args.templatesDir ?? bundled.templatesDir,
    };
  }
  if (args.templatesDir !== undefined || bundledPayloadExists(bundled, exists)) {
    return {
      kind: "local",
      sourceOhDir: bundled.sourceOhDir,
      templatesDir: args.templatesDir ?? bundled.templatesDir,
    };
  }
  // Auto-fallback: no source flags and no bundled payload (installed binary).
  return {
    kind: "remote",
    ref: args.ref,
    notice: `oh init: no bundled payload found — fetching ${DEFAULT_REPO_URL} (${args.ref ?? "default branch"})\n`,
    paths: remotePaths,
  };
}

// ---------------------------------------------------------------------------
// Remote-sourced run wrapper
// ---------------------------------------------------------------------------

/** DI hooks for `runWithRemoteSource` — production callers pass `{ ref }` only. */
export interface RemoteSourceHooks {
  /** Branch/tag to fetch (`--ref`). */
  ref?: string;
  /** Test override: clone URL (a `file://` fixture; default: the public repo). */
  repoUrl?: string;
  /** Test override: the fetch itself. */
  fetch?: (opts: FetchRemoteSourceOptions) => string;
  /** Test override: temp-dir factory (default: mkdtempSync under os.tmpdir()). */
  mkdtemp?: () => string;
  /** Test override: recursive remover for the temp checkout. */
  rm?: (dir: string) => void;
  /** Where the version-skew line goes (default: process.stdout). */
  stdout?: (s: string) => void;
}

/** Version of the FETCHED payload — a file read of `<checkout>/.oh/cli/package.json`. */
function readPayloadVersion(checkoutDir: string): string {
  try {
    const parsed = JSON.parse(
      readFileSync(join(checkoutDir, ".oh", "cli", "package.json"), "utf8"),
    );
    if (parsed && typeof parsed.version === "string") return parsed.version;
  } catch {
    // absent / unparseable → "unknown"
  }
  return "unknown";
}

/**
 * Fetch a remote checkout into a fresh temp dir, run `fn` against it, and ALWAYS
 * remove the temp dir afterwards — the try/finally wraps the ENTIRE downstream
 * runInit/runUpdate call, not just the clone. After a successful fetch, prints
 * `fetched payload v<X> (installed CLI v<Y>)` so version skew is visible (X is
 * read from the FETCHED checkout; Y comes from `__OH_VERSION__` — the CLI never
 * reads its own package.json at runtime).
 */
export async function runWithRemoteSource(
  hooks: RemoteSourceHooks,
  fn: (checkoutDir: string) => Promise<number> | number,
): Promise<number> {
  const fetch = hooks.fetch ?? fetchRemoteSource;
  const mkdtemp = hooks.mkdtemp ?? ((): string => mkdtempSync(join(tmpdir(), "oh-remote-")));
  const rm = hooks.rm ?? ((dir: string): void => rmSync(dir, { recursive: true, force: true }));
  const out = hooks.stdout ?? ((s: string): boolean => process.stdout.write(s));

  const checkoutDir = mkdtemp();
  try {
    fetch({ destDir: checkoutDir, repoUrl: hooks.repoUrl, ref: hooks.ref });
    out(`fetched payload v${readPayloadVersion(checkoutDir)} (installed CLI v${VERSION})\n`);
    return await fn(checkoutDir);
  } finally {
    rm(checkoutDir);
  }
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

    const parsed = parseInitArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      return 1;
    }
    const a = parsed.args;

    const source = resolveInitSource(a, {
      sourceOhDir: DEFAULT_SOURCE_OH_DIR,
      templatesDir: DEFAULT_TEMPLATES_DIR,
    });

    const base = {
      targetDir: resolve(a.targetDir ?? process.cwd()),
      yes: a.yes,
      force: a.force,
      dryRun: a.dryRun,
      minimal: a.minimal,
      copyClaude: a.copyClaude,
      verbose: a.verbose,
    };
    const io: InitIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };

    if (source.kind === "local") {
      const opts: InitOptions = {
        ...base,
        templatesDir: resolve(source.templatesDir),
        sourceOhDir: source.sourceOhDir,
      };
      return await runInit(opts, io);
    }

    if (source.notice) process.stdout.write(source.notice);
    return await runWithRemoteSource({ ref: source.ref }, (checkoutDir) => {
      const p = source.paths(checkoutDir);
      const opts: InitOptions = {
        ...base,
        templatesDir: p.templatesDir,
        sourceOhDir: p.sourceOhDir,
      };
      return runInit(opts, io);
    });
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
    const parsed = parseUpdateArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printUpdateHelp();
      return 1;
    }
    if (parsed.args.help) {
      printUpdateHelp();
      return 0;
    }

    const { fromDir, fromRemote, ref, force, dryRun } = parsed.args;
    const io = {
      stdout: (s: string) => process.stdout.write(s),
      stderr: (s: string) => process.stderr.write(s),
    };
    const targetDir = process.cwd();

    if (fromRemote) {
      return await runWithRemoteSource({ ref }, (checkoutDir) =>
        runUpdate({ targetDir, fromDir: checkoutDir, force, dryRun }, io),
      );
    }
    // parseUpdateArgs guarantees fromDir is set when --from-remote is absent.
    return await runUpdate({ targetDir, fromDir: fromDir as string, force, dryRun }, io);
  }

  if (first === "sandbox") {
    const parsed = parseSandboxArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      return 1;
    }
    if (parsed.args.help) {
      printSandboxHelp();
      return 0;
    }
    return await runSandbox({}, lifecycleIo());
  }

  if (first === "shell") {
    const parsed = parseShellArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      return 1;
    }
    if (parsed.args.help) {
      printShellHelp();
      return 0;
    }
    return runShell({ container: parsed.args.container }, lifecycleIo());
  }

  if (first === "gateway") {
    const parsed = parseGatewayArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      return 1;
    }
    if (parsed.args.help) {
      printGatewayHelp();
      return 0;
    }
    return runGateway(parsed.args.passthrough, {});
  }

  process.stderr.write(`oh: unknown command "${first}"\n\n`);
  printOhHelp();
  return 1;
}

function lifecycleIo(): LifecycleIO {
  return {
    stdout: (s: string) => process.stdout.write(s),
    stderr: (s: string) => process.stderr.write(s),
  };
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`oh: ${msg}\n`);
    process.exit(2);
  },
);
