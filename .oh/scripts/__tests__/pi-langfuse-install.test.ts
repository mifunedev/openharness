import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const INSTALLER = join(ROOT, ".pi/install/install-langfuse.sh");

function fixture(auditExit = 0) {
  const home = mkdtempSync(join(tmpdir(), "pi-langfuse-install-"));
  const bin = join(home, "bin");
  const npmRoot = join(home, ".pi/agent/npm");
  const piLog = join(home, "pi.log");
  const npmLog = join(home, "npm.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(npmRoot, { recursive: true });
  writeFileSync(
    join(npmRoot, "package.json"),
    `${JSON.stringify({
      name: "pi-extensions",
      private: true,
      dependencies: { "pi-langfuse": "^1.5.7" },
      overrides: { existing: "1.0.0" },
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

  it("pins the package, applies the scoped patched override, and audits idempotently", () => {
    const test = fixture();

    execFileSync("bash", [INSTALLER], { env: test.env });
    execFileSync("bash", [INSTALLER], { env: test.env });

    const manifest = JSON.parse(readFileSync(join(test.npmRoot, "package.json"), "utf8"));
    expect(manifest.overrides).toEqual({
      existing: "1.0.0",
      "pi-langfuse": { "@opentelemetry/sdk-node": "0.220.0" },
    });
    expect(readFileSync(test.piLog, "utf8").trim().split("\n")).toEqual([
      "install npm:pi-langfuse@1.5.7",
      "install npm:pi-langfuse@1.5.7",
    ]);
    const npmCalls = readFileSync(test.npmLog, "utf8").trim().split("\n");
    expect(npmCalls).toEqual([
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
      `install --prefix ${test.npmRoot} --omit=dev --legacy-peer-deps`,
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    ]);
  });

  it("fails when the final npm audit is not clean", () => {
    const test = fixture(1);
    const result = spawnSync("bash", [INSTALLER], { env: test.env, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(readFileSync(test.npmLog, "utf8")).toContain(
      `audit --prefix ${test.npmRoot} --audit-level=low`,
    );
  });
});
