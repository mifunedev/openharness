import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { loadEnvInto } from "./env.js";


const ENV_FILE = ".devcontainer/.env";
const ENV_EXAMPLE = ".devcontainer/.example.env";

export function assertInRoot(dest: string, root: string): void {
  if (!(dest === root || dest.startsWith(root + sep))) {
    throw new Error(`refusing to write outside the project root: ${dest}`);
  }
}

export function envFilePath(root: string): string {
  return resolve(root, ENV_FILE);
}

export function seedEnvFile(root: string): boolean {
  const dest = envFilePath(root);
  const example = resolve(root, ENV_EXAMPLE);
  assertInRoot(dest, root);
  if (existsSync(dest) || !existsSync(example)) return false;
  copyFileSync(example, dest);
  return true;
}

export function readEnvValue(root: string, key: string): string | undefined {
  const file = envFilePath(root);
  if (!existsSync(file)) return undefined;
  const env: Record<string, string | undefined> = {};
  loadEnvInto(file, env);
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : stripQuotes(value);
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

export function installEnvKey(key: string): string {
  return `INSTALL_${key.toUpperCase()}`;
}

export function isInstallFlagEnabled(root: string, key: string): boolean {
  return readEnvValue(root, installEnvKey(key)) === "true";
}

export type InstallFlagOutcome =
  | "already-set"
  | "uncommented"
  | "updated"
  | "added";

export function setInstallFlag(root: string, key: string): InstallFlagOutcome {
  return setEnvValue(root, installEnvKey(key), "true");
}

export function setEnvValue(root: string, key: string, value: string): InstallFlagOutcome {
  const file = envFilePath(root);
  assertInRoot(file, root);
  seedEnvFile(root);
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { content, outcome } = setKeyInEnv(original, key, value);
  if (content !== original) writeFileSync(file, content, { mode: 0o600 });
  return outcome;
}

export interface SetKeyResult {
  content: string;
  outcome: InstallFlagOutcome;
}

export function setKeyInEnv(content: string, key: string, value: string): SetKeyResult {
  const lines = content.split("\n");
  const live = new RegExp(`^${escapeRegExp(key)}=(.*)$`);
  const commented = new RegExp(`^[ \\t]*#[ \\t]*${escapeRegExp(key)}=(.*)$`);

  for (let i = 0; i < lines.length; i++) {
    const m = live.exec(lines[i]);
    if (m) {
      if (stripQuotes(m[1].trim()) === value) return { content, outcome: "already-set" };
      lines[i] = `${key}=${value}`;
      return { content: lines.join("\n"), outcome: "updated" };
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (commented.test(lines[i])) {
      lines[i] = `${key}=${value}`;
      return { content: lines.join("\n"), outcome: "uncommented" };
    }
  }

  const body = content.replace(/\n+$/, "");
  return {
    content: body === "" ? `${key}=${value}\n` : `${body}\n${key}=${value}\n`,
    outcome: "added",
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
