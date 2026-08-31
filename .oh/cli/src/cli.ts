import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runInit, type InitIO, type InitOptions } from "./commands/init.js";
import { runUpdate } from "./commands/update.js";
import { runCloud } from "./commands/cloud.js";
import {
  configFieldList,
  runConfigRepo,
  runConfigSet,
  runConfigShow,
  type ConfigIO,
} from "./commands/config.js";
import {
  runSecretList,
  runSecretSet,
  secretKeyList,
  type SecretIO,
} from "./commands/secret.js";
import {
  runComposeConfig,
  runComposeVerb,
  runDestroy,
  runGateway,
  runSandbox,
  runShell,
  composeVerbs,
  DEFAULT_CONTAINER_NAME,
  type ComposeVerb,
  type LifecycleIO,
} from "./commands/lifecycle.js";
import {
  runHarnessInstall,
  runHarnessList,
  runHarnessStatus,
  type HarnessIO,
} from "./commands/harness.js";
import { harnessIds } from "./lib/harnesses/catalog.js";
import {
  runRuntimeInstall,
  runRuntimeList,
  runRuntimeStatus,
  type RuntimeIO,
} from "./commands/runtime.js";
import { DEFAULT_RUNTIME, runtimeIds } from "./lib/runtimes/catalog.js";
import {
  runToolInstall,
  runToolList,
  runToolStatus,
  type ToolIO,
} from "./commands/tool.js";
import { installableToolIds, toolIds } from "./lib/tools/catalog.js";
import { sourceDocsUrl } from "./lib/docs.js";
import {
  fetchRemoteSource,
  DEFAULT_REPO_URL,
  type FetchRemoteSourceOptions,
} from "./lib/remote.js";

declare const __OH_VERSION__: string;
const VERSION: string = typeof __OH_VERSION__ === "string" ? __OH_VERSION__ : "0.0.0-dev";

const DEFAULT_TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

const DEFAULT_SOURCE_OH_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

interface Integration {
  description: string;
  runner: () => Promise<number>;
}

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

export function printOhHelp(): void {
  process.stdout.write(`oh — Open Harness CLI (v${VERSION})

Usage:
  oh init [dir]             Scaffold OpenHarness compat files into a repo
  oh config <args...>       Read and write oh.json (show|set), or run a wizard
  oh secret <args...>       Read and write the gitignored root .env (set|list)
  oh update                 Upgrade the .oh/ control plane from a newer source
  oh sandbox                Provision and start the sandbox (docker compose up)
  oh shell [container]      Open a zsh shell in the running sandbox container
  oh stop                   Stop the sandbox, preserving volumes
  oh restart                Restart the sandbox service
  oh logs                   Tail sandbox logs (follows)
  oh ps                     Show sandbox service status
  oh destroy                Remove the sandbox and wipe its named volumes
  oh compose config         Print the resolved docker compose configuration
  oh harness <args...>      Install and inspect agent CLI harnesses
  oh runtime <args...>      Inspect the sandbox's isolation runtime
  oh tool <args...>         Install and inspect sandbox tooling
  oh gateway <args...>      Manage a messaging client session (pi|hermes)
  oh cloud <args...>        Manage OpenHarness Cloud nodes
  oh --version              Print version
  oh --help                 Show this help

Integrations:
${integrationLines()}
`);
}

function printConfigHelp(): void {
  process.stdout.write(`oh config — Read and write oh.json, the tracked non-secret settings

Usage:
  oh config show                  Print the resolved oh.json
  oh config set <field> <value>   Set one dotted field, e.g. access.sshPort 2222
  oh config repo                  Create your own GitHub repo and point origin at it
  oh config <integration>         Run an integration wizard
  oh config <integration> --help

oh.json holds every non-secret setting and is tracked by git. Credentials live
in the gitignored root .env — write those with \`oh secret set <KEY>\`. Apply a
change with \`oh stop && oh sandbox\`. Field reference:
${sourceDocsUrl("docs/configuration.md")}

Fields:
${configFieldList()}

Integrations:
${integrationLines()}
`);
}

