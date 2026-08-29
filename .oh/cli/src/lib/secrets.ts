import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertInRoot, setKeyInEnv } from "./env-file.js";
import { loadEnvInto, writeEnvFile } from "./env.js";

const SECRETS_FILE = ".env";

export const SECRET_KEYS = [
  "GH_TOKEN",
  "XAI_API_KEY",
  "SANDBOX_PASSWORD",
  "PI_SLACK_APP_TOKEN",
  "PI_SLACK_BOT_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "OH_CLOUD_PROVISION_KEY",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

const ALLOWED = new Set<string>(SECRET_KEYS);

export function secretsFilePath(root: string): string {
  return resolve(root, SECRETS_FILE);
}

export function isSecretKey(key: string): key is SecretKey {
  return ALLOWED.has(key);
}

export function assertSecretKey(key: string): asserts key is SecretKey {
  if (ALLOWED.has(key)) return;
  throw new Error(
    `${key} is not a secret — non-secret settings live in oh.json; use \`oh config set\` instead`,
  );
}

export function readSecret(root: string, key: string): string | undefined {
  assertSecretKey(key);
  const file = secretsFilePath(root);
  if (!existsSync(file)) return undefined;
  const env: Record<string, string | undefined> = {};
  loadEnvInto(file, env);
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : stripQuotes(value);
}

export function setSecret(root: string, key: string, value: string): void {
  assertSecretKey(key);
  if (/[\r\n]/.test(value)) {
    throw new Error(`${key} value must not contain a newline`);
  }
  const file = secretsFilePath(root);
  assertInRoot(file, resolve(root));
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { content } = setKeyInEnv(original, key, value);
  writeEnvFile(file, content);
}

export function listSecretKeys(root: string): SecretKey[] {
  const file = secretsFilePath(root);
  if (!existsSync(file)) return [];
  const env: Record<string, string | undefined> = {};
  loadEnvInto(file, env);
  return SECRET_KEYS.filter((key) => {
    const value = env[key]?.trim();
    return value !== undefined && value !== "";
  });
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}
