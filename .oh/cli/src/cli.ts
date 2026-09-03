import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
  runShell,
  composeVerbs,
  DEFAULT_CONTAINER_NAME,
  type ComposeVerb,
  type LifecycleIO,
} from "./commands/lifecycle.js";
import {
  runSandboxInstall,
  runSandboxList,
  type SandboxIO,
} from "./commands/sandbox.js";
import {
  runHarnessInstall,
  runHarnessList,
  runHarnessStatus,
  type HarnessIO,
} from "./commands/harness.js";
import { harnessIds } from "./lib/harnesses/catalog.js";
import { RUNTIME_CATALOG } from "./lib/runtimes/catalog.js";
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
  oh sandbox <args...>      Create and list sandboxes (install|list)
  oh shell [name]           Open a zsh shell in the running sandbox container
  oh config <args...>       Read and write oh.json (show|set), or run a wizard
  oh secret <args...>       Read and write the gitignored root .env (set|list)
  oh update                 Vendor or upgrade the .oh/ control plane
  oh stop [name]            Stop the sandbox, preserving volumes
  oh restart [name]         Restart the sandbox service
  oh logs [name]            Tail sandbox logs (follows)
  oh ps [name]              Show sandbox service status
  oh destroy [name]         Remove the sandbox and wipe its named volumes
  oh compose config         Print the resolved docker compose configuration
  oh harness <args...>      Install and inspect agent CLI harnesses
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
  oh config show [--sandbox <name>]
  oh config set <field> <value> [--sandbox <name>]
  oh config repo                  Create your own GitHub repo and point origin at it
  oh config <integration>         Run an integration wizard
  oh config <integration> --help

oh.json holds every non-secret setting and is tracked by git. Credentials live
in the gitignored root .env — write those with \`oh secret set <KEY>\`. Apply a
change with \`oh stop <name> && oh sandbox install docker --name <name>\`. Field
reference:
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
  oh secret set <KEY> [--sandbox <name>]   Prompt for the value (input hidden)
  oh secret list [--sandbox <name>]        List the keys that hold a value

Without --sandbox both verbs write the equipped project root; with it they write
the registry entry \`oh sandbox list\` names.

The value is never read from the command line — an argument would land in your
shell history. \`oh secret list\` never prints a raw value. .env is mode 0600 and
gitignored; every non-secret setting belongs in oh.json (\`oh config set\`).

Keys:
${secretKeyList()}
`);
}

function printUpdateHelp(): void {
  process.stdout.write(`oh update — Vendor or upgrade the .oh/ control plane

Usage:
  oh update [--from <dir> | --from-remote [--ref <ref>]] [--dry-run] [--force]

Writes ONLY the .oh/ control plane and crons/ (skills, scripts, CLI) into the
current directory. An empty directory is equipped from scratch; everything else
in your project is left untouched — it writes no oh.json, .env, AGENTS.md,
.gitignore or .devcontainer/.

Payload source precedence: --from <dir> > --from-remote > the CLI's own bundled
.oh/ payload > a remote fetch announced on one line.

Flags:
  --from <dir>    A built OpenHarness checkout to vendor from.
  --from-remote   Fetch the source checkout from the public OpenHarness repo
                  instead (shallow git clone into a temp dir, removed after
                  the run). Conflicts with --from.
  --ref <ref>     Branch or tag for --from-remote (default: the clone's
                  default branch).
  --dry-run       Preview the changes without writing anything.
  --force         Override the up-to-date / downgrade gate.
`);
}

export function runtimeLines(): string {
  const width = Math.max(...RUNTIME_CATALOG.map((r) => r.id.length));
  return RUNTIME_CATALOG.map(
    (r) => `  ${r.id.padEnd(width)}  ${r.provisionable ? "provisionable" : "planned"}`,
  ).join("\n");
}

export function printSandboxHelp(): void {
  process.stdout.write(`oh sandbox — Create and list sandboxes

Usage:
  oh sandbox install <runtime> [--name <name>] [--repo <dir>] [--yes]
                               [--image[=<ref>]] [--no-build] [--print-argv]
  oh sandbox list [--json]

\`install\` writes a sandbox entry under \${OH_HOME:-~/.oh}/sandboxes/<name>/,
materialises the compose files and the compose wrapper into it, then starts the
container. It needs no project checkout and runs from any directory. Without
--repo the sandbox runs the prebuilt image; with --repo <dir> that checkout is
bound at /home/sandbox/harness and can be built locally.

On a terminal without --yes it asks for the sandbox name, the timezone, the git
identity, SSH (with its host port), and the host Docker socket. With --repo it
seeds those answers from that checkout's oh.json.

Flags:
  --name <name>    Registry entry name (default: the lowest free oh-sbx-<n>)
  --repo <dir>     Bind this checkout into the sandbox and seed the defaults
                   from its oh.json
  --yes            Non-interactive: keep every default and ask nothing
  --image[=<ref>]  Run the prebuilt image instead of building (implies
                   --no-build). Ref resolves last-wins: --image=<ref> >
                   oh.json image.ref > ghcr.io/mifunedev/openharness:latest.
  --no-build       Suppress the local build and reuse an existing image
  --print-argv     Print the docker compose argv that would run, then exit
                   without writing an entry
  --json           Machine-readable output (list)

Runtimes:
${runtimeLines()}

Next: oh shell <name>
`);
}