export function printSecretHelp(): void {
  process.stdout.write(`oh secret — Read and write the gitignored root .env

Usage:
  oh secret set <KEY>   Prompt for the value (input hidden) and write it to .env
  oh secret list        List the keys that hold a value, with redacted values

The value is never read from the command line — an argument would land in your
shell history. \`oh secret list\` never prints a raw value. .env is mode 0600 and
gitignored; every non-secret setting belongs in oh.json (\`oh config set\`).

Keys:
${secretKeyList()}
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
(default: cwd): vendors the .oh/ control plane (incl. crons/evals and
the skills/agents/hooks pack), seeds an empty tasks/, copies the full
.devcontainer/ for a local image build, writes a project AGENTS.md (+ CLAUDE.md),
and configures the .claude/.codex/.pi/.hermes provider surfaces as symlinks into
.oh/skills. In a TTY (without --yes) it runs a short config wizard that writes
.devcontainer/.env.

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

export function printSandboxHelp(): void {
  process.stdout.write(`oh sandbox — Provision and start the sandbox

Usage:
  oh sandbox [--image[=<ref>]] [--no-build] [--print-argv]

Works from any subdirectory of an equipped repo (walks up to the nearest
directory containing .oh/). Delegates to the vendored compose wrapper:

  bash .oh/scripts/docker-compose.sh --repo-dir <root> up -d --build

By default it builds the image locally. Prebuilt-image mode skips that build:

Flags:
  --image[=<ref>]  Run the prebuilt image instead of building locally (implies
                   --no-build). Ref resolves last-wins: --image=<ref> >
                   .devcontainer/.env OH_SANDBOX_IMAGE >
                   ghcr.io/mifunedev/openharness:latest.
  --print-argv     Print the docker compose argv that would run, then exit.
  --no-build       Suppress the local build and reuse an existing image without
                   pinning one (advanced; pairs with a prior build or --image).

Build/pull output streams live; oh sandbox exits with docker compose's exit code.
`);
}

export function printShellHelp(): void {
  process.stdout.write(`oh shell — Open a shell in the running sandbox container

Usage:
  oh shell [container]

Runs \`docker exec -it -u sandbox <container> zsh\`. Container-name precedence:
the positional argument > SANDBOX_NAME in <root>/.devcontainer/.env >
"${DEFAULT_CONTAINER_NAME}". Works from any subdirectory of an equipped repo;
exits with docker's exit code.
`);
}

export function printHarnessHelp(): void {
  process.stdout.write(`oh harness — Install and inspect agent CLI harnesses

Usage:
  oh harness list [--defaults]        List known harnesses and their state
  oh harness install <name>           Install a harness into the sandbox
  oh harness status [name]            Show installed/enabled state

\`install\` does BOTH halves: it sets the \`oh.json\` install.* field so the choice
survives the next image build, AND installs into the already-running container
so the harness is usable now. It never rebuilds or restarts the
sandbox. When the sandbox is not running it persists the flag, prints a hint,
and exits 0.

Flags:
  --persist-only   Only set the oh.json install.* field (no container work)
  --no-persist     Live-install only; leave oh.json unchanged
  --defaults       List only kind:"default" harnesses (list)
  --json           Machine-readable output (list/status)

Harnesses:
${harnessIds().map((h) => `  ${h}`).join("\n")}
`);
}

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


export type ParseResult<T> =
  | { ok: true; args: T }
  | { ok: false; error: string; showHelp?: boolean };

