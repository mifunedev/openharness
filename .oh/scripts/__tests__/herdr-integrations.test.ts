import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const reconciler = path.join(repoRoot, ".oh/scripts/reconcile-herdr-integrations.sh");
const temporaryDirectories: string[] = [];

const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "herdr-integrations-"));
  temporaryDirectories.push(root);
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  const log = path.join(root, "calls.log");
  const hermesHome = path.join(root, "project", ".hermes");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });

  writeFileSync(path.join(bin, "herdr"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HERDR_TEST_LOG"\n');
  writeFileSync(path.join(bin, "opencode"), "#!/bin/sh\n");
  writeFileSync(path.join(bin, "hermes"), "#!/bin/sh\n");
  for (const command of ["herdr", "opencode", "hermes"]) chmodSync(path.join(bin, command), 0o755);

  return {
    root,
    home,
    log,
    hermesHome,
    env: {
      ...process.env,
      HOME: home,
      HERMES_HOME: hermesHome,
      HERDR_TEST_LOG: log,
      PATH: `${bin}:/usr/bin:/bin`,
    },
  };
};

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
});

describe("Herdr integration reconciliation", () => {
  it("reconciles default and installed optional agents idempotently", () => {
    const test = fixture();

    execFileSync("bash", [reconciler], { env: test.env });
    execFileSync("bash", [reconciler], { env: test.env });

    const calls = readFileSync(test.log, "utf8").trim().split("\n");
    for (const agent of ["claude", "codex", "pi", "opencode", "hermes"]) {
      expect(calls.filter((call) => call === `integration install ${agent}`)).toHaveLength(2);
    }
    expect(calls).toHaveLength(10);
    expect(statSync(path.join(test.home, ".claude")).isDirectory()).toBe(true);
    expect(statSync(path.join(test.home, ".pi/agent/extensions")).isDirectory()).toBe(true);
    expect(statSync(test.hermesHome).isDirectory()).toBe(true);
  });

  it("makes the opt-out mutation-free", () => {
    const test = fixture();

    execFileSync("bash", [reconciler], {
      env: { ...test.env, HERDR_AUTO_INTEGRATIONS: "false" },
    });

    expect(() => readFileSync(test.log, "utf8")).toThrow();
  });
});
