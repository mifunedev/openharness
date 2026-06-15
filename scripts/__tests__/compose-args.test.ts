import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "docker-compose.sh");
const MAKEFILE = path.join(REPO_ROOT, "Makefile");
const INSTALL = path.join(REPO_ROOT, "scripts", "install.sh");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "compose-args-"));
  mkdirSync(path.join(tmp, ".devcontainer"), { recursive: true });
  writeFileSync(path.join(tmp, ".devcontainer", "docker-compose.yml"), "services: {}\n");
  writeFileSync(path.join(tmp, ".devcontainer", "docker-compose.hermes-dashboard.yml"), "services: {}\n");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function printArgv(args: string[] = ["config"]): string[] {
  const result = spawnSync("bash", [SCRIPT, "--repo-dir", tmp, "--print-argv", ...args], {
    encoding: "utf8",
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout.trimEnd().split("\n");
}

describe("scripts/docker-compose.sh", () => {
  it("prints default argv with env files before the base compose file", () => {
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=example\n");
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");

    expect(printArgv()).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "--env-file",
      path.join(tmp, ".devcontainer", ".harness.yaml.env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "config",
    ]);
  });

  it("keeps harness.yaml and config.json override paths as literal argv entries", () => {
    const sentinel = path.join(tmp, "SHOULD_NOT_EXIST");
    const harnessOverride = `over rides/harness ; touch ${sentinel}.yml`;
    const configOverride = "local config/override $(printf hacked).yml";

    writeFileSync(
      path.join(tmp, "harness.yaml"),
      "hermes:\n  dashboard: true\ncompose:\n  overrides:\n" +
        `    - "${harnessOverride}"\n` +
        "    - overlays/harness-two.yml\n",
    );
    writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ composeOverrides: [configOverride] }),
    );

    expect(printArgv(["up", "-d", "--build"])).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".harness.yaml.env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.hermes-dashboard.yml"),
      "-f",
      path.join(tmp, harnessOverride),
      "-f",
      path.join(tmp, "overlays/harness-two.yml"),
      "-f",
      path.join(tmp, configOverride),
      "up",
      "-d",
      "--build",
    ]);
    expect(existsSync(sentinel)).toBe(false);
  });

  it("preserves repo-root-relative resolution for absolute and relative overrides", () => {
    const absolute = path.join(tmp, "absolute overlay.yml");
    writeFileSync(
      path.join(tmp, "harness.yaml"),
      "compose:\n  overrides:\n" +
        "    - relative/overlay.yml\n" +
        `    - "${absolute}"\n`,
    );

    const argv = printArgv();
    expect(argv).toContain(path.join(tmp, "relative/overlay.yml"));
    expect(argv).toContain(absolute);
  });
});

describe("compose helper wiring", () => {
  it("Makefile uses the shared helper and preserves lifecycle verbs", () => {
    const text = readFileSync(MAKEFILE, "utf8");
    expect(text).toContain("COMPOSE           := scripts/docker-compose.sh");
    expect(text).toContain("$(COMPOSE) up -d --build");
    expect(text).toContain("$(COMPOSE) down -v");
    expect(text).not.toContain("COMPOSE_OVERRIDES");
    expect(text).not.toContain("HARNESS_YAML_OVERRIDES");
  });

  it("installer uses the shared helper instead of raw COMPOSE_FILES expansion", () => {
    const text = readFileSync(INSTALL, "utf8");
    expect(text).toContain('"$REPO_DIR/scripts/docker-compose.sh" up -d --build');
    expect(text).not.toContain("docker compose $COMPOSE_FILES");
    expect(text).not.toContain("COMPOSE_FILES=\"-f .devcontainer/docker-compose.yml\"");
  });
});
