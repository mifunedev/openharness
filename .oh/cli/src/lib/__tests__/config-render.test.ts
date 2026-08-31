import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderComposeEnv, renderComposeVars } from "../config-render.js";
import { SECRET_KEYS } from "../secrets.js";
import { defaultOhConfig, type OhConfig } from "../oh-config.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const DEVCONTAINER = join(REPO_ROOT, ".devcontainer");

const RETIRED = ["WORKTREES_DIR", "PROJECTS_DIR", "CRONS_DIR", "OH_PROJECT_ROOT"];

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

  it("carries every non-secret setting through from oh.json", () => {
    const text = renderComposeEnv(fullConfig());
    expect(text).toContain("SANDBOX_NAME=demo");
    expect(text).toContain("TZ=America/Los_Angeles");
    expect(text).toContain("OH_HOME_MOUNT=/srv/oh-home");
    expect(text).toContain("GIT_USER_NAME=Ada");
    expect(text).toContain("GIT_USER_EMAIL=ada@example.com");
    expect(text).toContain("INSTALL_OPENCODE=false");
    expect(text).toContain("INSTALL_GROK_BUILD=false");
    // #910: deepagents is retired; the key must no longer be rendered.
    expect(text).not.toContain("INSTALL_DEEPAGENTS");
    expect(text).toContain("INSTALL_HERMES=false");
    expect(text).toContain("INSTALL_AGENT_BROWSER=false");
    expect(text).toContain("DOCKER_SOCKET=true");
    expect(text).toContain("SANDBOX_SSH=true");
    expect(text).toContain("SANDBOX_SSH_PORT=2022");
    expect(text).toContain("SANDBOX_SSH_PASSWORD_AUTH=true");
    expect(text).toContain("SANDBOX_SSH_AUTHORIZED_KEYS=ssh-ed25519 AAAA you@laptop");
    expect(text).toContain("HERMES_DASHBOARD=false");
    expect(text).toContain("HERMES_DASHBOARD_PORT=9119");
    expect(text).toContain("CRON_AGENT_BIN=claude");
    expect(text).toContain("SKIP_PNPM_INSTALL=0");
    expect(text).toContain("OH_SANDBOX_IMAGE=ghcr.io/mifunedev/openharness:latest");
    expect(text).toContain("OH_PULL_POLICY=always");
    expect(text).toContain("LANGFUSE_BASE_URL=http://langfuse-web:3000");
    expect(text).toContain("LANGFUSE_PRIVACY_PRESET=metadata-only");
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

  it("emits no retired *_DIR variable", () => {
    const text = renderComposeEnv(fullConfig());
    for (const key of RETIRED) expect(text).not.toContain(key);
  });

  it("omits a key whose oh.json field is unset", () => {
    const config: OhConfig = { version: 1, name: "demo" };
    expect(keysOf(config)).toEqual(["SANDBOX_NAME"]);
  });

  it("renders skipPnpmInstall as the 1/0 the entrypoint reads", () => {
    const config = defaultOhConfig("demo");
    config.build = { skipPnpmInstall: true };
    expect(renderComposeEnv(config)).toContain("SKIP_PNPM_INSTALL=1");
  });

  it("refuses a value containing a newline", () => {
    const config = defaultOhConfig("demo");
    config.access = { sshAuthorizedKeys: "ssh-ed25519 A\nssh-ed25519 B" };
    expect(() => renderComposeEnv(config)).toThrow(/must not contain a newline/);
  });
});
