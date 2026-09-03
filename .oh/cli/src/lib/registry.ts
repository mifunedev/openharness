import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import composeRepo from "../../../../.devcontainer/docker-compose.yml";
import composeImageOnly from "../../../../.devcontainer/docker-compose.image-only.yml";
import composeSsh from "../../../../.devcontainer/docker-compose.ssh.yml";
import composeDockerSock from "../../../../.devcontainer/docker-compose.docker-sock.yml";
import composeWrapper from "../../../scripts/docker-compose.sh";
import checkHostPort from "../../../scripts/check-host-port.sh";
import { spawnRunner, type LifecycleRunner } from "./execution/runner.js";
import { ohConfigPath, readOhConfig } from "./oh-config.js";

export const SANDBOX_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const DEFAULT_NAME_PREFIX = "oh-sbx-";

export function ohHome(): string {
  const configured = process.env.OH_HOME;
  return configured !== undefined && configured !== ""
    ? resolve(configured)
    : join(homedir(), ".oh");
}

export function registryRoot(): string {
  return join(ohHome(), "sandboxes");
}

export function assertSandboxName(name: string): void {
  if (!SANDBOX_NAME_PATTERN.test(name)) {
    throw new Error(
      `invalid sandbox name "${name}" — use lowercase letters, digits and dashes, starting with a letter or digit`,
    );
  }
}

export function entryRoot(name: string): string {
  assertSandboxName(name);
  return join(registryRoot(), name);
}

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

export function listEntries(): string[] {
  const root = registryRoot();
  if (!isDirectory(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => SANDBOX_NAME_PATTERN.test(name))
    .filter((name) => existsSync(ohConfigPath(join(root, name))))
    .sort();
}

export function entryRepo(name: string): string | undefined {
  const config = readOhConfig(ohConfigPath(entryRoot(name)));
  const repo = config.repo;
  return typeof repo === "string" && repo !== "" ? resolve(repo) : undefined;
}

function runningContainerNames(run: LifecycleRunner): Set<string> {
  const names = new Set<string>();
  let result;
  try {
    result = run("docker", ["ps", "--format", "{{.Names}}"], { stdio: "capture" });
  } catch {
    return names;
  }
  if (result.error || result.status !== 0) return names;
  for (const line of (result.stdout ?? "").split("\n")) {
    const name = line.trim();
    if (name !== "") names.add(name);
  }
  return names;
}

export function nextDefaultName(run: LifecycleRunner = spawnRunner): string {
  const taken = new Set<string>(listEntries());
  for (const container of runningContainerNames(run)) taken.add(container);
  for (let n = 1; ; n += 1) {
    const candidate = `${DEFAULT_NAME_PREFIX}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface MaterializeOptions {
  repo?: string;
}

export function materialize(root: string, opts: MaterializeOptions = {}): void {
  const entry = resolve(root);
  const files = [
    {
      rel: ".devcontainer/docker-compose.yml",
      body: opts.repo === undefined ? composeImageOnly : composeRepo,
      mode: 0o644,
    },
    { rel: ".devcontainer/docker-compose.ssh.yml", body: composeSsh, mode: 0o644 },
    { rel: ".devcontainer/docker-compose.docker-sock.yml", body: composeDockerSock, mode: 0o644 },
    { rel: ".oh/scripts/docker-compose.sh", body: composeWrapper, mode: 0o755 },
    { rel: ".oh/scripts/check-host-port.sh", body: checkHostPort, mode: 0o755 },
  ];
  for (const file of files) {
    const dest = resolve(entry, file.rel);
    if (!dest.startsWith(entry + sep)) {
      throw new Error(`refusing to materialize outside the sandbox entry: ${dest}`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.body, { mode: file.mode, encoding: "utf8" });
  }
}

export interface ResolveSandboxOptions {
  name?: string;
  cwd?: string;
}

export function resolveSandboxRoot(opts: ResolveSandboxOptions = {}): string {
  if (opts.name !== undefined) {
    const root = entryRoot(opts.name);
    if (!isDirectory(root)) {
      throw new Error(
        `no sandbox named \`${opts.name}\` in ${registryRoot()} — ` +
          `create one with \`oh sandbox install docker --name ${opts.name}\``,
      );
    }
    return root;
  }

  const names = listEntries();
  if (names.length === 1) return entryRoot(names[0]);

  const cwd = resolve(opts.cwd ?? process.cwd());
  for (const name of names) {
    const repo = entryRepo(name);
    if (repo !== undefined && (cwd === repo || cwd.startsWith(repo + sep))) {
      return entryRoot(name);
    }
  }

  if (names.length === 0) {
    throw new Error(
      `no sandbox is registered in ${registryRoot()} — create one with \`oh sandbox install docker\``,
    );
  }
  throw new Error(
    `several sandboxes are registered in ${registryRoot()} — name one: ${names.join(", ")}`,
  );
}
