import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "harness-config.sh");
const HARNESS_YAML = path.join(REPO_ROOT, "harness.yaml");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(args: string[]): RunResult {
  const result = spawnSync("sh", [SCRIPT, ...args], { encoding: "utf-8" });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

let tmp: string;

function fixture(content: string): string {
  const file = path.join(tmp, "test.yaml");
  writeFileSync(file, content);
  return file;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "harness-config-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// env mode
// ---------------------------------------------------------------------------

describe("harness-config.sh env mode", () => {
  it("exits 0 with empty stdout for an absent file", () => {
    const missing = path.join(tmp, "nonexistent.yaml");
    const { stdout, status } = run(["env", missing]);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("produces no output for fully-commented keys", () => {
    const f = fixture(
      "sandbox:\n  # name: openharness\ninstall:\n  # opencode: true\n",
    );
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("");
  });

  it("maps install.opencode: true → INSTALL_OPENCODE=true", () => {
    const f = fixture("install:\n  opencode: true\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("INSTALL_OPENCODE=true");
  });

  it("maps install.grok_build: true → INSTALL_GROK_BUILD=true", () => {
    const f = fixture("install:\n  grok_build: true\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("INSTALL_GROK_BUILD=true");
  });

  it("handles values with spaces: git.user_name → GIT_USER_NAME", () => {
    const f = fixture("git:\n  user_name: Ryan Eggz\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("GIT_USER_NAME=Ryan Eggz");
  });

  it("strips enclosing double quotes from values", () => {
    const f = fixture('sandbox:\n  name: "openharness"\n');
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("SANDBOX_NAME=openharness");
  });

  it("strips trailing inline comment from values", () => {
    const f = fixture("crons:\n  dir: crons   # comment\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("CRONS_DIR=crons");
  });

  it("ignores unknown and secret-named keys", () => {
    // Neither secrets.gh_token nor secrets.random_key is in the envmap allowlist.
    const f = fixture("secrets:\n  gh_token: abc\n  random_key: x\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("");
  });

  it("skips keys with empty values in env mode", () => {
    const f = fixture("sandbox:\n  name:\n");
    const { stdout } = run(["env", f]);
    expect(stdout.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// compose-overrides mode
// ---------------------------------------------------------------------------

describe("harness-config.sh compose-overrides mode", () => {
  it("extracts a two-item overrides list in order", () => {
    const f = fixture(
      "compose:\n  overrides:\n" +
        "    - .devcontainer/docker-compose.a.yml\n" +
        "    - .devcontainer/docker-compose.b.yml\n",
    );
    const { stdout } = run(["compose-overrides", f]);
    const lines = stdout.trim().split("\n");
    expect(lines).toEqual([
      ".devcontainer/docker-compose.a.yml",
      ".devcontainer/docker-compose.b.yml",
    ]);
  });
});

// ---------------------------------------------------------------------------
// get mode
// ---------------------------------------------------------------------------

describe("harness-config.sh get mode", () => {
  it("returns the value for an existing key", () => {
    const f = fixture("sandbox:\n  name: openharness\n");
    const { stdout } = run(["get", "sandbox.name", f]);
    expect(stdout.trim()).toBe("openharness");
  });

  it("returns empty for a missing key", () => {
    const f = fixture("sandbox:\n  name: openharness\n");
    const { stdout } = run(["get", "sandbox.missing", f]);
    expect(stdout.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// real harness.yaml
// ---------------------------------------------------------------------------

describe("harness-config.sh — real harness.yaml", () => {
  it("parses without error and emits nothing (all shipped keys commented)", () => {
    // The shipped file is fully commented so a fresh clone changes nothing:
    // .env / compose defaults stay authoritative until a key is uncommented.
    const { stdout, status } = run(["env", HARNESS_YAML]);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("emits a key once uncommented (uncommented copy of the shipped file)", () => {
    const shipped = readFileSync(HARNESS_YAML, "utf8");
    const activated = shipped.replace("  # name: openharness", "  name: openharness");
    const file = fixture(activated);
    const { stdout, status } = run(["env", file]);
    expect(status).toBe(0);
    expect(stdout).toContain("SANDBOX_NAME=openharness");
  });
});
