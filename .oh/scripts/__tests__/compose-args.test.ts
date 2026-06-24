import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function runWithFakeDocker(args: string[]): string[] {
  const binDir = path.join(tmp, "bin");
  const capture = path.join(tmp, "docker-argv.txt");
  mkdirSync(binDir, { recursive: true });
  const docker = path.join(binDir, "docker");
  writeFileSync(docker, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$CAPTURE"\n');
  chmodSync(docker, 0o755);

  const result = spawnSync("bash", [SCRIPT, "--repo-dir", tmp, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, CAPTURE: capture },
  });

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return readFileSync(capture, "utf8").trimEnd().split("\n");
}

describe("scripts/docker-compose.sh", () => {
  it("prints read-like argv with a temporary harness env file", () => {
    const persistent = path.join(tmp, ".devcontainer", ".harness.yaml.env");
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=example\n");
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");

    const argv = printArgv();
    expect(argv.slice(0, 6)).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "--env-file",
      argv[5],
    ]);
    expect(argv[5]).toContain("openharness-harness-yaml-env.");
    expect(argv[5]).not.toBe(persistent);
    expect(argv.slice(6)).toEqual([
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "config",
    ]);
    expect(existsSync(persistent)).toBe(false);
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

    const argv = printArgv(["up", "-d", "--build"]);
    expect(argv.slice(0, 4)).toEqual([
      "docker",
      "compose",
      "--env-file",
      argv[3],
    ]);
    expect(argv[3]).toContain("openharness-harness-yaml-env.");
    expect(argv.slice(4)).toEqual([
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

  it("reads .oh/config.json as the canonical location, taking precedence over legacy root config.json", () => {
    const canonicalOverride = "oh config/canonical.yml";
    const legacyOverride = "legacy config/should-not-be-read.yml";

    mkdirSync(path.join(tmp, ".oh"), { recursive: true });
    writeFileSync(
      path.join(tmp, ".oh", "config.json"),
      JSON.stringify({ composeOverrides: [canonicalOverride] }),
    );
    // Legacy root config.json present too — the canonical .oh/ copy must win.
    writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ composeOverrides: [legacyOverride] }),
    );

    const argv = printArgv(["up"]);
    expect(argv).toContain(path.join(tmp, canonicalOverride));
    expect(argv).not.toContain(path.join(tmp, legacyOverride));
  });

  it("keeps persistent harness env generation for lifecycle commands", () => {
    const persistent = path.join(tmp, ".devcontainer", ".harness.yaml.env");
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");

    const argv = runWithFakeDocker(["up", "-d"]);

    expect(argv).toEqual([
      "compose",
      "--env-file",
      persistent,
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "up",
      "-d",
    ]);
    expect(readFileSync(persistent, "utf8")).toContain("SANDBOX_NAME=from-yaml");
  });

  it("uses a temporary harness env file for compose config without overwriting persistent state", () => {
    const persistent = path.join(tmp, ".devcontainer", ".harness.yaml.env");
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");
    writeFileSync(persistent, "SANDBOX_NAME=old\n");

    const argv = runWithFakeDocker(["config", "--quiet"]);

    expect(argv.slice(0, 4)).toEqual(["compose", "--env-file", argv[2], "-f"]);
    expect(argv[2]).toContain("openharness-harness-yaml-env.");
    expect(argv[2]).not.toBe(persistent);
    expect(readFileSync(persistent, "utf8")).toBe("SANDBOX_NAME=old\n");
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

  it("installer keeps host defaults out of tracked harness.yaml", () => {
    const text = readFileSync(INSTALL, "utf8");
    expect(text).toContain("Existing .devcontainer/.env preserved");
    expect(text).toContain("Tracked\n# harness.yaml stays clean");
    expect(text).toContain('SANDBOX_NAME=$(_env_val "$SANDBOX_NAME")');
    expect(text).toContain("GIT_USER_NAME=%s\\n");
    expect(text).not.toContain('__YAML="$REPO_DIR/harness.yaml"');
    expect(text).not.toContain('ok "harness.yaml: sandbox.name');
  });
});
