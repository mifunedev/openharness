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

/**
 * The compose argv `oh sandbox` produced BEFORE it routed through the execution
 * contract (issue #733) — the same verb the Makefile pins at
 * `$(COMPOSE) up -d --build`. Frozen here as the oracle's expected side, so the
 * comparison below is against recorded history, not against itself.
 */
const TODAYS_SANDBOX_COMPOSE_ARGS = ["up", "-d", "--build"];

/**
 * The harness-env file is a per-invocation `mktemp` path under `--print-argv`,
 * so two otherwise-identical runs differ at that one entry. Collapse it to a
 * placeholder before comparing argv arrays.
 */
function normalizeHarnessEnv(argv: string[]): string[] {
  return argv.map((a) => (a.includes("openharness-harness-yaml-env.") ? "<harness-env>" : a));
}

describe("execution target argv equivalence (issue #733)", () => {
  it("provision() expands to argv identical to today's, via --print-argv as the non-executing oracle", async () => {
    // Make the fixture an equipped repo: the adapter delegates to the VENDORED
    // script, so copy the real one (plus the config reader it shells out to)
    // rather than stubbing it — the oracle must be the genuine script.
    mkdirSync(path.join(tmp, ".oh", "scripts"), { recursive: true });
    const vendored = path.join(tmp, ".oh", "scripts", "docker-compose.sh");
    copyFileSync(SCRIPT, vendored);
    copyFileSync(
      path.join(REPO_ROOT, ".oh", "scripts", "harness-config.sh"),
      path.join(tmp, ".oh", "scripts", "harness-config.sh"),
    );
    writeFileSync(path.join(tmp, "harness.yaml"), "sandbox:\n  name: from-yaml\n");

    // Fake runner: capture what the adapter WOULD spawn; never spawn it.
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

    // (1) The adapter neither invents, drops, nor reorders a compose verb.
    const adapterComposeArgs = rest.slice(2);
    expect(adapterComposeArgs).toEqual(TODAYS_SANDBOX_COMPOSE_ARGS);

    // (2) The real script expands the adapter's tail and today's tail to the
    //     same compose argv — the equivalence the seam is required to preserve.
    const expand = (args: string[]): string[] => {
      const result = spawnSync("bash", [script, "--repo-dir", tmp, "--print-argv", ...args], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      return normalizeHarnessEnv(result.stdout.trimEnd().split("\n"));
    };
    const viaAdapter = expand(adapterComposeArgs);
    const viaToday = expand(TODAYS_SANDBOX_COMPOSE_ARGS);
    expect(viaAdapter).toEqual(viaToday);

    // (3) And that argv is still the real thing, not two identical empties.
    expect(viaAdapter).toEqual([
      "docker",
      "compose",
      "--env-file",
      "<harness-env>",
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

  // REVERSED (was "installer keeps host defaults out of tracked harness.yaml").
  // The installer used to write every non-secret answer to .devcontainer/.env
  // while its own closing text named harness.yaml as the file that wins — so the
  // user's answers landed in the LOSING file. Compose tolerated it (it falls back
  // to .env for every overlay decision); the `oh` CLI does not, because it
  // resolves sandbox.name and install.* from harness.yaml only. Non-secrets now
  // go to harness.yaml, which both doors read.
  it("installer writes non-secret answers to harness.yaml, the file that wins", () => {
    const text = readFileSync(INSTALL, "utf8");
    expect(text).toContain("Existing .devcontainer/.env preserved");
    // The single line editor, respecting harness-config.sh's awk grammar.
    expect(text).toContain("_yaml_set() {");
    expect(text).toContain("_cfg_set sandbox name       SANDBOX_NAME");
    expect(text).toContain("_cfg_set git     user_name  GIT_USER_NAME");
    // harness.yaml must be materialized BEFORE the prompts, or the answers have
    // nowhere to land.
    expect(text.indexOf("Created harness.yaml from harness.yaml.example")).toBeLessThan(
      text.indexOf("_cfg_set sandbox name"),
    );
    // Optional installs land as harness.yaml install.* keys, matching what
    // `oh harness install <name>` writes.
    expect(text).toContain("_yaml_set install");
    // Secrets stay in .devcontainer/.env, never in harness.yaml.
    expect(text).toContain("GH_TOKEN=");
    expect(text).not.toContain("_yaml_set sandbox gh_token");
    // DOCKER_SOCKET is the ONE documented non-secret exception: the VS Code
    // "Reopen in Container" path loads the compose file directly and cannot read
    // harness.yaml, so a socket opt-in recorded only there would be invisible.
    expect(text).toContain("DELIBERATE EXCEPTION");
    expect(text).toContain("printf 'DOCKER_SOCKET=true\\n' >> \"$REPO_DIR/.devcontainer/.env\"");
  });
});
