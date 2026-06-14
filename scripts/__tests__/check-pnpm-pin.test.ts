import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "check-pnpm-pin.sh");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
  output: string; // stdout + stderr combined for convenience
}

function run(dockerfile: string, packageJson: string, opts?: { cwd?: string }): RunResult {
  const result = spawnSync(
    "bash",
    [SCRIPT, "--dockerfile", dockerfile, "--package-json", packageJson],
    { encoding: "utf-8", cwd: opts?.cwd },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    stdout,
    stderr,
    status: result.status ?? -1,
    output: stdout + stderr,
  };
}

let tmp: string;

function writeFixtures(dockerfileContent: string, pkgJsonContent: string): { df: string; pj: string } {
  const df = path.join(tmp, "Dockerfile");
  const pj = path.join(tmp, "package.json");
  writeFileSync(df, dockerfileContent);
  writeFileSync(pj, pkgJsonContent);
  return { df, pj };
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "check-pnpm-pin-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Case A — matching versions → exit 0
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — Case A: matching versions", () => {
  it("exits 0 when Dockerfile and package.json pin the same pnpm version", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\nRUN corepack enable && corepack prepare pnpm@10.33.0 --activate\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0" }),
    );
    const { status } = run(df, pj);
    expect(status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case B — differing versions → exit non-zero, output contains both versions
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — Case B: version mismatch", () => {
  it("exits non-zero and mentions both versions when they differ", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\nRUN corepack enable && corepack prepare pnpm@9.0.0 --activate\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0" }),
    );
    const { status, output } = run(df, pj);
    expect(status).not.toBe(0);
    expect(output).toContain("9.0.0");
    expect(output).toContain("10.33.0");
  });
});

// ---------------------------------------------------------------------------
// Case C — Dockerfile has NO corepack prepare pnpm@ line → exit non-zero
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — Case C: missing corepack line in Dockerfile", () => {
  it("exits non-zero when there is no corepack prepare pnpm@ line", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\n# no corepack line here\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0" }),
    );
    const { status } = run(df, pj);
    expect(status).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case D — package.json has +sha suffix; Dockerfile pin is bare semver → exit 0
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — Case D: package.json has +sha suffix", () => {
  it("exits 0 when the sha suffix is stripped and versions match", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\nRUN corepack enable && corepack prepare pnpm@10.33.0 --activate\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0+sha512.deadbeef" }),
    );
    const { status } = run(df, pj);
    expect(status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case E — Dockerfile pins pnpm@latest → exit non-zero (non-semver)
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — Case E: Dockerfile pins 'latest' (non-semver)", () => {
  it("exits non-zero when Dockerfile uses pnpm@latest instead of a semver", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\nRUN corepack enable && corepack prepare pnpm@latest --activate\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0" }),
    );
    const { status, output } = run(df, pj);
    expect(status).not.toBe(0);
    // The script emits a distinct error about non-semver, not the missing-line error
    expect(output).toContain("latest");
    expect(output).not.toContain("no 'corepack prepare pnpm@");
  });
});

// ---------------------------------------------------------------------------
// CWD-independence — run from a non-repo-root cwd, still passes flags correctly
// ---------------------------------------------------------------------------

describe("check-pnpm-pin.sh — CWD independence", () => {
  it("exits 0 for matching versions even when cwd is os.tmpdir()", () => {
    const { df, pj } = writeFixtures(
      "FROM node:20\nRUN corepack enable && corepack prepare pnpm@10.33.0 --activate\n",
      JSON.stringify({ packageManager: "pnpm@10.33.0" }),
    );
    const { status } = run(df, pj, { cwd: tmpdir() });
    expect(status).toBe(0);
  });
});
