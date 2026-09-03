import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderComposeEnv, renderComposeVars } from "../config-render.js";
import { SECRET_KEYS } from "../secrets.js";
import { defaultOhConfig, type OhConfig } from "../oh-config.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const DEVCONTAINER = join(REPO_ROOT, ".devcontainer");

const RETIRED = [
  "WORKTREES_DIR",
  "PROJECTS_DIR",
  "CRONS_DIR",
  "OH_PROJECT_ROOT",
  "INSTALL_DEEPAGENTS",
  "INSTALL_OPENCODE",
  "INSTALL_GROK_BUILD",
  "INSTALL_HERMES",
  "INSTALL_AGENT_BROWSER",
  "INSTALL_TAILSCALE",
  "SANDBOX_SSH_PASSWORD_AUTH",
  "SANDBOX_SSH_AUTHORIZED_KEYS",
  "HERMES_DASHBOARD",
  "HERMES_DASHBOARD_PORT",
  "CRON_AGENT_BIN",
  "SKIP_PNPM_INSTALL",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PRIVACY_PRESET",
];

const HOST_SIDE_KEYS = [
  "SANDBOX_NAME",
  "TZ",
  "OH_HOME_MOUNT",
  "OH_REPO_DIR",
  "GIT_USER_NAME",
  "GIT_USER_EMAIL",
  "DOCKER_SOCKET",
  "SANDBOX_SSH",
  "SANDBOX_SSH_PORT",
  "OH_SANDBOX_IMAGE",
  "OH_PULL_POLICY",
];

function composeInterpolatedVars(): string[] {
  const found = new Set<string>();
  for (const name of readdirSync(DEVCONTAINER)) {
    if (!/^docker-compose.*\.ya?ml$/.test(name)) continue;
    const text = readFileSync(join(DEVCONTAINER, name), "utf8");
    for (const match of text.matchAll(/\$\{([A-Z0-9_]+)/g)) found.add(match[1]);
  }
  return [...found].sort();
}

function fullConfig(): OhConfig {
  const config = defaultOhConfig("demo");
  config.runtime = "docker";
  config.repo = "/srv/checkout";
  config.git = { userName: "Ada", userEmail: "ada@example.com" };
  config.storage = { homePath: "/srv/oh-home" };
  config.access = {
    ssh: true,
    sshPort: 2022,
    sshPasswordAuth: true,
    sshAuthorizedKeys: "ssh-ed25519 AAAA you@laptop",
    dockerSocket: true,
  };
  config.image = { ref: "ghcr.io/mifunedev/openharness:latest", mode: "image", pullPolicy: "always" };
  config.langfuse = { baseUrl: "http://langfuse-web:3000", privacyPreset: "metadata-only" };
  return config;
}

const keysOf = (config: OhConfig): string[] => renderComposeVars(config).map((v) => v.key);

describe("renderComposeEnv", () => {
  it("emits KEY=value lines with a trailing newline", () => {
    const text = renderComposeEnv(fullConfig());
    expect(text.endsWith("\n")).toBe(true);
    for (const line of text.trimEnd().split("\n")) {
      expect(line).toMatch(/^[A-Z0-9_]+=/);
    }
  });

  it("carries every host-side setting through from oh.json", () => {
    const text = renderComposeEnv(fullConfig());
    expect(text).toContain("SANDBOX_NAME=demo");
    expect(text).toContain("TZ=America/Los_Angeles");
    expect(text).toContain("OH_HOME_MOUNT=/srv/oh-home");
    expect(text).toContain("OH_REPO_DIR=/srv/checkout");
    expect(text).toContain("GIT_USER_NAME=Ada");
    expect(text).toContain("GIT_USER_EMAIL=ada@example.com");
    expect(text).toContain("DOCKER_SOCKET=true");
    expect(text).toContain("SANDBOX_SSH=true");
    expect(text).toContain("SANDBOX_SSH_PORT=2022");
    expect(text).toContain("OH_SANDBOX_IMAGE=ghcr.io/mifunedev/openharness:latest");
    expect(text).toContain("OH_PULL_POLICY=always");
  });

  it("renders the host-side set and nothing else", () => {
    expect(keysOf(fullConfig()).sort()).toEqual([...HOST_SIDE_KEYS].sort());
  });

  it("covers every variable the real compose files interpolate", () => {
    expect(existsSync(DEVCONTAINER)).toBe(true);
    const rendered = new Set(keysOf(fullConfig()));
    const uncovered = composeInterpolatedVars().filter(
      (key) =>
        !rendered.has(key) &&
        !SECRET_KEYS.includes(key as (typeof SECRET_KEYS)[number]) &&
        !RETIRED.includes(key),
    );
    expect(uncovered).toEqual([]);
  });

  it("emits no secret", () => {
    const rendered = keysOf(fullConfig());
    for (const key of SECRET_KEYS) expect(rendered).not.toContain(key);
  });

  it("emits no retired variable", () => {
    const text = renderComposeEnv(fullConfig());
    for (const key of RETIRED) expect(text, key).not.toContain(`${key}=`);
  });

  it("declares every retired variable in RETIRED_KEYS, so re-adding a put() throws", () => {
    const source = readFileSync(join(REPO_ROOT, ".oh/cli/src/lib/config-render.ts"), "utf8");
    const block = source.slice(
      source.indexOf("const RETIRED_KEYS = ["),
      source.indexOf("] as const;"),
    );
    for (const key of RETIRED) expect(block, key).toContain(`"${key}"`);
  });

  it("omits a key whose oh.json field is unset", () => {
    const config: OhConfig = { version: 1, name: "demo" };
    expect(keysOf(config)).toEqual(["SANDBOX_NAME"]);
  });

  it("renders OH_REPO_DIR only for a sandbox that binds a checkout", () => {
    const imageOnly = defaultOhConfig("demo");
    imageOnly.runtime = "docker";
    expect(keysOf(imageOnly)).not.toContain("OH_REPO_DIR");

    const withRepo = defaultOhConfig("demo");
    withRepo.repo = "/srv/checkout";
    expect(renderComposeEnv(withRepo)).toContain("OH_REPO_DIR=/srv/checkout");
  });

  it("leaves skipPnpmInstall to oh.json — entrypoint.sh reads it through the CLI", () => {
    const config = defaultOhConfig("demo");
    config.build = { skipPnpmInstall: true };
    expect(renderComposeEnv(config)).not.toContain("SKIP_PNPM_INSTALL");
  });

  it("leaves the sshd mode to oh.json, publishing only the port", () => {
    const text = renderComposeEnv(fullConfig());
    expect(text).toContain("SANDBOX_SSH_PORT=2022");
    expect(text).not.toContain("SANDBOX_SSH_PASSWORD_AUTH");
    expect(text).not.toContain("SANDBOX_SSH_AUTHORIZED_KEYS");
  });

  it("refuses a value containing a newline", () => {
    const config = defaultOhConfig("demo");
    config.git = { userName: "Ada\nMalicious" };
    expect(() => renderComposeEnv(config)).toThrow(/must not contain a newline/);
  });
});
