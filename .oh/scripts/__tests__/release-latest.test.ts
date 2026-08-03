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
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const HELPER = join(ROOT, ".oh", "scripts", "promote-release-latest.sh");
const MAIN_SHA = "0123456789abcdef0123456789abcdef01234567";
const MASTER_SHA = "89abcdef0123456789abcdef0123456789abcdef";
const STALE_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const DIGEST = `sha256:${"a".repeat(64)}`;

let fixture = "";
let bin = "";
let dockerLog = "";

function executable(path: string, source: string) {
  writeFileSync(path, source, "utf8");
  chmodSync(path, 0o755);
}

function run(
  mode: "check" | "promote",
  overrides: Record<string, string> = {},
) {
  return spawnSync(HELPER, [mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_DOCKER_INSPECTION: `Name: test\nMediaType: application/vnd.oci.image.index.v1+json\nDigest: ${DIGEST}`,
      FAKE_GIT_REFS: `${MAIN_SHA}\trefs/heads/main`,
      IMAGE_REPOSITORY: "ghcr.io/example/openharness",
      RELEASE_BRANCH: "main",
      RELEASE_SHA: MAIN_SHA,
      RELEASE_VERSION: "2026.8.3",
      ...overrides,
    },
  });
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "release-latest-"));
  bin = join(fixture, "bin");
  dockerLog = join(fixture, "docker.log");
  mkdirSync(bin);
  executable(
    join(bin, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "ls-remote --heads origin refs/heads/main refs/heads/master" ]]
printf '%s\n' "\${FAKE_GIT_REFS}"
`,
  );
  executable(
    join(bin, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$*" == "buildx imagetools inspect "* ]]; then
  printf '%b\n' "$FAKE_DOCKER_INSPECTION"
elif [[ "$*" != "buildx imagetools create "* ]]; then
  echo "unexpected docker invocation: $*" >&2
  exit 2
fi
`,
  );
});

afterEach(() => {
  rmSync(fixture, { force: true, recursive: true });
});

describe("promote-release-latest.sh", () => {
  it("promotes a fresh canonical main image by immutable digest", () => {
    const result = run("promote");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Promoted ghcr.io/example/openharness:2026.8.3");
    expect(readFileSync(dockerLog, "utf8").trim().split("\n")).toEqual([
      "buildx imagetools inspect ghcr.io/example/openharness:2026.8.3",
      `buildx imagetools create --tag ghcr.io/example/openharness:latest ghcr.io/example/openharness:2026.8.3@${DIGEST}`,
    ]);
  });

  it("prefers main and never lets a master run regress latest across branches", () => {
    const result = run("promote", {
      FAKE_GIT_REFS: `${MAIN_SHA}\trefs/heads/main\n${MASTER_SHA}\trefs/heads/master`,
      RELEASE_BRANCH: "master",
      RELEASE_SHA: MASTER_SHA,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Skipping latest: canonical=main");
    expect(existsSync(dockerLog)).toBe(false);
  });

  it("falls back to master only when main is absent", () => {
    const result = run("promote", {
      FAKE_GIT_REFS: `${MASTER_SHA}\trefs/heads/master`,
      RELEASE_BRANCH: "master",
      RELEASE_SHA: MASTER_SHA,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(dockerLog, "utf8")).toContain("imagetools create --tag");
  });

  it("skips a stale canonical run before invoking docker", () => {
    const result = run("promote", { RELEASE_SHA: STALE_SHA });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`head=${MAIN_SHA}`);
    expect(existsSync(dockerLog)).toBe(false);
  });

  it("writes the same fresh canonical decision for GitHub make_latest", () => {
    const output = join(fixture, "github-output");
    const result = run("check", {
      FAKE_GIT_REFS: `${MAIN_SHA}\trefs/heads/main\n${MASTER_SHA}\trefs/heads/master`,
      GITHUB_OUTPUT: output,
      RELEASE_BRANCH: "master",
      RELEASE_SHA: MASTER_SHA,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toBe(
      `canonicalBranch=main\ncanonicalSha=${MAIN_SHA}\nmakeLatest=false\n`,
    );
    expect(existsSync(dockerLog)).toBe(false);
  });

  it("fails closed when registry inspection has no valid top-level digest", () => {
    const result = run("promote", { FAKE_DOCKER_INSPECTION: "Name: test\nDigest: latest" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("one valid top-level digest");
    expect(readFileSync(dockerLog, "utf8")).not.toContain("imagetools create");
  });
});
