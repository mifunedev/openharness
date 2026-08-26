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
    // Before 0.4.0 this script generated a SECOND env-file from harness.yaml —
    // a temporary one for read-like invocations, a persistent
    // .devcontainer/.harness.yaml.env otherwise. That derived file was
    // invisible to the VS Code path, which reads .devcontainer/.env only. It is
    // gone: one surface, one --env-file, and no artifact left behind.
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
    // Shell-metacharacter-bearing paths must survive as ONE argv entry each.
    // harness.yaml's compose.overrides list is gone; .oh/config.json's
    // composeOverrides[] is the only list surface, and the migrator moves any
    // existing entries into it.
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
    // Legacy root config.json present too — the canonical .oh/ copy must win.
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
    // No derived artifact is created on the executing path either.
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
    // The wrapper is the path every `make` and `oh` lifecycle verb goes
    // through, so it is where an existing install gets carried over. Migration
    // output goes to STDERR so --print-argv stays parseable — which is exactly
    // why printArgv() asserts an empty stderr and cannot be used here.
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
    // stdout is still nothing but argv.
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

/**
 * The compose argv `oh sandbox` produced BEFORE it routed through the execution
 * contract (issue #733) — the same verb the Makefile pins at
 * `$(COMPOSE) up -d --build`. Frozen here as the oracle's expected side, so the
 * comparison below is against recorded history, not against itself.
 */
const TODAYS_SANDBOX_COMPOSE_ARGS = ["up", "-d", "--build"];

describe("execution target argv equivalence (issue #733)", () => {
  it("provision() expands to argv identical to today's, via --print-argv as the non-executing oracle", async () => {
    // Make the fixture an equipped repo: the adapter delegates to the VENDORED
    // script, so copy the real one rather than stubbing it — the oracle must be
    // the genuine script. No config reader is copied alongside it any more;
    // the script parses no YAML and shells out to nothing.
    mkdirSync(path.join(tmp, ".oh", "scripts"), { recursive: true });
    const vendored = path.join(tmp, ".oh", "scripts", "docker-compose.sh");
    copyFileSync(SCRIPT, vendored);
    writeFileSync(path.join(tmp, ".devcontainer", ".env"), "SANDBOX_NAME=from-env\n");

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
      return result.stdout.trimEnd().split("\n");
    };
    const viaAdapter = expand(adapterComposeArgs);
    const viaToday = expand(TODAYS_SANDBOX_COMPOSE_ARGS);
    expect(viaAdapter).toEqual(viaToday);

    // (3) And that argv is still the real thing, not two identical empties.
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

  // REVERSED TWICE. The installer first wrote every non-secret answer to
  // .devcontainer/.env while naming harness.yaml as the file that wins, so the
  // answers landed in the LOSING file; that was fixed by routing them to
  // harness.yaml. harness.yaml is now gone, and .env is the file BOTH doors
  // read — so the answers come back here, and this time the two agree.
  it("installer writes every answer to .devcontainer/.env, and the config writes ALWAYS run", () => {
    const text = readFileSync(INSTALL, "utf8");
    // The single line editor, uncommenting the template line in place.
    expect(text).toContain("_env_set() {");
    expect(text).toContain("_env_set SANDBOX_NAME");
    expect(text).toContain("_env_set GIT_USER_NAME");
    expect(text).not.toContain("_yaml_set");
    expect(text).not.toContain("_cfg_set");

    // .env must be materialized BEFORE the prompts, or the answers have
    // nowhere to land.
    expect(text.indexOf("Created .devcontainer/.env from")).toBeLessThan(
      text.indexOf("_env_set SANDBOX_NAME"),
    );

    // THE REGRESSION THIS PINS: the config block used to sit inside
    // `if [ ! -f .devcontainer/.env ]`, so re-running the installer over an
    // existing install wrote nothing. With .env as the only surface that would
    // be a total no-op. The existing-file branch must now only REPORT, never
    // gate the writes that follow.
    expect(text).toContain("Existing .devcontainer/.env preserved — updating keys in place");
    expect(text).toContain("THE CONFIG WRITES ALWAYS RUN");

    // Optional installs land as INSTALL_* keys, matching what
    // `oh harness install <name>` writes.
    expect(text).toContain('_env_set "INSTALL_$1" true');

    // A pre-0.4.0 harness.yaml is carried over exactly once.
    expect(text).toContain("migrate-harness-yaml.sh");

    // Secrets live in the same file, and no key writes one by another name.
    expect(text).toContain("GH_TOKEN=");
  });
});
