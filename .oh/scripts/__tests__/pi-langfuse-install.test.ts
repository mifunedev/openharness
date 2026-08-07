import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PATCHED_SHUTDOWN_BLOCK,
  PI_LANGFUSE_INTEGRITY,
  PI_LANGFUSE_VERSION,
  VULNERABLE_SHUTDOWN_BLOCK,
} from "../../../.pi/install/patch-langfuse-shutdown.mjs";
import { describe, expect, it, vi } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const INSTALLER = join(ROOT, ".pi/install/install-langfuse.sh");
const PATCHER = join(ROOT, ".pi/install/patch-langfuse-shutdown.mjs");

const SHUTDOWN_FIXTURE_SOURCE = `export let lastRuntimeError = null;

export async function runShutdown(error, shouldAbort) {
  lastRuntimeError = null;
  const controller = new AbortController();
  if (shouldAbort) {
    controller.abort();
  }
  const thrownError = shouldAbort && error === "controller" ? controller.signal.reason : error;
  const debugLog = (message) => {
    if (process.env.PI_LANGFUSE_DEBUG === "1" || process.env.PI_LANGFUSE_DEBUG === "true") {
      console.log(message);
    }
  };
  const rememberRuntimeError = (scope, value) => {
    lastRuntimeError = {
      scope,
      message: value instanceof Error ? value.message : String(value),
    };
  };
  {
    try {
      throw thrownError;
${VULNERABLE_SHUTDOWN_BLOCK} finally {
      // The real implementation performs cleanup here.
    }
  }
  return lastRuntimeError;
}
`;

function fixture(
  auditExit = 0,
  packageVersion = PI_LANGFUSE_VERSION,
  source = SHUTDOWN_FIXTURE_SOURCE,
  packageIntegrity = PI_LANGFUSE_INTEGRITY,
) {
  const home = mkdtempSync(join(tmpdir(), "pi-langfuse-install-"));
  const bin = join(home, "bin");
  const npmRoot = join(home, ".pi/agent/npm");
  const packageRoot = join(npmRoot, "node_modules/pi-langfuse");
  const sourcePath = join(packageRoot, "src/langfuse.ts");
  const piLog = join(home, "pi.log");
  const npmLog = join(home, "npm.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(packageRoot, "src"), { recursive: true });
  writeFileSync(
    join(npmRoot, "package.json"),
    `${JSON.stringify({
      name: "pi-extensions",
      private: true,
      dependencies: { "pi-langfuse": `^${PI_LANGFUSE_VERSION}` },
      overrides: { existing: "1.0.0" },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "pi-langfuse", version: packageVersion }, null, 2)}\n`,
  );
  writeFileSync(sourcePath, source);
  writeFileSync(
    join(npmRoot, "package-lock.json"),
    `${JSON.stringify({
      name: "pi-extensions",
      lockfileVersion: 3,
      packages: {
        "": { name: "pi-extensions", private: true },
        "node_modules/pi-langfuse": {
          version: packageVersion,
          integrity: packageIntegrity,
        },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(join(bin, "pi"), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$PI_LOG"\n');
  writeFileSync(
    join(bin, "npm"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "$NPM_LOG"\nif [ "$1" = audit ]; then exit "$AUDIT_EXIT"; fi\n`,
  );
  chmodSync(join(bin, "pi"), 0o755);
  chmodSync(join(bin, "npm"), 0o755);

  return {
    home,
    npmRoot,
    packageRoot,
    sourcePath,
    piLog,
    npmLog,
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      PI_LOG: piLog,
      NPM_LOG: npmLog,
      AUDIT_EXIT: String(auditExit),
    },
  };
}

