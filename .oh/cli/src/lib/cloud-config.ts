import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CloudConfig {
  apiUrl?: string;
  provisionKey?: string;
}

interface StoredCloudConfig extends CloudConfig {
  version: 1;
}

export function cloudConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OH_CLOUD_CONFIG) return env.OH_CLOUD_CONFIG;
  const configRoot = env.OH_CONFIG_DIR
    ? env.OH_CONFIG_DIR
    : join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "openharness");
  return join(configRoot, "cloud.json");
}

export async function readCloudConfig(path: string): Promise<CloudConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`could not read cloud config ${path}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`cloud config is not valid JSON: ${path}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`cloud config must contain a JSON object: ${path}`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.apiUrl !== undefined && typeof record.apiUrl !== "string") {
    throw new Error(`cloud config apiUrl must be a string: ${path}`);
  }
  if (record.provisionKey !== undefined && typeof record.provisionKey !== "string") {
    throw new Error(`cloud config provisionKey must be a string: ${path}`);
  }

  return {
    ...(typeof record.apiUrl === "string" ? { apiUrl: record.apiUrl } : {}),
    ...(typeof record.provisionKey === "string" ? { provisionKey: record.provisionKey } : {}),
  };
}

export async function writeCloudConfig(path: string, config: CloudConfig): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const stored: StoredCloudConfig = {
    version: 1,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    ...(config.provisionKey ? { provisionKey: config.provisionKey } : {}),
  };
  await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  // writeFile preserves an existing file's mode, so enforce the secret-file
  // contract after every update as well as on first creation.
  await chmod(path, 0o600);
}
