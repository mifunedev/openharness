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
  tailscale?: boolean;
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

export type LangfusePrivacyPreset =
  | "metadata-only"
  | "prompts-only"
  | "conversations"
  | "full-debug";

export const LANGFUSE_PRIVACY_PRESETS: readonly LangfusePrivacyPreset[] = [
  "metadata-only",
  "prompts-only",
  "conversations",
  "full-debug",
];

export interface LangfuseSettings {
  baseUrl?: string;
  privacyPreset?: LangfusePrivacyPreset;
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
  langfuse?: LangfuseSettings;
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
      tailscale: false,
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
    langfuse: {},
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
    for (const key of [
      "opencode",
      "grokBuild",
      "deepagents",
      "hermes",
      "agentBrowser",
      "tailscale",
    ]) {
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

  const langfuse = expectSection(record, "langfuse");
  if (langfuse) {
    expectString(langfuse, "baseUrl", "langfuse.");
    expectEnum(langfuse, "privacyPreset", "langfuse.", LANGFUSE_PRIVACY_PRESETS);
  }

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

export type OhConfigFieldType = "string" | "boolean" | "port" | "enum" | "list";

export interface OhConfigField {
  path: string;
  type: OhConfigFieldType;
  values?: readonly string[];
}

export const OH_CONFIG_FIELDS: readonly OhConfigField[] = [
  { path: "name", type: "string" },
  { path: "timezone", type: "string" },
  { path: "projectRoot", type: "string" },
  { path: "git.userName", type: "string" },
  { path: "git.userEmail", type: "string" },
  { path: "install.opencode", type: "boolean" },
  { path: "install.grokBuild", type: "boolean" },
  { path: "install.deepagents", type: "boolean" },
  { path: "install.hermes", type: "boolean" },
  { path: "install.agentBrowser", type: "boolean" },
  { path: "install.tailscale", type: "boolean" },
  { path: "access.ssh", type: "boolean" },
  { path: "access.sshPort", type: "port" },
  { path: "access.sshPasswordAuth", type: "boolean" },
  { path: "access.sshAuthorizedKeys", type: "string" },
  { path: "access.dockerSocket", type: "boolean" },
  { path: "hermesDashboard.enabled", type: "boolean" },
  { path: "hermesDashboard.port", type: "port" },
  { path: "cron.agentBin", type: "string" },
  { path: "build.skipPnpmInstall", type: "boolean" },
  { path: "image.ref", type: "string" },
  { path: "image.mode", type: "enum", values: ["build", "image"] },
  { path: "image.pullPolicy", type: "enum", values: ["missing", "always", "never"] },
  { path: "cloud.apiUrl", type: "string" },
  { path: "langfuse.baseUrl", type: "string" },
  { path: "langfuse.privacyPreset", type: "enum", values: LANGFUSE_PRIVACY_PRESETS },
  { path: "composeOverrides", type: "list" },
];

export function findOhConfigField(path: string): OhConfigField | undefined {
  return OH_CONFIG_FIELDS.find((field) => field.path === path);
}

export function ohConfigFieldPaths(): string[] {
  return OH_CONFIG_FIELDS.map((field) => field.path);
}

export function getOhConfigValue(config: OhConfig, path: string): unknown {
  let cursor: unknown = config;
  for (const segment of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

export function setOhConfigValue(config: OhConfig, path: string, raw: string): OhConfig {
  const field = findOhConfigField(path);
  if (!field) throw new Error(`unknown oh.json field "${path}"`);

  const parsed = coerceFieldValue(field, raw);
  const segments = path.split(".");
  const next: OhConfig = { ...config, version: 1 };

  let cursor = next as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    const section =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[segment] = section;
    cursor = section;
  }
  cursor[segments[segments.length - 1]] = parsed;

  return validateOhConfig(next);
}

function coerceFieldValue(field: OhConfigField, raw: string): unknown {
  if (field.type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw fieldError(field.path, "must be true or false");
  }
  if (field.type === "port") {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw fieldError(field.path, "must be an integer between 1 and 65535");
    }
    return port;
  }
  if (field.type === "enum") {
    const allowed = field.values ?? [];
    if (!allowed.includes(raw)) {
      throw fieldError(field.path, `must be one of ${allowed.join(", ")}`);
    }
    return raw;
  }
  if (field.type === "list") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
  }
  return raw;
}