export interface InitArgs {
  targetDir?: string;
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

export function printRuntimeHelp(): void {
  process.stdout.write(`oh runtime — Inspect the sandbox's isolation runtime

A runtime is the isolation boundary the sandbox runs ON (a Docker container
today). A harness is an agent CLI that runs INSIDE it — see \`oh harness\`.

Usage:
  oh runtime list                   Every known runtime, and which one is in use
  oh runtime status [name]          The measured requirements behind each verdict
  oh runtime install [name]         Install a runtime into the sandbox
                                    (default: ${DEFAULT_RUNTIME})

This command REPORTS, and installs a tool. It selects no runtime, writes no
config, and changes nothing about how the sandbox boots — choosing one is
tracked in #731 (see #806 for the open selector decision).

\`install\` measures first and refuses to run an installer that cannot succeed,
printing each unmet requirement with its remediation. \`--force\` overrides that
judgement.

Flags:
  --force          Attempt the install even when the preflight fails
  --json           Machine-readable output (list/status)

Runtimes:
${runtimeIds().map((r) => `  ${r}`).join("\n")}
`);
}

export function printToolHelp(): void {
  process.stdout.write(`oh tool — Install and inspect sandbox tooling

Tooling that is neither an agent CLI (see \`oh harness\`) nor an isolation
runtime (see \`oh runtime\`) — a headless browser, a tunnel client, the
GitHub CLI.

Usage:
  oh tool list                      List known tools and their state
  oh tool status [name]             Show installed state and version
  oh tool install <name>            Install a tool into the sandbox

Most tools are baked into the image and are report-only; \`install\` works on:
${installableToolIds().map((t) => `  ${t}`).join("\n")}

\`install\` does BOTH halves: it sets the \`oh.json\` install.* field so the choice
survives the next container start, AND installs into the already-running
container. It never rebuilds or restarts the sandbox. A large download is
confirmed first, and a non-interactive run without --yes installs nothing.

Flags:
  --persist-only   Only set the oh.json install.* field (no container work)
  --no-persist     Live-install only; leave oh.json unchanged
  --yes            Accept a large download without prompting
  --json           Machine-readable output (list/status)

Tools:
${toolIds().map((t) => `  ${t}`).join("\n")}
`);
}

export function printComposeVerbHelp(verb: ComposeVerb): void {
  const what: Record<ComposeVerb, string> = {
    stop: "Stop the sandbox, preserving volumes for a later restart",
    restart: "Restart the sandbox service",
    logs: "Tail the sandbox compose logs (follows until interrupted)",
    ps: "Show sandbox service status",
    destroy: "Remove the sandbox and wipe its named volumes",
  };
  process.stdout.write(`oh ${verb} — ${what[verb]}

Usage:
  oh ${verb} [-- <extra docker compose args>]

Runs .oh/scripts/docker-compose.sh, the single implementation. \`oh\` is the only
lifecycle door and works anywhere: a source checkout, an \`oh init\` repo, or
inside the sandbox.

See ${sourceDocsUrl("docs/lifecycle-commands.md")} for every verb.
`);
}

export function printDestroyHelp(): void {
  process.stdout.write(`oh destroy — Remove the sandbox and wipe its named volumes

Usage:
  oh destroy [--yes]

Runs .oh/scripts/docker-compose.sh with \`down -v\`. This is the one destructive
lifecycle verb: \`-v\` deletes the named
volumes, and those volumes hold every agent CLI login, the gh CLI token, and
the SSH keys. Use \`oh stop\` when you only want the containers gone.

Before removing anything it names the volumes it will delete and asks you to
type the sandbox name. A blank line, or any other answer, aborts and changes
nothing.

Flags:
  --yes   Skip the prompt. Required when stdin is not a terminal — without a
          terminal and without --yes, \`oh destroy\` refuses rather than guess.

See ${sourceDocsUrl("docs/lifecycle-commands.md")} for the full mapping.
`);
}

export function printComposeHelp(): void {
  process.stdout.write(`oh compose — Inspect the resolved docker compose setup

Usage:
  oh compose config [-- <extra docker compose args>]

Subcommands:
  config   Print the compose configuration .oh/scripts/docker-compose.sh
           resolves from .devcontainer/.env and .oh/config.json

Namespaced under \`oh compose\` because \`oh config <integration>\` already means
"run an integration wizard", and \`oh config show/set\` reads and writes oh.json.

See ${sourceDocsUrl("docs/lifecycle-commands.md")} for every verb.
`);
}

export const CONFIG_VERBS = ["show", "set", "repo"] as const;

export type ConfigVerb = (typeof CONFIG_VERBS)[number];

export interface ConfigArgs {
  help: boolean;
  verb?: ConfigVerb;
  integration?: string;
  integrationHelp: boolean;
  key?: string;
  value?: string;
}

export function parseConfigArgs(rest: string[]): ParseResult<ConfigArgs> {
  const args: ConfigArgs = { help: false, integrationHelp: false };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const [head, ...tail] = rest;
  if (!(CONFIG_VERBS as readonly string[]).includes(head)) {
    if (tail.length > 0 && isHelpFlag(tail[0])) {
      return { ok: true, args: { ...args, integration: head, integrationHelp: true } };
    }
    if (tail.length > 0) {
      return {
        ok: false,
        error: `oh config ${head}: unexpected argument "${tail[0]}". This wizard takes no flags.`,
      };
    }
    return { ok: true, args: { ...args, integration: head } };
  }

  const verb = head as ConfigVerb;
  if (isHelpFlag(tail[0])) return { ok: true, args: { ...args, help: true } };

  if (verb === "show" || verb === "repo") {
    if (tail.length > 0) {
      return { ok: false, error: `oh config ${verb}: unexpected argument "${tail[0]}"` };
    }
    return { ok: true, args: { ...args, verb } };
  }

  const [key, value, ...extra] = tail;
  if (key === undefined || value === undefined) {
    return {
      ok: false,
      error: "oh config set: a field and a value are required, e.g. `oh config set access.sshPort 2222`",
      showHelp: true,
    };
  }
  if (extra.length > 0) {
    return {
      ok: false,
      error: `oh config set: unexpected argument "${extra[0]}" — quote a value that contains spaces`,
    };
  }
  return { ok: true, args: { ...args, verb, key, value } };
}

export const SECRET_VERBS = ["set", "list"] as const;

export type SecretVerb = (typeof SECRET_VERBS)[number];

export interface SecretArgs {
  help: boolean;
  verb?: SecretVerb;
  key?: string;
}

export function parseSecretArgs(rest: string[]): ParseResult<SecretArgs> {
  const args: SecretArgs = { help: false };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const [head, ...tail] = rest;
  if (!(SECRET_VERBS as readonly string[]).includes(head)) {
    return {
      ok: false,
      error: `oh secret: unknown subcommand "${head}" — expected set or list`,
      showHelp: true,
    };
  }

  const verb = head as SecretVerb;
  if (isHelpFlag(tail[0])) return { ok: true, args: { ...args, help: true } };

  if (verb === "list") {
    if (tail.length > 0) {
      return { ok: false, error: `oh secret list: unexpected argument "${tail[0]}"` };
    }
    return { ok: true, args: { ...args, verb } };
  }

  const [key, ...extra] = tail;
  if (key === undefined) {
    return { ok: false, error: "oh secret set: a key is required", showHelp: true };
  }
  if (extra.length > 0) {
    return {
      ok: false,
      error:
        "oh secret set: takes only a key — the value is prompted for, never passed on the command line where your shell history would keep it",
    };
  }
  return { ok: true, args: { ...args, verb, key } };
}

export interface DestroyArgs {
  help: boolean;
  yes: boolean;
}

export function parseDestroyArgs(rest: string[]): ParseResult<DestroyArgs> {
  const args: DestroyArgs = { help: false, yes: false };
  if (isHelpFlag(rest[0])) return { ok: true, args: { ...args, help: true } };
  for (const token of rest) {
    if (token === "--yes") {
      args.yes = true;
    } else {
      return {
        ok: false,
        error: `oh destroy: unexpected argument "${token}" — accepts only --yes`,
      };
    }
  }
  return { ok: true, args };
}

export interface ComposeArgs {
  help: boolean;
  subcommand?: "config";
  passthrough: string[];
}

export function parseComposeArgs(rest: string[]): ParseResult<ComposeArgs> {
  const args: ComposeArgs = { help: false, passthrough: [] };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }
  if (rest[0] !== "config") {
    return {
      ok: false,
      error: `oh compose: unknown subcommand "${rest[0]}"`,
      showHelp: true,
    };
  }
  args.subcommand = "config";
  const tail = rest.slice(1);
  if (isHelpFlag(tail[0])) return { ok: true, args: { ...args, help: true } };
  const sep = tail.indexOf("--");
  if (sep === -1 && tail.length > 0) {
    return {
      ok: false,
      error: `oh compose config: unexpected argument "${tail[0]}" — pass extra docker compose args after \`--\``,
    };
  }
  if (sep !== -1) args.passthrough = tail.slice(sep + 1);
  return { ok: true, args };
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

export interface SandboxArgs {
  help: boolean;
  image: boolean;
  imageRef?: string;
  noBuild: boolean;
  printArgv?: boolean;
}

export function parseSandboxArgs(rest: string[]): ParseResult<SandboxArgs> {
  if (isHelpFlag(rest[0])) {
    return { ok: true, args: { help: true, image: false, noBuild: false } };
  }
  const args: SandboxArgs = { help: false, image: false, noBuild: false };
  for (const token of rest) {
    if (token === "--no-build") {
      args.noBuild = true;
    } else if (token === "--print-argv") {
      args.printArgv = true;
    } else if (token === "--image") {
      args.image = true;
    } else if (token.startsWith("--image=")) {
      const ref = token.slice("--image=".length);
      if (ref === "") {
        return { ok: false, error: "oh sandbox: --image=<ref> requires a non-empty image ref" };
      }
      args.image = true;
      args.imageRef = ref;
    } else {
      return {
        ok: false,
        error: `oh sandbox: unexpected argument "${token}" — accepts only --image[=<ref>], --no-build and --print-argv`,
      };
    }
  }
  return { ok: true, args };
}

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

export interface HarnessArgs {
  help: boolean;
  subcommand?: "list" | "install" | "status";
  name?: string;
  persistOnly: boolean;
  noPersist: boolean;
  defaultsOnly: boolean;
  json: boolean;
}

export function parseHarnessArgs(rest: string[]): ParseResult<HarnessArgs> {
  const args: HarnessArgs = {
    help: false,
    persistOnly: false,
    noPersist: false,
    defaultsOnly: false,
    json: false,
  };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const positionals: string[] = [];
  for (const token of rest) {
    if (token === "--persist-only") {
      args.persistOnly = true;
    } else if (token === "--no-persist") {
      args.noPersist = true;
    } else if (token === "--defaults") {
      args.defaultsOnly = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token.startsWith("-")) {
      return { ok: false, error: `oh harness: unknown flag "${token}"` };
    } else {
      positionals.push(token);
    }
  }

  const [sub, name, ...extra] = positionals;
  if (sub !== "list" && sub !== "install" && sub !== "status") {
    return {
      ok: false,
      error: `oh harness: unknown subcommand "${sub}" — expected list, install, or status`,
      showHelp: true,
    };
  }
  if (extra.length > 0) {
    return { ok: false, error: `oh harness: unexpected argument "${extra[0]}"` };
  }
  if (sub === "install" && name === undefined) {
    return { ok: false, error: "oh harness install: a harness name is required", showHelp: true };
  }
  if (sub === "list" && name !== undefined) {
    return { ok: false, error: `oh harness list: unexpected argument "${name}"` };
  }
  if (args.defaultsOnly && sub !== "list") {
    return {
      ok: false,
      error: `oh harness ${sub}: --defaults applies to \`oh harness list\` only`,
    };
  }
  if (args.persistOnly && args.noPersist) {
    return {
      ok: false,
      error: "oh harness: --persist-only conflicts with --no-persist — pass at most one",
    };
  }

  args.subcommand = sub;
  if (name !== undefined) args.name = name;
  return { ok: true, args };
}

interface RuntimeArgs {
  help: boolean;
  force: boolean;
  json: boolean;
  subcommand?: "list" | "install" | "status";
  name?: string;
}

export function parseRuntimeArgs(rest: string[]): ParseResult<RuntimeArgs> {
  const args: RuntimeArgs = { help: false, force: false, json: false };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const positionals: string[] = [];
  for (const token of rest) {
    if (token === "--force") {
      args.force = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token.startsWith("-")) {
      return { ok: false, error: `oh runtime: unknown flag "${token}"` };
    } else {
      positionals.push(token);
    }
  }

  const [sub, name, ...extra] = positionals;
  if (sub !== "list" && sub !== "install" && sub !== "status") {
    return {
      ok: false,
      error: `oh runtime: unknown subcommand "${sub}" — expected list, install, or status`,
      showHelp: true,
    };
  }
  if (extra.length > 0) {
    return { ok: false, error: `oh runtime: unexpected argument "${extra[0]}"` };
  }
  if (sub === "list" && name !== undefined) {
    return { ok: false, error: `oh runtime list: unexpected argument "${name}"` };
  }

  args.subcommand = sub;
  if (name !== undefined) args.name = name;
  else if (sub === "install") args.name = DEFAULT_RUNTIME;
  return { ok: true, args };
}

interface ToolArgs {
  help: boolean;
  persistOnly: boolean;
  noPersist: boolean;
  yes: boolean;
  json: boolean;
  subcommand?: "list" | "install" | "status";
  name?: string;
}

export function parseToolArgs(rest: string[]): ParseResult<ToolArgs> {
  const args: ToolArgs = {
    help: false, persistOnly: false, noPersist: false, yes: false, json: false,
  };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const positionals: string[] = [];
  for (const token of rest) {
    if (token === "--persist-only") args.persistOnly = true;
    else if (token === "--no-persist") args.noPersist = true;
    else if (token === "--yes" || token === "-y") args.yes = true;
    else if (token === "--json") args.json = true;
    else if (token.startsWith("-")) {
      return { ok: false, error: `oh tool: unknown flag "${token}"` };
    } else positionals.push(token);
  }

  const [sub, name, ...extra] = positionals;
  if (sub !== "list" && sub !== "install" && sub !== "status") {
    return {
      ok: false,
      error: `oh tool: unknown subcommand "${sub}" — expected list, install, or status`,
      showHelp: true,
    };
  }
  if (extra.length > 0) {
    return { ok: false, error: `oh tool: unexpected argument "${extra[0]}"` };
  }
  if (sub === "install" && name === undefined) {
    return { ok: false, error: "oh tool install: a tool name is required", showHelp: true };
  }
  if (sub === "list" && name !== undefined) {
    return { ok: false, error: `oh tool list: unexpected argument "${name}"` };
  }
  if (args.persistOnly && args.noPersist) {
    return {
      ok: false,
      error: "oh tool: --persist-only conflicts with --no-persist — pass at most one",
    };
  }

  args.subcommand = sub;
  if (name !== undefined) args.name = name;
  return { ok: true, args };
}



export interface GatewayArgs {
  help: boolean;
  passthrough: string[];
}

export function parseGatewayArgs(rest: string[]): ParseResult<GatewayArgs> {
  if (rest[0] === "--help" || rest[0] === "-h") {
    return { ok: true, args: { help: true, passthrough: [] } };
  }
  return { ok: true, args: { help: false, passthrough: [...rest] } };
}


export interface BundledPayloadPaths {
  sourceOhDir: string;
  templatesDir: string;
  exists?: (path: string) => boolean;
}

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
      notice?: string;
      paths: (checkoutDir: string) => { sourceOhDir: string; templatesDir: string };
    };

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
  return {
    kind: "remote",
    ref: args.ref,
    notice: `oh init: no bundled payload found — fetching ${DEFAULT_REPO_URL} (${args.ref ?? "default branch"})\n`,
    paths: remotePaths,
  };
}


