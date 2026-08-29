import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { assertInRoot } from "./env-file.js";

const OH_CONFIG_FILE = "oh.json";
const OH_CONFIG_MODE = 0o644;

export type ImageMode = "build" | "image";
export type PullPolicy = "missing" | "always" | "never";

export interface GitIdentity {
  userName?: string;
  userEmail?: string;
}

export interface InstallFlags {
  opencode?: boolean;
  grokBuild?: boolean;
  deepagents?: boolean;
  hermes?: boolean;
  agentBrowser?: boolean;
}

export interface AccessSettings {
  ssh?: boolean;
  sshPort?: number;
  sshPasswordAuth?: boolean;
  sshAuthorizedKeys?: string;
  dockerSocket?: boolean;
}

export interface HermesDashboardSettings {
  enabled?: boolean;
  port?: number;
}

export interface CronSettings {
  agentBin?: string;
}

export interface BuildSettings {
  skipPnpmInstall?: boolean;
}

export interface ImageSettings {
  ref?: string;
  mode?: ImageMode;
  pullPolicy?: PullPolicy;
}

export interface CloudSettings {
  apiUrl?: string;
}

export interface OhConfig {
  version: 1;
  name?: string;
  timezone?: string;
  projectRoot?: string;
  git?: GitIdentity;
  install?: InstallFlags;
  access?: AccessSettings;
  hermesDashboard?: HermesDashboardSettings;
  cron?: CronSettings;
  build?: BuildSettings;
  image?: ImageSettings;
  cloud?: CloudSettings;
  composeOverrides?: string[];
  [key: string]: unknown;
}

export function ohConfigPath(root: string): string {
  return resolve(root, OH_CONFIG_FILE);
}

export function defaultOhConfig(name: string): OhConfig {
  return {
    version: 1,
    name,
    timezone: "America/Los_Angeles",
    projectRoot: "/home/sandbox/harness",
    git: {},
    install: {
      opencode: false,
      grokBuild: false,
      deepagents: false,
      hermes: false,
      agentBrowser: false,
    },
    access: {
      ssh: false,
      sshPort: 2222,
      sshPasswordAuth: false,
      dockerSocket: false,
    },
    hermesDashboard: { enabled: false, port: 9119 },
    cron: { agentBin: "claude" },
    build: { skipPnpmInstall: false },
    image: { mode: "build", pullPolicy: "missing" },
    cloud: {},
    composeOverrides: [],
  };
}

export function readOhConfig(path: string): OhConfig {
  if (!existsSync(path)) return defaultOhConfig(basename(dirname(resolve(path))));

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read ${path}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${OH_CONFIG_FILE} is not valid JSON: ${path}`);
  }
  return validateOhConfig(parsed);
}

export function writeOhConfig(root: string, config: OhConfig): void {
  const path = ohConfigPath(root);
  assertInRoot(path, resolve(root));
  const validated = validateOhConfig({ ...config, version: 1 });
  const body = `${JSON.stringify(validated, null, 2)}\n`;
  const tmp = `${path}.tmp.${process.pid}`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(tmp, body, { mode: OH_CONFIG_MODE, encoding: "utf8" });
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* the temp file never landed */
    }
    throw error;
  }
}

export function validateOhConfig(value: unknown): OhConfig {
  const record = expectObject(value, "");

  if (record.version !== undefined && record.version !== 1) {
    throw fieldError("version", "must be 1");
  }

  expectString(record, "name");
  expectString(record, "timezone");
  expectString(record, "projectRoot");

  const git = expectSection(record, "git");
  if (git) {
    expectString(git, "userName", "git.");
    expectString(git, "userEmail", "git.");
  }

  const install = expectSection(record, "install");
  if (install) {
    for (const key of ["opencode", "grokBuild", "deepagents", "hermes", "agentBrowser"]) {
      expectBoolean(install, key, "install.");
    }
  }

  const access = expectSection(record, "access");
  if (access) {
    expectBoolean(access, "ssh", "access.");
    expectPort(access, "sshPort", "access.");
    expectBoolean(access, "sshPasswordAuth", "access.");
    expectString(access, "sshAuthorizedKeys", "access.");
    expectBoolean(access, "dockerSocket", "access.");
  }

  const dashboard = expectSection(record, "hermesDashboard");
  if (dashboard) {
    expectBoolean(dashboard, "enabled", "hermesDashboard.");
    expectPort(dashboard, "port", "hermesDashboard.");
  }

  const cron = expectSection(record, "cron");
  if (cron) expectString(cron, "agentBin", "cron.");

  const build = expectSection(record, "build");
  if (build) expectBoolean(build, "skipPnpmInstall", "build.");

  const image = expectSection(record, "image");
  if (image) {
    expectString(image, "ref", "image.");
    expectEnum(image, "mode", "image.", ["build", "image"]);
    expectEnum(image, "pullPolicy", "image.", ["missing", "always", "never"]);
  }

  const cloud = expectSection(record, "cloud");
  if (cloud) expectString(cloud, "apiUrl", "cloud.");

  if (record.composeOverrides !== undefined) {
    const list = record.composeOverrides;
    if (!Array.isArray(list)) throw fieldError("composeOverrides", "must be an array of strings");
    for (const entry of list) {
      if (typeof entry !== "string") {
        throw fieldError("composeOverrides", "must be an array of strings");
      }
    }
  }

  return { ...(record as OhConfig), version: 1 };
}

function fieldError(path: string, requirement: string): Error {
  return new Error(`${OH_CONFIG_FILE}: ${path} ${requirement}`);
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw path === ""
      ? new Error(`${OH_CONFIG_FILE}: must contain a JSON object`)
      : fieldError(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function expectSection(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  if (record[key] === undefined) return undefined;
  return expectObject(record[key], key);
}

function expectString(record: Record<string, unknown>, key: string, prefix = ""): void {
  const value = record[key];
  if (value !== undefined && typeof value !== "string") {
    throw fieldError(`${prefix}${key}`, "must be a string");
  }
}

function expectBoolean(record: Record<string, unknown>, key: string, prefix = ""): void {
  const value = record[key];
  if (value !== undefined && typeof value !== "boolean") {
    throw fieldError(`${prefix}${key}`, "must be a boolean");
  }
}

function expectPort(record: Record<string, unknown>, key: string, prefix = ""): void {
  const value = record[key];
  if (value === undefined) return;
  if (typeof value !== "number") throw fieldError(`${prefix}${key}`, "must be a number");
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw fieldError(`${prefix}${key}`, "must be an integer between 1 and 65535");
  }
}

function expectEnum(
  record: Record<string, unknown>,
  key: string,
  prefix: string,
  allowed: readonly string[],
): void {
  const value = record[key];
  if (value === undefined) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw fieldError(`${prefix}${key}`, `must be one of ${allowed.join(", ")}`);
  }
}
