import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const INSTALLER = join(ROOT, ".pi/install/install-langfuse.sh");
const PI_LANGFUSE_VERSION = "1.5.9";
const PI_LANGFUSE_COMMIT = "51a59c854859bbb08a43baad98f0b9eb4a94588c";
const PI_LANGFUSE_SOURCE = `git+https://github.com/ryaneggz/pi-langfuse.git#${PI_LANGFUSE_COMMIT}`;
const PI_LANGFUSE_RESOLVED = `git+ssh://git@github.com/ryaneggz/pi-langfuse.git#${PI_LANGFUSE_COMMIT}`;

function fixture(
  auditExit = 0,
  packageVersion = PI_LANGFUSE_VERSION,
  packageResolved = PI_LANGFUSE_RESOLVED,
  removeExit = 1,
  removeMessage = `No matching package found for npm:pi-langfuse@${PI_LANGFUSE_VERSION}`,
) {
  const home = mkdtempSync(join(tmpdir(), "pi-langfuse-install-"));
  const bin = join(home, "bin");
  const npmRoot = join(home, ".pi/agent/npm");
  const packageRoot = join(npmRoot, "node_modules/pi-langfuse");
  const piLog = join(home, "pi.log");
  const npmLog = join(home, "npm.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(npmRoot, "package.json"),
    `${JSON.stringify({
      name: "pi-extensions",
      private: true,
      dependencies: { existing: "1.0.0" },
      overrides: { existing: "1.0.0" },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "pi-langfuse", version: packageVersion }, null, 2)}\n`,
  );
  writeFileSync(
    join(npmRoot, "package-lock.json"),
    `${JSON.stringify({
      name: "pi-extensions",
      lockfileVersion: 3,
      packages: {
        "": { name: "pi-extensions", private: true },
        "node_modules/pi-langfuse": {
          version: packageVersion,
          resolved: packageResolved,
        },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(piLog, "");
  writeFileSync(npmLog, "");
  writeFileSync(
    join(bin, "pi"),
    `#!/usr/bin/env bash
printf "%s\\n" "$*" >> "$PI_LOG"
if [ "$1" = remove ] && [ "$PI_REMOVE_EXIT" -ne 0 ]; then
  printf "%s\\n" "$PI_REMOVE_MESSAGE" >&2
  exit "$PI_REMOVE_EXIT"
fi
`,
  );
  writeFileSync(
    join(bin, "npm"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$NPM_LOG"
if [ "$1" = audit ]; then exit "$AUDIT_EXIT"; fi
`,
  );
  chmodSync(join(bin, "pi"), 0o755);
  chmodSync(join(bin, "npm"), 0o755);

  return {
    home,
    npmRoot,
    packageRoot,
    piLog,
    npmLog,
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      PI_LOG: piLog,
      NPM_LOG: npmLog,
      AUDIT_EXIT: String(auditExit),
      PI_REMOVE_EXIT: String(removeExit),
      PI_REMOVE_MESSAGE: removeMessage,
    },
  };
}

describe("pi-langfuse installer", () => {
  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", INSTALLER]);
  });

  it("pins the maintained fork, registers it in user scope, and audits idempotently", () => {
    const test = fixture();

    execFileSync("bash", [INSTALLER], { env: test.env });
    execFileSync("bash", [INSTALLER], { env: test.env });

    const manifest = JSON.parse(readFileSync(join(test.npmRoot, "package.json"), "utf8"));
    expect(manifest.dependencies["pi-langfuse"]).toBe(PI_LANGFUSE_SOURCE);
    expect(manifest.overrides).toEqual({
      existing: "1.0.0",
      "pi-langfuse": { "@opentelemetry/sdk-node": "0.220.0" },
    });
    expect(readFileSync(test.piLog, "utf8").trim().split("\n")).toEqual([
      `remove npm:pi-langfuse@${PI_LANGFUSE_VERSION}`,
      `install ${test.packageRoot}`,
      `remove npm:pi-langfuse@${PI_LANGFUSE_VERSION}`,
      `install ${test.packageRoot}`,
    ]);
    const npmCalls = readFileSync(test.npmLog, "utf8").trim().split("\n");
    expect(npmCalls).toEqual([
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    ]);
  });

  it("fails closed when the lockfile resolves a different fork commit", () => {
    const test = fixture(0, PI_LANGFUSE_VERSION, `${PI_LANGFUSE_RESOLVED}-different`);
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("reviewed pi-langfuse fork commit");
    expect(readFileSync(test.npmLog, "utf8")).not.toContain(" audit ");
  });

  it("fails closed when the fork package version changes", () => {
    const test = fixture(0, "1.5.8");
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      `expected pi-langfuse@${PI_LANGFUSE_VERSION}`,
    );
  });

  it("fails when the final npm audit is not clean", () => {
    const test = fixture(1);
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(readFileSync(test.npmLog, "utf8")).toContain(
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    );
  });

  it("does not hide an unexpected registry-removal failure", () => {
    const test = fixture(0, PI_LANGFUSE_VERSION, PI_LANGFUSE_RESOLVED, 1, "permission denied");
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("permission denied");
    expect(readFileSync(test.npmLog, "utf8")).toBe("");
  });
});
