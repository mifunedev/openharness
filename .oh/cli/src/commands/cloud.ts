import { readFile } from "node:fs/promises";
import { askSecret } from "../lib/prompt.js";
import {
  cloudConfigPath,
  readCloudConfig,
  writeCloudConfig,
  type CloudConfig,
} from "../lib/cloud-config.js";

const DEFAULT_API_URL = "http://127.0.0.1:3000";
const DEFAULT_TERMINAL_STATUSES = ["running", "failed", "destroyed"];

export const CLOUD_HELP = `oh cloud — Manage OpenHarness Cloud nodes

Usage:
  oh cloud config [--api-url <url>] [--provision-key <key>]
  oh cloud config show
  oh cloud [global options] nodes list
  oh cloud [global options] nodes get <node-id>
  oh cloud [global options] nodes create --ssh-key-id <id> [--name <name>]
  oh cloud [global options] nodes events <node-id>
  oh cloud [global options] nodes watch <node-id> [--interval <seconds>] [--until <statuses>]
  oh cloud [global options] nodes destroy <node-id>
  oh cloud [global options] nodes restart <node-id>
  oh cloud [global options] nodes rebuild <node-id>
  oh cloud [global options] ssh-keys list
  oh cloud [global options] ssh-keys create --name <name> (--public-key <key> | --public-key-file <path>)

Global options:
  --api-url <url>          API base URL (default: OH_CLOUD_API_URL, OH_API_URL,
                           or http://127.0.0.1:3000)
  --provision-key <key>    Admin key (default: OH_PROVISION_KEY or PROVISION_KEY)
  --output <field>         Print one top-level response field instead of JSON
  -h, --help               Show this help

Configuration:
  oh cloud config securely prompts for the current provisioner key and stores
  it in ~/.config/openharness/cloud.json with mode 0600. This is the temporary
  credential model until OpenHarness Cloud issues user API tokens.

Environment:
  OH_CLOUD_CONFIG          Override the saved config file path
  OH_CLOUD_API_URL         Override the OpenHarness Cloud API base URL
  OH_PROVISION_KEY         Override the saved key (PROVISION_KEY is also accepted)

Examples:
  oh cloud config
  oh cloud ssh-keys create --name laptop --public-key-file ~/.ssh/openharness_node.pub
  oh cloud nodes create --name smoke-1 --ssh-key-id <ssh-key-id>
  oh cloud nodes watch <node-id>
`;

export interface CloudIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
  askSecret?: (question: string) => Promise<string>;
}

export class CloudCliError extends Error {
  readonly status?: number;
  readonly payload?: unknown;

  constructor(message: string, options: { status?: number; payload?: unknown } = {}) {
    super(message);
    this.name = "CloudCliError";
    this.status = options.status;
    this.payload = options.payload;
  }
}

function takeOption(args: string[], name: string, alias?: string): string | undefined {
  const names = alias ? [name, alias] : [name];
  for (const candidate of names) {
    const index = args.indexOf(candidate);
    if (index === -1) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new CloudCliError(`${candidate} requires a value`);
    }
    args.splice(index, 2);
    return value;
  }
  return undefined;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value) throw new CloudCliError(`${name} is required`);
  return value;
}

function requirePositional(value: string | undefined, name: string): string {
  if (!value || value.startsWith("-")) throw new CloudCliError(`${name} is required`);
  return value;
}

function assertNoExtraArgs(args: string[]): void {
  if (args.length > 0) {
    throw new CloudCliError(
      `unexpected argument${args.length === 1 ? "" : "s"}: ${args.join(" ")}`,
    );
  }
}

function normalizeApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CloudCliError(`invalid API URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CloudCliError(`API URL must use http or https: ${value}`);
  }
  return url.toString().replace(/\/$/, "");
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function formatApiFailure(status: number, payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.error ?? record.message;
    const code = typeof record.code === "string" ? ` (${record.code})` : "";
    if (typeof message === "string") {
      return `API request failed with ${status}${code}: ${message}`;
    }
  }
  if (typeof payload === "string" && payload.length > 0) {
    return `API request failed with ${status}: ${payload}`;
  }
  return `API request failed with ${status}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export type CloudRequest = (
  method: string,
  pathname: string,
  body?: unknown,
) => Promise<unknown>;

export function createCloudApiClient(options: {
  apiUrl: string;
  provisionKey: string;
  fetch?: typeof globalThis.fetch;
}): CloudRequest {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new CloudCliError(
      "the cloud CLI requires Node.js 20 or newer (global fetch is unavailable)",
    );
  }

  return async (method: string, pathname: string, body?: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(`${options.apiUrl}${pathname}`, {
        method,
        headers: {
          "x-provision-key": options.provisionKey,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new CloudCliError(`could not reach ${options.apiUrl}: ${detail}`);
    }

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new CloudCliError(formatApiFailure(response.status, payload), {
        status: response.status,
        payload,
      });
    }
    return payload;
  };
}

function nodePath(nodeId: string, suffix = ""): string {
  return `/api/nodes/${encodeURIComponent(nodeId)}${suffix}`;
}

async function readPublicKey(
  args: string[],
  readFileImpl: (path: string, encoding: BufferEncoding) => Promise<string>,
): Promise<string> {
  const inline = takeOption(args, "--public-key");
  const file = takeOption(args, "--public-key-file");
  if (inline && file) {
    throw new CloudCliError("use only one of --public-key or --public-key-file");
  }
  if (!inline && !file) {
    throw new CloudCliError("--public-key or --public-key-file is required");
  }

  if (inline) return inline.trim();
  try {
    const value = (await readFileImpl(file as string, "utf8")).trim();
    if (!value) throw new CloudCliError(`SSH public key file is empty: ${file}`);
    return value;
  } catch (error) {
    if (error instanceof CloudCliError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new CloudCliError(`could not read SSH public key file ${file}: ${detail}`);
  }
}

interface DispatchOptions {
  request: CloudRequest;
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  sleep: (milliseconds: number) => Promise<void>;
  write: (value: unknown) => void;
}

async function dispatch(args: string[], options: DispatchOptions): Promise<unknown> {
  const resource = args.shift();
  const action = args.shift();

  if (!resource || !action) {
    throw new CloudCliError("a resource and action are required. Run `oh cloud --help` for usage.");
  }

  if (resource === "ssh-keys") {
    if (action === "list") {
      assertNoExtraArgs(args);
      return options.request("GET", "/api/ssh-keys");
    }
    if (action === "create") {
      const name = requireOption(takeOption(args, "--name"), "--name");
      const publicKey = await readPublicKey(args, options.readFile);
      assertNoExtraArgs(args);
      return options.request("POST", "/api/ssh-keys", { name, publicKey });
    }
    throw new CloudCliError(`unknown ssh-keys action: ${action}`);
  }

  if (resource !== "nodes") throw new CloudCliError(`unknown resource: ${resource}`);

  if (action === "list") {
    assertNoExtraArgs(args);
    return options.request("GET", "/api/nodes");
  }

  if (action === "create") {
    const name = takeOption(args, "--name");
    const sshKeyId = requireOption(takeOption(args, "--ssh-key-id"), "--ssh-key-id");
    assertNoExtraArgs(args);
    return options.request("POST", "/api/nodes", {
      ...(name ? { name } : {}),
      sshKeyId,
    });
  }

  const nodeIdActions = ["get", "events", "destroy", "restart", "rebuild", "watch"];
  if (!nodeIdActions.includes(action)) {
    throw new CloudCliError(`unknown nodes action: ${action}`);
  }
  const nodeId = requirePositional(args.shift(), "<node-id>");
  if (action === "get") {
    assertNoExtraArgs(args);
    return options.request("GET", nodePath(nodeId));
  }
  if (action === "events") {
    assertNoExtraArgs(args);
    return options.request("GET", nodePath(nodeId, "/events"));
  }
  if (action === "destroy") {
    assertNoExtraArgs(args);
    return options.request("DELETE", nodePath(nodeId));
  }
  if (action === "restart" || action === "rebuild") {
    assertNoExtraArgs(args);
    return options.request("POST", nodePath(nodeId, `/${action}`));
  }
  if (action === "watch") {
    const intervalValue = takeOption(args, "--interval") ?? "5";
    const intervalSeconds = Number(intervalValue);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
      throw new CloudCliError(`--interval must be a non-negative number: ${intervalValue}`);
    }
    const untilValue = takeOption(args, "--until");
    const terminalStatuses = new Set(
      (untilValue ? untilValue.split(",") : DEFAULT_TERMINAL_STATUSES)
        .map((status) => status.trim())
        .filter(Boolean),
    );
    if (terminalStatuses.size === 0) {
      throw new CloudCliError("--until must contain at least one status");
    }
    assertNoExtraArgs(args);

    let lastStatus: string | undefined;
    while (true) {
      const node = await options.request("GET", nodePath(nodeId));
      if (
        !node ||
        typeof node !== "object" ||
        typeof (node as Record<string, unknown>).status !== "string"
      ) {
        throw new CloudCliError("node response did not include a status");
      }
      const status = (node as Record<string, unknown>).status as string;
      if (status !== lastStatus) {
        options.write(node);
        lastStatus = status;
      }
      if (terminalStatuses.has(status)) return undefined;
      await options.sleep(intervalSeconds * 1_000);
    }
  }

  throw new CloudCliError(`unknown nodes action: ${action}`);
}

async function configureCloud(args: string[], io: CloudIO, env: NodeJS.ProcessEnv): Promise<void> {
  const path = cloudConfigPath(env);
  const current = await readCloudConfig(path);
  if (args[0] === "show") {
    args.shift();
    assertNoExtraArgs(args);
    io.stdout(`Cloud config: ${path}\n`);
    io.stdout(`API URL: ${current.apiUrl ?? DEFAULT_API_URL}\n`);
    io.stdout(`Provision credential: ${current.provisionKey ? "configured" : "not configured"}\n`);
    return;
  }

  const apiUrl = normalizeApiUrl(
    takeOption(args, "--api-url") ??
      current.apiUrl ??
      env.OH_CLOUD_API_URL ??
      env.OH_API_URL ??
      DEFAULT_API_URL,
  );
  const providedKey = takeOption(args, "--provision-key");
  assertNoExtraArgs(args);
  const provisionKey = (
    providedKey ??
    (await (io.askSecret ?? askSecret)("OpenHarness Cloud provisioner key:"))
  ).trim();
  if (!provisionKey) throw new CloudCliError("provisioner key cannot be empty");

  const config: CloudConfig = { apiUrl, provisionKey };
  await writeCloudConfig(path, config);
  io.stdout(`Saved OpenHarness Cloud config to ${path}\n`);
  io.stdout("Provision credential: configured\n");
}

async function executeCloud(argv: string[], io: CloudIO): Promise<void> {
  const args = [...argv];
  const env = io.env ?? process.env;

  if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
    io.stdout(CLOUD_HELP);
    return;
  }
  if (args[0] === "config") {
    args.shift();
    await configureCloud(args, io, env);
    return;
  }

  const saved = await readCloudConfig(cloudConfigPath(env));
  const apiUrl = normalizeApiUrl(
    takeOption(args, "--api-url") ??
      env.OH_CLOUD_API_URL ??
      env.OH_API_URL ??
      saved.apiUrl ??
      DEFAULT_API_URL,
  );
  const provisionKey =
    takeOption(args, "--provision-key") ??
    env.OH_PROVISION_KEY ??
    env.PROVISION_KEY ??
    saved.provisionKey;
  if (!provisionKey) {
    throw new CloudCliError(
      "no provision credential found. Run `oh cloud config` or set OH_PROVISION_KEY.",
    );
  }

  const outputField = takeOption(args, "--output");
  const request = createCloudApiClient({
    apiUrl,
    provisionKey,
    fetch: io.fetch,
  });
  const write = (value: unknown): void => io.stdout(formatJson(value));
  const result = await dispatch(args, {
    request,
    readFile: io.readFile ?? readFile,
    sleep:
      io.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
    write,
  });
  if (result === undefined) return;

  if (outputField) {
    if (!result || typeof result !== "object" || !(outputField in result)) {
      throw new CloudCliError(`response does not contain top-level field: ${outputField}`);
    }
    const value = (result as Record<string, unknown>)[outputField];
    io.stdout(typeof value === "object" ? formatJson(value) : `${String(value)}\n`);
    return;
  }
  write(result);
}

export async function runCloud(argv: string[], io: CloudIO): Promise<number> {
  try {
    await executeCloud(argv, io);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`oh cloud: ${message}\n`);
    return 1;
  }
}
