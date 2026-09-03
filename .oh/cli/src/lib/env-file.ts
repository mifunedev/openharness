import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import {
  getOhConfigValue,
  ohConfigPath,
  readOhConfig,
  setOhConfigValue,
  writeOhConfig,
} from "./oh-config.js";


export function assertInRoot(dest: string, root: string): void {
  if (!(dest === root || dest.startsWith(root + sep))) {
    throw new Error(`refusing to write outside the project root: ${dest}`);
  }
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

export const CONFIG_FIELD_BY_ENV_KEY: Record<string, string> = {
  DOCKER_SOCKET: "access.dockerSocket",
};

export type ConfigFieldOutcome = "already-set" | "updated" | "added";

export function setEnvValue(root: string, key: string, value: string): ConfigFieldOutcome {
  const path = CONFIG_FIELD_BY_ENV_KEY[key];
  if (path === undefined) {
    throw new Error(
      `${key} is not a settable oh.json field — run \`oh config set\` for a non-secret, ` +
        "`oh secret set` for a credential",
    );
  }
  return setConfigField(root, path, value);
}

export function setConfigField(root: string, path: string, value: string): ConfigFieldOutcome {
  const file = ohConfigPath(root);
  assertInRoot(file, resolve(root));
  const config = readOhConfig(file);
  const before = getOhConfigValue(config, path);
  const next = setOhConfigValue(config, path, value);
  const after = getOhConfigValue(next, path);
  if (existsSync(file) && JSON.stringify(before) === JSON.stringify(after)) {
    return "already-set";
  }
  writeOhConfig(root, next);
  return before === undefined ? "added" : "updated";
}

export interface SetKeyResult {
  content: string;
  outcome: "already-set" | "uncommented" | "updated" | "added";
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