export function printShellHelp(): void {
  process.stdout.write(`oh shell — Open a shell in the running sandbox container

Usage:
  oh shell [name]

Runs \`docker exec -it -u sandbox <container> zsh\`. [name] is a sandbox entry
from \`oh sandbox list\`; with exactly one registered sandbox, or from inside a
checkout a sandbox was created for, it can be omitted. The container is the
entry's own name, or "${DEFAULT_CONTAINER_NAME}" when the entry sets none. Exits with docker's
exit code.
`);
}

export function printHarnessHelp(): void {
  process.stdout.write(`oh harness — Install and inspect agent CLI harnesses

Usage:
  oh harness list                     List known harnesses and their state
  oh harness install <name>           Install a harness into the sandbox
  oh harness status [name]            Show installed state

\`install\` is the only door: it probes the running sandbox, installs the harness
into the persistent home volume, and reports. It reads and writes no \`oh.json\`
field, and it never rebuilds or restarts the sandbox. It requires a running
sandbox — start one with \`oh sandbox\` first.

Flags:
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

export function printToolHelp(): void {
  process.stdout.write(`oh tool — Install and inspect sandbox tooling

Tooling that is not an agent CLI (see \`oh harness\`) — a headless browser, a
tunnel client, the GitHub CLI, an isolation runtime's own binary.

Usage:
  oh tool list                      List known tools and their state
  oh tool status [name]             Show installed state and version
  oh tool install <name>            Install a tool into the sandbox

Most tools are baked into the image and are report-only; \`install\` works on:
${installableToolIds().map((t) => `  ${t}`).join("\n")}

\`install\` is the only door: it probes the running sandbox, installs the tool
into the persistent home volume, and reports. It reads and writes no \`oh.json\`
field, and it never rebuilds or restarts the sandbox. A large download is
confirmed first, and a non-interactive run without --yes installs nothing.

Flags:
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
  oh ${verb} [name] [-- <extra docker compose args>]

Runs .oh/scripts/docker-compose.sh inside the sandbox entry, the single
implementation. \`oh\` is the only lifecycle door. [name] is a sandbox entry from
\`oh sandbox list\`; with exactly one registered sandbox it can be omitted.

See ${sourceDocsUrl("docs/lifecycle-commands.md")} for every verb.
`);
}

export function printDestroyHelp(): void {
  process.stdout.write(`oh destroy — Remove the sandbox and wipe its named volumes

Usage:
  oh destroy [name] [--yes]

Runs .oh/scripts/docker-compose.sh with \`down -v\`. This is the one destructive
lifecycle verb: \`-v\` deletes the named
volumes, and those volumes hold every agent CLI login, the gh CLI token, and
the SSH keys. Use \`oh stop\` when you only want the containers gone.

Before removing anything it names the volumes it will delete and asks you to
type the sandbox name. A blank line, or any other answer, aborts and changes
nothing. Once \`down -v\` succeeds the registry entry is removed too.

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

export interface SandboxFlag {
  rest: string[];
  sandbox?: string;
}

export function extractSandboxFlag(
  command: string,
  rest: string[],
): ParseResult<SandboxFlag> {
  const kept: string[] = [];
  let sandbox: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== "--sandbox") {
      kept.push(rest[i]);
      continue;
    }
    const value = rest[i + 1];
    if (value === undefined) {
      return { ok: false, error: `${command}: --sandbox requires a sandbox name` };
    }
    sandbox = value;
    i++;
  }
  return { ok: true, args: sandbox === undefined ? { rest: kept } : { rest: kept, sandbox } };
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
  sandbox?: string;
}

export function parseConfigArgs(input: string[]): ParseResult<ConfigArgs> {
  const scoped = extractSandboxFlag("oh config", input);
  if (!scoped.ok) return scoped;
  const rest = scoped.args.rest;
  const args: ConfigArgs = {
    help: false,
    integrationHelp: false,
    ...(scoped.args.sandbox === undefined ? {} : { sandbox: scoped.args.sandbox }),
  };
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
  sandbox?: string;
}

export function parseSecretArgs(input: string[]): ParseResult<SecretArgs> {
  const scoped = extractSandboxFlag("oh secret", input);
  if (!scoped.ok) return scoped;
  const rest = scoped.args.rest;
  const args: SecretArgs = {
    help: false,
    ...(scoped.args.sandbox === undefined ? {} : { sandbox: scoped.args.sandbox }),
  };
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
  name?: string;
}

export function parseDestroyArgs(rest: string[]): ParseResult<DestroyArgs> {
  const args: DestroyArgs = { help: false, yes: false };
  if (isHelpFlag(rest[0])) return { ok: true, args: { ...args, help: true } };
  for (const token of rest) {
    if (token === "--yes") {
      args.yes = true;
    } else if (token.startsWith("-")) {
      return {
        ok: false,
        error: `oh destroy: unknown flag "${token}" — accepts a sandbox name and --yes`,
      };
    } else if (args.name === undefined) {
      args.name = token;
    } else {
      return { ok: false, error: `oh destroy: unexpected argument "${token}"` };
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
  return { ok: true, args };
}

export interface SandboxArgs {
  help: boolean;
  subcommand?: "install" | "list";
  runtime?: string;
  name?: string;
  repo?: string;
  yes: boolean;
  image: boolean;
  imageRef?: string;
  noBuild: boolean;
  printArgv: boolean;
  json: boolean;
}

const SANDBOX_VALUE_FLAGS: Record<string, "name" | "repo"> = {
  "--name": "name",
  "--repo": "repo",
};

export function parseSandboxArgs(rest: string[]): ParseResult<SandboxArgs> {
  const args: SandboxArgs = {
    help: false,
    yes: false,
    image: false,
    noBuild: false,
    printArgv: false,
    json: false,
  };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const [head, ...tail] = rest;
  if (head !== "install" && head !== "list") {
    return {
      ok: false,
      error: `oh sandbox: unknown subcommand "${head}" — expected install or list`,
      showHelp: true,
    };
  }
  args.subcommand = head;
  if (isHelpFlag(tail[0])) return { ok: true, args: { ...args, help: true } };

  const positionals: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i];
    const valueFlag = SANDBOX_VALUE_FLAGS[token];
    if (valueFlag !== undefined) {
      const value = tail[i + 1];
      if (value === undefined) {
        return { ok: false, error: `oh sandbox ${head}: ${token} requires a value` };
      }
      args[valueFlag] = value;
      i++;
    } else if (token === "--yes") {
      args.yes = true;
    } else if (token === "--no-build") {
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
    } else if (token === "--json") {
      args.json = true;
    } else if (token.startsWith("-")) {
      return { ok: false, error: `oh sandbox ${head}: unknown flag "${token}"` };
    } else {
      positionals.push(token);
    }
  }

  if (head === "list") {
    if (positionals.length > 0) {
      return { ok: false, error: `oh sandbox list: unexpected argument "${positionals[0]}"` };
    }
    return { ok: true, args };
  }

  if (positionals.length === 0) {
    return {
      ok: false,
      error: "oh sandbox install: a runtime is required, e.g. `oh sandbox install docker`",
      showHelp: true,
    };
  }
  if (positionals.length > 1) {
    return { ok: false, error: `oh sandbox install: unexpected argument "${positionals[1]}"` };
  }
  args.runtime = positionals[0];
  return { ok: true, args };
}

export interface ShellArgs {
  help: boolean;
  name?: string;
}

export function parseShellArgs(rest: string[]): ParseResult<ShellArgs> {
  const args: ShellArgs = { help: false };
  if (isHelpFlag(rest[0])) return { ok: true, args: { help: true } };
  for (const token of rest) {
    if (token.startsWith("-")) {
      return { ok: false, error: `oh shell: unknown flag "${token}"` };
    }
    if (args.name !== undefined) {
      return { ok: false, error: `oh shell: unexpected argument "${token}"` };
    }
    args.name = token;
  }
  return { ok: true, args };
}

export interface HarnessArgs {
  help: boolean;
  subcommand?: "list" | "install" | "status";
  name?: string;
  json: boolean;
}

export function parseHarnessArgs(rest: string[]): ParseResult<HarnessArgs> {
  const args: HarnessArgs = {
    help: false,
    json: false,
  };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const positionals: string[] = [];
  for (const token of rest) {
    if (token === "--json") {
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
  args.subcommand = sub;
  if (name !== undefined) args.name = name;
  return { ok: true, args };
}

interface ToolArgs {
  help: boolean;
  yes: boolean;
  json: boolean;
  subcommand?: "list" | "install" | "status";
  name?: string;
}

export function parseToolArgs(rest: string[]): ParseResult<ToolArgs> {
  const args: ToolArgs = { help: false, yes: false, json: false };
  if (rest.length === 0 || isHelpFlag(rest[0])) {
    return { ok: true, args: { ...args, help: true } };
  }

  const positionals: string[] = [];
  for (const token of rest) {
    if (token === "--yes" || token === "-y") args.yes = true;
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
  exists?: (path: string) => boolean;
}

export function bundledPayloadExists(
  bundled: { sourceOhDir: string },
  exists: (path: string) => boolean = existsSync,
): boolean {
  return exists(join(bundled.sourceOhDir, "manifest.json"));
}

export type UpdateSource =
  | { kind: "local"; fromDir: string }
  | { kind: "remote"; ref?: string; notice?: string };

export function resolveUpdateSource(
  args: Pick<UpdateArgs, "fromDir" | "fromRemote" | "ref">,
  bundled: BundledPayloadPaths,
): UpdateSource {
  const exists = bundled.exists ?? existsSync;

  if (args.fromDir !== undefined) {
    return { kind: "local", fromDir: resolve(args.fromDir) };
  }
  if (args.fromRemote) {
    return { kind: "remote", ref: args.ref };
  }
  if (bundledPayloadExists(bundled, exists)) {
    return { kind: "local", fromDir: resolve(bundled.sourceOhDir, "..") };
  }
  return {
    kind: "remote",
    ref: args.ref,
    notice: `oh update: no bundled payload found — fetching ${DEFAULT_REPO_URL} (${args.ref ?? "default branch"})\n`,
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
      const scope = a.sandbox === undefined ? {} : { sandbox: a.sandbox };
      if (a.verb === "show") return await runConfigShow(scope, io);
      if (a.verb === "repo") return await runConfigRepo({}, io);
      return await runConfigSet(a.key as string, a.value as string, scope, io);
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
    const scope = a.sandbox === undefined ? {} : { sandbox: a.sandbox };
    if (a.verb === "list") return await runSecretList(scope, io);
    return await runSecretSet(a.key as string, scope, io);
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

    const { force, dryRun } = parsed.args;
    const io = {
      stdout: (s: string) => process.stdout.write(s),
      stderr: (s: string) => process.stderr.write(s),
    };
    const targetDir = process.cwd();
    const source = resolveUpdateSource(parsed.args, { sourceOhDir: DEFAULT_SOURCE_OH_DIR });

    if (source.kind === "local") {
      return await runUpdate({ targetDir, fromDir: source.fromDir, force, dryRun }, io);
    }
    if (source.notice) process.stdout.write(source.notice);
    return await runWithRemoteSource({ ref: source.ref }, (checkoutDir) =>
      runUpdate({ targetDir, fromDir: checkoutDir, force, dryRun }, io),
    );
  }

  if (first === "sandbox") {
    const parsed = parseSandboxArgs(argv.slice(1));
    if (!parsed.ok) {
      process.stderr.write(`${parsed.error}\n`);
      if (parsed.showHelp) printSandboxHelp();
      return 1;
    }
    const a = parsed.args;
    if (a.help) {
      printSandboxHelp();
      return a.subcommand === undefined ? 1 : 0;
    }
    const io: SandboxIO = lifecycleIo();
    if (a.subcommand === "list") return await runSandboxList({ json: a.json }, io);
    return await runSandboxInstall(
      {
        runtime: a.runtime as string,
        ...(a.name !== undefined ? { name: a.name } : {}),
        ...(a.repo !== undefined ? { repo: a.repo } : {}),
        yes: a.yes,
        image: a.image,
        ...(a.imageRef !== undefined ? { imageRef: a.imageRef } : {}),
        noBuild: a.noBuild,
        printArgv: a.printArgv,
      },
      io,
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
    return runShell(
      parsed.args.name === undefined ? {} : { name: parsed.args.name },
      lifecycleIo(),
    );
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
    return await runDestroy(
      {
        yes: parsed.args.yes,
        ...(parsed.args.name !== undefined ? { name: parsed.args.name } : {}),
      },
      lifecycleIo(),
    );
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
    const head = sep === -1 ? rest : rest.slice(0, sep);
    const extra = sep === -1 ? [] : rest.slice(sep + 1);
    if (head.length > 0 && head[0].startsWith("-")) {
      process.stderr.write(`oh ${verb}: unknown flag "${head[0]}"\n`);
      return 1;
    }
    if (head.length > 1) {
      process.stderr.write(
        `oh ${verb}: unexpected argument "${head[1]}" — pass extra docker compose args after \`--\`\n`,
      );
      return 1;
    }
    return runComposeVerb(verb, head.length === 0 ? {} : { name: head[0] }, extra);
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
      return await runHarnessList({ json: a.json }, io);
    }
    if (a.subcommand === "status") {
      return await runHarnessStatus(a.name, { json: a.json }, io);
    }
    return await runHarnessInstall(a.name as string, {}, io);
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
    return await runToolInstall(a.name as string, { yes: a.yes }, io);
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
