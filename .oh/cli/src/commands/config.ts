import { setConfigField } from "../lib/env-file.js";
import {
  findOhConfigField,
  ohConfigFieldPaths,
  ohConfigPath,
  readOhConfig,
} from "../lib/oh-config.js";
import { resolveProjectRoot } from "../lib/project.js";
import { isSecretKey } from "../lib/secrets.js";

export interface ConfigIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface ConfigOptions {
  cwd?: string;
}

export function configFieldList(): string {
  return ohConfigFieldPaths()
    .map((path) => `  ${path}`)
    .join("\n");
}

export async function runConfigShow(opts: ConfigOptions, io: ConfigIO): Promise<number> {
  const root = resolveProjectRoot(opts.cwd);
  const config = readOhConfig(ohConfigPath(root));
  io.stdout(`${JSON.stringify(config, null, 2)}\n`);
  return 0;
}

export async function runConfigSet(
  key: string,
  value: string,
  opts: ConfigOptions,
  io: ConfigIO,
): Promise<number> {
  if (isSecretKey(key) || isSecretKey(key.toUpperCase())) {
    io.stderr(
      `oh config set: ${key.toUpperCase()} is a secret — oh.json is tracked by git.\n` +
        `Set it with \`oh secret set ${key.toUpperCase()}\` instead.\n`,
    );
    return 1;
  }

  if (!findOhConfigField(key)) {
    io.stderr(`oh config set: unknown field "${key}"\n\nFields:\n${configFieldList()}\n`);
    return 1;
  }

  const root = resolveProjectRoot(opts.cwd);
  let outcome: string;
  try {
    outcome = setConfigField(root, key, value);
  } catch (error) {
    io.stderr(`oh config set: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  io.stdout(
    outcome === "already-set"
      ? `oh.json: ${key} already ${value}\n`
      : `oh.json: set ${key}=${value} (${outcome})\n`,
  );
  return 0;
}