export interface RemoteSourceHooks {
  ref?: string;
  repoUrl?: string;
  fetch?: (opts: FetchRemoteSourceOptions) => string;
  mkdtemp?: () => string;
  rm?: (dir: string) => void;
  stdout?: (s: string) => void;
}

function readPayloadVersion(checkoutDir: string): string {
  try {
    const parsed = JSON.parse(
      readFileSync(join(checkoutDir, ".oh", "cli", "package.json"), "utf8"),
    );
    if (parsed && typeof parsed.version === "string") return parsed.version;
  } catch {
  }
  return "unknown";
}

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
  const [first, second] = argv;

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
    const parsed = parseConfigArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printConfigHelp();
      return 1;
    }
    const a = parsed.args;
    if (a.help) {
      printConfigHelp();
      return second === undefined ? 1 : 0;
    }

    if (a.verb !== undefined) {
      const io: ConfigIO = {
        stdout: (s) => process.stdout.write(s),
        stderr: (s) => process.stderr.write(s),
      };
      if (a.verb === "show") return await runConfigShow({}, io);
      if (a.verb === "repo") return await runConfigRepo({}, io);
      return await runConfigSet(a.key as string, a.value as string, {}, io);
    }

    const name = a.integration as string;
    const integration = INTEGRATIONS[name];
    if (!integration) {
      process.stderr.write(`oh config: unknown integration "${name}"\n\n`);
      printConfigHelp();
      return 1;
    }
    if (a.integrationHelp) {
      printIntegrationHelp(name, integration);
      return 0;
    }
    return await integration.runner();
  }

  if (first === "secret") {
    const parsed = parseSecretArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printSecretHelp();
      return 1;
    }
    const a = parsed.args;
    if (a.help) {
      printSecretHelp();
      return 0;
    }
    const io: SecretIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };
    if (a.verb === "list") return await runSecretList({}, io);
    return await runSecretSet(a.key as string, {}, io);
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
    return await runSandbox(
      {
        image: parsed.args.image,
        imageRef: parsed.args.imageRef,
        noBuild: parsed.args.noBuild,
        printArgv: parsed.args.printArgv === true,
      },
      lifecycleIo(),
    );
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

  if (first === "destroy") {
    const parsed = parseDestroyArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      return 1;
    }
    if (parsed.args.help) {
      printDestroyHelp();
      return 0;
    }
    return await runDestroy({ yes: parsed.args.yes }, lifecycleIo());
  }

  if (first === "compose") {
    const parsed = parseComposeArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printComposeHelp();
      return 1;
    }
    if (parsed.args.help) {
      printComposeHelp();
      return 0;
    }
    return runComposeConfig({}, parsed.args.passthrough);
  }

  if ((composeVerbs() as string[]).includes(first)) {
    const verb = first as ComposeVerb;
    const rest = argv.slice(1);
    if (isHelpFlag(rest[0])) {
      printComposeVerbHelp(verb);
      return 0;
    }
    const sep = rest.indexOf("--");
    if (sep === -1 && rest.length > 0) {
      process.stderr.write(
        `oh ${verb}: unexpected argument "${rest[0]}" — pass extra docker compose args after \`--\`\n`,
      );
      return 1;
    }
    return runComposeVerb(verb, {}, sep === -1 ? [] : rest.slice(sep + 1));
  }

  if (first === "harness") {
    const parsed = parseHarnessArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printHarnessHelp();
      return 1;
    }
    if (parsed.args.help) {
      printHarnessHelp();
      return 0;
    }
    const a = parsed.args;
    const io: HarnessIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };
    if (a.subcommand === "list") {
      return await runHarnessList({ json: a.json, defaultsOnly: a.defaultsOnly }, io);
    }
    if (a.subcommand === "status") {
      return await runHarnessStatus(a.name, { json: a.json }, io);
    }
    return await runHarnessInstall(
      a.name as string,
      { persistOnly: a.persistOnly, noPersist: a.noPersist },
      io,
    );
  }

  if (first === "runtime") {
    const parsed = parseRuntimeArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printRuntimeHelp();
      return 1;
    }
    if (parsed.args.help) {
      printRuntimeHelp();
      return 0;
    }
    const a = parsed.args;
    const io: RuntimeIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };
    if (a.subcommand === "list") {
      return await runRuntimeList({ json: a.json }, io);
    }
    if (a.subcommand === "status") {
      return await runRuntimeStatus(a.name, { json: a.json }, io);
    }
    return await runRuntimeInstall(a.name as string, { force: a.force }, io);
  }

  if (first === "tool") {
    const parsed = parseToolArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printToolHelp();
      return 1;
    }
    if (parsed.args.help) {
      printToolHelp();
      return 0;
    }
    const a = parsed.args;
    const io: ToolIO = {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    };
    if (a.subcommand === "list") {
      return await runToolList({ json: a.json }, io);
    }
    if (a.subcommand === "status") {
      return await runToolStatus(a.name, { json: a.json }, io);
    }
    return await runToolInstall(
      a.name as string,
      { persistOnly: a.persistOnly, noPersist: a.noPersist, yes: a.yes },
      io,
    );
  }

  if (first === "cloud") {
    return await runCloud(argv.slice(1), {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    });
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
