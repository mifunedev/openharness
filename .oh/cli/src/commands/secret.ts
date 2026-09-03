import { existsSync } from "node:fs";
import { join } from "node:path";
import { appendGitignoreLines } from "../lib/gitignore.js";
import { resolveProjectRoot } from "../lib/project.js";
import * as prompt from "../lib/prompt.js";
import { resolveSandboxRoot } from "../lib/registry.js";
import {
  isSecretKey,
  listSecretKeys,
  readSecret,
  SECRET_KEYS,
  setSecret,
} from "../lib/secrets.js";

export interface SecretIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  askSecret?: (question: string) => Promise<string>;
}

export interface SecretOptions {
  cwd?: string;
  sandbox?: string;
}

function secretsRoot(opts: SecretOptions): string {
  return opts.sandbox === undefined
    ? resolveProjectRoot(opts.cwd)
    : resolveSandboxRoot({ name: opts.sandbox });
}

function ignoreSecretsFile(root: string): void {
  if (!existsSync(join(root, ".git"))) return;
  appendGitignoreLines(root, [".env"]);
}

export function secretKeyList(): string {
  return SECRET_KEYS.map((key) => `  ${key}`).join("\n");
}

export async function runSecretSet(
  key: string,
  opts: SecretOptions,
  io: SecretIO,
): Promise<number> {
  if (!isSecretKey(key)) {
    io.stderr(
      `oh secret set: ${key} is not a secret — non-secret settings live in oh.json.\n` +
        `Set it with \`oh config set ${key}\` instead.\n\nKeys:\n${secretKeyList()}\n`,
    );
    return 1;
  }

  const root = secretsRoot(opts);
  const askSecret = io.askSecret ?? prompt.askSecret;
  const value = (await askSecret(`Value for ${prompt.bold(key)} (input hidden):`)).trim();
  if (value === "") {
    io.stderr(`oh secret set: no value entered — ${key} unchanged\n`);
    return 1;
  }

  try {
    setSecret(root, key, value);
    ignoreSecretsFile(root);
  } catch (error) {
    io.stderr(`oh secret set: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  io.stdout(`.env: set ${key}=${prompt.redact(value)}\n`);
  return 0;
}

export async function runSecretList(opts: SecretOptions, io: SecretIO): Promise<number> {
  const root = secretsRoot(opts);
  const keys = listSecretKeys(root);
  if (keys.length === 0) {
    io.stdout("no secrets set — write one with `oh secret set <KEY>`\n");
    return 0;
  }

  const width = Math.max(...keys.map((key) => key.length));
  for (const key of keys) {
    const value = readSecret(root, key);
    io.stdout(`${key.padEnd(width)}  ${value === undefined ? "—" : prompt.redact(value)}\n`);
  }
  return 0;
}