describe("pi-langfuse installer", () => {
  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", INSTALLER]);
  });

  it("pins the package, applies the scoped patch, and audits idempotently", () => {
    const test = fixture();

    execFileSync("bash", [INSTALLER], { env: test.env });
    const patchedSource = readFileSync(test.sourcePath, "utf8");
    execFileSync("bash", [INSTALLER], { env: test.env });

    const manifest = JSON.parse(readFileSync(join(test.npmRoot, "package.json"), "utf8"));
    expect(manifest.dependencies["pi-langfuse"]).toBe(`^${PI_LANGFUSE_VERSION}`);
    expect(manifest.overrides).toEqual({
      existing: "1.0.0",
      "pi-langfuse": { "@opentelemetry/sdk-node": "0.220.0" },
    });
    expect(readFileSync(test.sourcePath, "utf8")).toBe(patchedSource);
    expect(patchedSource).toContain(PATCHED_SHUTDOWN_BLOCK);
    expect(patchedSource).not.toContain(VULNERABLE_SHUTDOWN_BLOCK);
    expect(readFileSync(test.piLog, "utf8").trim().split("\n")).toEqual([
      `install npm:pi-langfuse@${PI_LANGFUSE_VERSION}`,
      `install npm:pi-langfuse@${PI_LANGFUSE_VERSION}`,
    ]);
    const npmCalls = readFileSync(test.npmLog, "utf8").trim().split("\n");
    expect(npmCalls).toEqual([
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    ]);
  });

  it("suppresses only the shutdown controller's AbortError", async () => {
    const test = fixture();
    execFileSync(process.execPath, [PATCHER, test.packageRoot]);
    const modulePath = join(test.home, "shutdown-fixture.mjs");
    writeFileSync(modulePath, readFileSync(test.sourcePath, "utf8"));
    const shutdown = await import(pathToFileURL(modulePath).href);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debug = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousDebug = process.env.PI_LANGFUSE_DEBUG;

    try {
      process.env.PI_LANGFUSE_DEBUG = "1";
      expect(await shutdown.runShutdown("controller", true)).toBeNull();
      expect(warning).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(
        "📊 Langfuse: Shutdown deadline reached before telemetry completed",
      );

      delete process.env.PI_LANGFUSE_DEBUG;
      expect(await shutdown.runShutdown(new DOMException("external abort", "AbortError"), false))
        .toMatchObject({ scope: "runtime shutdown", message: "external abort" });
      expect(warning).toHaveBeenCalledTimes(1);

      expect(await shutdown.runShutdown(new Error("network failure"), true))
        .toMatchObject({ scope: "runtime shutdown", message: "network failure" });
      expect(warning).toHaveBeenCalledTimes(2);
    } finally {
      if (previousDebug === undefined) {
        delete process.env.PI_LANGFUSE_DEBUG;
      } else {
        process.env.PI_LANGFUSE_DEBUG = previousDebug;
      }
      warning.mockRestore();
      debug.mockRestore();
    }
  });

  it("fails closed when the reviewed shutdown branch changes", () => {
    const changedSource = SHUTDOWN_FIXTURE_SOURCE.replace(
      VULNERABLE_SHUTDOWN_BLOCK,
      VULNERABLE_SHUTDOWN_BLOCK.replace("runtime shutdown", "changed shutdown"),
    );
    const test = fixture(0, PI_LANGFUSE_VERSION, changedSource);
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("refusing to patch an unknown package");
    expect(readFileSync(test.npmLog, "utf8")).not.toContain(" audit ");
  });

  it("fails when the final npm audit is not clean", () => {
    const test = fixture(1);
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(readFileSync(test.sourcePath, "utf8")).toContain(PATCHED_SHUTDOWN_BLOCK);
    expect(readFileSync(test.npmLog, "utf8")).toContain(
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    );
  });

  it("rejects an unexpected pi-langfuse version", () => {
    const test = fixture(0, "1.5.8");
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      `expected pi-langfuse@${PI_LANGFUSE_VERSION}`,
    );
  });

  it("rejects an unexpected npm tarball integrity", () => {
    const test = fixture(0, PI_LANGFUSE_VERSION, SHUTDOWN_FIXTURE_SOURCE, "sha512-not-reviewed");
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("tarball integrity");
  });
});
