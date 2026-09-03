import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveExecutionTarget } from "../lib/execution/index.js";
import { spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import {
  defaultOhConfig,
  ohConfigPath,
  readOhConfig,
  writeOhConfig,
  type OhConfig,
} from "../lib/oh-config.js";
import * as prompt from "../lib/prompt.js";
import {
  assertSandboxName,
  entryRoot,
  listEntries,
  materialize,
  nextDefaultName,
  registryRoot,
} from "../lib/registry.js";
import { findRuntime, runtimeIds } from "../lib/runtimes/catalog.js";
import { runSandbox, type LifecycleIO } from "./lifecycle.js";

export interface SandboxIO extends LifecycleIO {
  ask?: (q: string) => Promise<string>;
}

export interface SandboxInstallOptions {
  runtime: string;
  name?: string;
  repo?: string;
  yes?: boolean;
  image?: boolean;
  imageRef?: string;
  noBuild?: boolean;
  printArgv?: boolean;
  cwd?: string;
  run?: LifecycleRunner;
}

export interface SandboxListOptions {
  json?: boolean;
  run?: LifecycleRunner;
}

function hostTimezone(): string {
  const tz = process.env.TZ;
  return tz !== undefined && tz !== "" ? tz : "UTC";
}

function gitIdentity(run: LifecycleRunner, key: string): string {
  let result;
  try {
    result = run("git", ["config", "--global", key], { stdio: "capture" });
  } catch {
    return "";
  }
  if (result.error || result.status !== 0) return "";
  return (result.stdout ?? "").trim();
}

function readSeedConfig(repo: string | undefined): OhConfig | undefined {
  if (repo === undefined) return undefined;
  const file = ohConfigPath(repo);
  return existsSync(file) ? readOhConfig(file) : undefined;
}

function seedConfig(name: string, repo: string | undefined, run: LifecycleRunner): OhConfig {
  const seed = readSeedConfig(repo);
  const config = defaultOhConfig(name);
  config.runtime = "docker";
  if (repo !== undefined) config.repo = repo;
  config.timezone = seed?.timezone ?? hostTimezone();
  config.git = {
    userName: seed?.git?.userName ?? gitIdentity(run, "user.name"),
    userEmail: seed?.git?.userEmail ?? gitIdentity(run, "user.email"),
  };
  if (seed?.storage?.homePath !== undefined) config.storage = { homePath: seed.storage.homePath };
  config.access = { ...config.access, ...(seed?.access ?? {}) };
  config.image = {
    ...config.image,
    ...(seed?.image ?? {}),
    mode: seed?.image?.mode ?? (repo === undefined ? "image" : "build"),
  };
  return config;
}

async function askDefaulted(
  ask: (q: string) => Promise<string>,
  question: string,
  current: string,
): Promise<string> {
  const answer = (await ask(`${question} [${current === "" ? "blank" : current}]:`)).trim();
  return answer === "" ? current : answer;
}

async function askYesNo(
  ask: (q: string) => Promise<string>,
  question: string,
  current: boolean,
): Promise<boolean> {
  const answer = (await ask(`${question} ${current ? "[Y/n]" : "[y/N]"}`)).trim().toLowerCase();
  if (answer === "") return current;
  return /^y/.test(answer);
}

async function runWizard(config: OhConfig, io: SandboxIO): Promise<void> {
  const ask = io.ask ?? prompt.ask;

  config.name = await askDefaulted(ask, "Sandbox name", config.name ?? "");
  assertSandboxName(config.name);
  config.timezone = await askDefaulted(ask, "Timezone", config.timezone ?? "UTC");
  config.git = {
    userName: await askDefaulted(ask, "Git user name", config.git?.userName ?? ""),
    userEmail: await askDefaulted(ask, "Git user email", config.git?.userEmail ?? ""),
  };

  const ssh = await askYesNo(
    ask,
    "Enable sshd for direct container SSH?",
    config.access?.ssh === true,
  );
  const access = { ...config.access, ssh };
  if (ssh) {
    const port = Number(
      await askDefaulted(ask, "SSH host port", String(config.access?.sshPort ?? 2222)),
    );
    if (Number.isInteger(port) && port >= 1 && port <= 65535) access.sshPort = port;
  }
  access.dockerSocket = await askYesNo(
    ask,
    "Mount host Docker socket into the sandbox? (effectively host root)",
    config.access?.dockerSocket === true,
  );
  config.access = access;
}

export async function runSandboxInstall(
  opts: SandboxInstallOptions,
  io: SandboxIO,
): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const runtime = findRuntime(opts.runtime);
  if (runtime === undefined) {
    io.stderr(
      `oh sandbox install: unknown runtime "${opts.runtime}" — known runtimes: ${runtimeIds().join(", ")}\n`,
    );
    return 1;
  }
  if (!runtime.provisionable) {
    io.stderr(`oh sandbox install: ${runtime.notProvisionableReason}\n`);
    return 1;
  }

  const repo = opts.repo === undefined ? undefined : resolve(opts.repo);
  if (repo !== undefined && !existsSync(repo)) {
    io.stderr(`oh sandbox install: --repo directory does not exist: ${repo}\n`);
    return 1;
  }

  const seed = readSeedConfig(repo);
  const name = opts.name ?? seed?.name ?? nextDefaultName(run);
  try {
    assertSandboxName(name);
  } catch (error) {
    io.stderr(`oh sandbox install: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const config = seedConfig(name, repo, run);
  const interactive =
    opts.yes !== true && (process.stdin.isTTY === true || io.ask !== undefined);
  if (interactive) {
    prompt.header("Configure the sandbox  (press Enter to accept the shown default)");
    await runWizard(config, io);
  }

  const useNoBuild =
    opts.noBuild === true || !(config.repo !== undefined && config.image?.mode === "build");
  const sandboxOpts = {
    run,
    ...(opts.image === true ? { image: true } : {}),
    ...(opts.imageRef !== undefined ? { imageRef: opts.imageRef } : {}),
    ...(useNoBuild ? { noBuild: true } : {}),
  };

  if (opts.printArgv === true) {
    const preview = mkdtempSync(join(tmpdir(), "oh-sandbox-preview-"));
    try {
      writeOhConfig(preview, config);
      materialize(preview, { ...(config.repo !== undefined ? { repo: config.repo } : {}) });
      return await runSandbox({ ...sandboxOpts, cwd: preview, printArgv: true }, io);
    } finally {
      rmSync(preview, { recursive: true, force: true });
    }
  }

  const root = entryRoot(config.name as string);
  mkdirSync(root, { recursive: true });
  writeOhConfig(root, config);
  materialize(root, { ...(config.repo !== undefined ? { repo: config.repo } : {}) });

  const code = await runSandbox({ ...sandboxOpts, cwd: root }, io);
  if (code === 0) io.stdout(`next: oh shell ${config.name}\n`);
  return code;
}

interface SandboxRow {
  name: string;
  runtime: string;
  repo: string;
  status: string;
}

async function entryStatus(root: string, name: string, run: LifecycleRunner): Promise<string> {
  try {
    const target = resolveExecutionTarget({ projectRoot: root, container: name, run });
    return await target.status();
  } catch {
    return "unknown";
  }
}

export async function runSandboxList(opts: SandboxListOptions, io: SandboxIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const rows: SandboxRow[] = [];
  for (const name of listEntries()) {
    const root = entryRoot(name);
    const config = readOhConfig(ohConfigPath(root));
    rows.push({
      name,
      runtime: config.runtime ?? "docker",
      repo: config.repo ?? "-",
      status: await entryStatus(root, name, run),
    });
  }

  if (opts.json === true) {
    io.stdout(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }
  if (rows.length === 0) {
    io.stdout(
      `no sandbox is registered in ${registryRoot()} — create one with \`oh sandbox install docker\`\n`,
    );
    return 0;
  }

  const width = (pick: (row: SandboxRow) => string): number =>
    Math.max(...rows.map((row) => pick(row).length));
  const nameWidth = width((row) => row.name);
  const runtimeWidth = width((row) => row.runtime);
  const statusWidth = width((row) => row.status);
  for (const row of rows) {
    io.stdout(
      `${row.name.padEnd(nameWidth)}  ${row.runtime.padEnd(runtimeWidth)}  ` +
        `${row.status.padEnd(statusWidth)}  ${row.repo}\n`,
    );
  }
  return 0;
}
