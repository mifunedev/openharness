import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  resolveExecutionTarget,
  type LifecycleRunner,
} from "../../cli/src/lib/execution/index.js";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(REPO_ROOT, ".oh", "scripts", "docker-compose.sh");
const MAKEFILE = path.join(REPO_ROOT, "Makefile");
const INSTALL = path.join(REPO_ROOT, ".oh", "scripts", "install.sh");

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
  it("passes .devcontainer/.env as the ONE --env-file, and derives nothing", () => {
    const derived = path.join(tmp, ".devcontainer", ".harness.yaml.env");
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=example\n");

    const argv = printArgv();
    expect(argv).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "config",
    ]);
    expect(existsSync(derived)).toBe(false);
  });

  it("omits --env-file entirely when there is no .devcontainer/.env", () => {
    const argv = printArgv();
    expect(argv).not.toContain("--env-file");
    expect(argv).toEqual([
      "docker",
      "compose",
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "config",
    ]);
  });

  it("keeps config.json override paths as literal argv entries", () => {
    const sentinel = path.join(tmp, "SHOULD_NOT_EXIST");
    const hostile = `over rides/config ; touch ${sentinel}.yml`;
    const substitution = "local config/override $(printf hacked).yml";

    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "HERMES_DASHBOARD=true\n");
    writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ composeOverrides: [hostile, "overlays/config-two.yml", substitution] }),
    );

    const argv = printArgv(["up", "-d", "--build"]);
    expect(argv).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.hermes-dashboard.yml"),
      "-f",
      path.join(tmp, hostile),
      "-f",
      path.join(tmp, "overlays/config-two.yml"),
      "-f",
      path.join(tmp, substitution),
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
    writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ composeOverrides: [legacyOverride] }),
    );

    const argv = printArgv(["up"]);
    expect(argv).toContain(path.join(tmp, canonicalOverride));
    expect(argv).not.toContain(path.join(tmp, legacyOverride));
  });

  it("executes the same argv it prints — --print-argv is a faithful oracle", () => {
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=from-env\n");

    const argv = runWithFakeDocker(["up", "-d"]);

    expect(argv).toEqual([
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "up",
      "-d",
    ]);
    expect(existsSync(path.join(tmp, ".devcontainer", ".harness.yaml.env"))).toBe(false);
  });

  it("preserves repo-root-relative resolution for absolute and relative overrides", () => {
    const absolute = path.join(tmp, "absolute overlay.yml");
    writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ composeOverrides: ["relative/overlay.yml", absolute] }),
    );

    const argv = printArgv();
    expect(argv).toContain(path.join(tmp, "relative/overlay.yml"));
    expect(argv).toContain(absolute);
  });

  it("migrates a leftover harness.yaml on first run, then never again", () => {
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");

    const first = spawnSync("bash", [SCRIPT, "--repo-dir", tmp, "--print-argv", "config"], {
      encoding: "utf8",
    });
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("SANDBOX_NAME=from-yaml");
    expect(existsSync(path.join(tmp, "harness.yaml"))).toBe(false);
    expect(existsSync(path.join(tmp, "harness.yaml.migrated"))).toBe(true);
    expect(readFileSync(path.join(tmp, ".devcontainer", ".env"), "utf8")).toContain(
      "SANDBOX_NAME=from-yaml",
    );
    expect(first.stdout.trimEnd().split("\n")).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "config",
    ]);

    const second = spawnSync("bash", [SCRIPT, "--repo-dir", tmp, "--print-argv", "config"], {
      encoding: "utf8",
    });
    expect(second.status).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
  });
});

const TODAYS_SANDBOX_COMPOSE_ARGS = ["up", "-d", "--build"];

describe("execution target argv equivalence (issue #733)", () => {
  it("provision() expands to argv identical to today's, via --print-argv as the non-executing oracle", async () => {
    mkdirSync(path.join(tmp, ".oh", "scripts"), { recursive: true });
    const vendored = path.join(tmp, ".oh", "scripts", "docker-compose.sh");
    copyFileSync(SCRIPT, vendored);
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=from-env\n");

    const calls: { cmd: string; args: string[] }[] = [];
    const run: LifecycleRunner = (cmd, args) => {
      calls.push({ cmd, args: [...args] });
      return { status: 0 };
    };

    await resolveExecutionTarget({ projectRoot: tmp, run }).provision();

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("bash");
    const [script, ...rest] = calls[0].args;
    expect(script).toBe(vendored);
    expect(rest.slice(0, 2)).toEqual(["--repo-dir", tmp]);

    const adapterComposeArgs = rest.slice(2);
    expect(adapterComposeArgs).toEqual(TODAYS_SANDBOX_COMPOSE_ARGS);

    const expand = (args: string[]): string[] => {
      const result = spawnSync("bash", [script, "--repo-dir", tmp, "--print-argv", ...args], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      return result.stdout.trimEnd().split("\n");
    };
    const viaAdapter = expand(adapterComposeArgs);
    const viaToday = expand(TODAYS_SANDBOX_COMPOSE_ARGS);
    expect(viaAdapter).toEqual(viaToday);

    expect(viaAdapter).toEqual([
      "docker",
      "compose",
      "--env-file",
      path.join(tmp, ".devcontainer", ".env"),
      "-f",
      path.join(tmp, ".devcontainer", "docker-compose.yml"),
      "up",
      "-d",
      "--build",
    ]);
  });
});

describe("compose helper wiring", () => {
  it("Makefile uses the shared helper and preserves lifecycle verbs", () => {
    const text = readFileSync(MAKEFILE, "utf8");
    expect(text).toContain("COMPOSE           := .oh/scripts/docker-compose.sh");
    expect(text).toContain("$(COMPOSE) up -d --build");
    expect(text).toContain("$(COMPOSE) down -v");
    expect(text).not.toContain("COMPOSE_OVERRIDES");
    expect(text).not.toContain("HARNESS_YAML_OVERRIDES");
  });

  it("installer uses the shared helper instead of raw COMPOSE_FILES expansion", () => {
    const text = readFileSync(INSTALL, "utf8");
    expect(text).toContain('"$REPO_DIR/.oh/scripts/docker-compose.sh" up -d --build');
    expect(text).not.toContain("docker compose $COMPOSE_FILES");
    expect(text).not.toContain("COMPOSE_FILES=\"-f .devcontainer/docker-compose.yml\"");
  });

  it("installer writes every answer to .devcontainer/.env, and the config writes ALWAYS run", () => {
    const text = readFileSync(INSTALL, "utf8");
    expect(text).toContain("_env_set() {");
    expect(text).toContain("_env_set SANDBOX_NAME");
    expect(text).toContain("_env_set GIT_USER_NAME");
    expect(text).not.toContain("_yaml_set");
    expect(text).not.toContain("_cfg_set");

    expect(text.indexOf("Created .devcontainer/.env from")).toBeLessThan(
      text.indexOf("_env_set SANDBOX_NAME"),
    );

    expect(text).toContain("Existing .devcontainer/.env preserved — updating keys in place");
    expect(text).toContain("THE CONFIG WRITES ALWAYS RUN");

    expect(text).toContain('_env_set "INSTALL_$1" true');

    expect(text).toContain("migrate-harness-yaml.sh");

    expect(text).toContain("GH_TOKEN=");
  });
});
