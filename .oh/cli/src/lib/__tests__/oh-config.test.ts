import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultOhConfig,
  ohConfigPath,
  readOhConfig,
  validateOhConfig,
  writeOhConfig,
  type OhConfig,
} from "../oh-config.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-config-"));
  cleanups.push(d);
  return d;
}

describe("ohConfigPath", () => {
  it("resolves oh.json at the project root", () => {
    const root = makeRoot();
    expect(ohConfigPath(root)).toBe(join(root, "oh.json"));
  });
});

describe("readOhConfig", () => {
  it("returns defaults named after the project directory when the file is absent", () => {
    const root = makeRoot();
    const config = readOhConfig(ohConfigPath(root));
    expect(config.version).toBe(1);
    expect(config.name).toBe(root.split("/").pop());
    expect(config.access?.sshPort).toBe(2222);
  });

  it("rejects a file that is not valid JSON", () => {
    const root = makeRoot();
    writeFileSync(ohConfigPath(root), "{nope");
    expect(() => readOhConfig(ohConfigPath(root))).toThrow(/oh\.json is not valid JSON/);
  });

  it("rejects a JSON array", () => {
    const root = makeRoot();
    writeFileSync(ohConfigPath(root), "[]");
    expect(() => readOhConfig(ohConfigPath(root))).toThrow(/oh\.json: must contain a JSON object/);
  });
});

describe("round trip", () => {
  it("preserves the default config exactly", () => {
    const root = makeRoot();
    const config = defaultOhConfig("demo");
    writeOhConfig(root, config);
    expect(readOhConfig(ohConfigPath(root))).toEqual(config);
  });

  it("preserves an unknown top-level key the operator added by hand", () => {
    const root = makeRoot();
    writeFileSync(
      ohConfigPath(root),
      JSON.stringify({ version: 1, name: "demo", experimental: { beam: true } }, null, 2),
    );

    const read = readOhConfig(ohConfigPath(root));
    expect(read.experimental).toEqual({ beam: true });

    writeOhConfig(root, read);
    const again = JSON.parse(readFileSync(ohConfigPath(root), "utf8")) as Record<string, unknown>;
    expect(again.experimental).toEqual({ beam: true });
  });

  it("preserves an unknown key nested inside a known section", () => {
    const root = makeRoot();
    writeFileSync(
      ohConfigPath(root),
      JSON.stringify({ version: 1, access: { ssh: true, futureFlag: "keep" } }),
    );
    const read = readOhConfig(ohConfigPath(root));
    writeOhConfig(root, read);
    const again = JSON.parse(readFileSync(ohConfigPath(root), "utf8")) as {
      access: Record<string, unknown>;
    };
    expect(again.access.futureFlag).toBe("keep");
  });

  it("writes oh.json world-readable — it is a tracked, non-secret file", () => {
    const root = makeRoot();
    writeOhConfig(root, defaultOhConfig("demo"));
    expect(statSync(ohConfigPath(root)).mode & 0o777).toBe(0o644);
  });

  it("stamps version 1 on a config that omits it", () => {
    const root = makeRoot();
    writeOhConfig(root, { name: "demo" } as unknown as OhConfig);
    expect(readOhConfig(ohConfigPath(root)).version).toBe(1);
  });
});

describe("validateOhConfig", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["name", { name: 1 }, /^oh\.json: name must be a string$/],
    ["timezone", { timezone: true }, /^oh\.json: timezone must be a string$/],
    ["projectRoot", { projectRoot: [] }, /^oh\.json: projectRoot must be a string$/],
    ["git", { git: "me" }, /^oh\.json: git must be an object$/],
    ["git.userName", { git: { userName: 7 } }, /^oh\.json: git\.userName must be a string$/],
    ["git.userEmail", { git: { userEmail: 7 } }, /^oh\.json: git\.userEmail must be a string$/],
    [
      "install.opencode",
      { install: { opencode: "true" } },
      /^oh\.json: install\.opencode must be a boolean$/,
    ],
    [
      "install.agentBrowser",
      { install: { agentBrowser: 1 } },
      /^oh\.json: install\.agentBrowser must be a boolean$/,
    ],
    ["access.ssh", { access: { ssh: "yes" } }, /^oh\.json: access\.ssh must be a boolean$/],
    ["access.sshPort", { access: { sshPort: "2222" } }, /^oh\.json: access\.sshPort must be a number$/],
    [
      "access.sshPort range",
      { access: { sshPort: 0 } },
      /^oh\.json: access\.sshPort must be an integer between 1 and 65535$/,
    ],
    [
      "access.sshAuthorizedKeys",
      { access: { sshAuthorizedKeys: ["k"] } },
      /^oh\.json: access\.sshAuthorizedKeys must be a string$/,
    ],
    [
      "access.dockerSocket",
      { access: { dockerSocket: "on" } },
      /^oh\.json: access\.dockerSocket must be a boolean$/,
    ],
    [
      "hermesDashboard.port",
      { hermesDashboard: { port: "9119" } },
      /^oh\.json: hermesDashboard\.port must be a number$/,
    ],
    ["cron.agentBin", { cron: { agentBin: 3 } }, /^oh\.json: cron\.agentBin must be a string$/],
    [
      "build.skipPnpmInstall",
      { build: { skipPnpmInstall: "1" } },
      /^oh\.json: build\.skipPnpmInstall must be a boolean$/,
    ],
    ["image.ref", { image: { ref: 5 } }, /^oh\.json: image\.ref must be a string$/],
    ["image.mode", { image: { mode: "pull" } }, /^oh\.json: image\.mode must be one of build, image$/],
    [
      "image.pullPolicy",
      { image: { pullPolicy: "sometimes" } },
      /^oh\.json: image\.pullPolicy must be one of missing, always, never$/,
    ],
    ["cloud.apiUrl", { cloud: { apiUrl: 1 } }, /^oh\.json: cloud\.apiUrl must be a string$/],
    [
      "composeOverrides",
      { composeOverrides: "a.yml" },
      /^oh\.json: composeOverrides must be an array of strings$/,
    ],
    [
      "composeOverrides entries",
      { composeOverrides: ["a.yml", 2] },
      /^oh\.json: composeOverrides must be an array of strings$/,
    ],
    ["version", { version: 2 }, /^oh\.json: version must be 1$/],
  ];

  for (const [label, value, message] of cases) {
    it(`rejects a wrong type at ${label} with a path-qualified message`, () => {
      expect(() => validateOhConfig(value)).toThrow(message);
    });
  }

  it("accepts the default config", () => {
    expect(() => validateOhConfig(defaultOhConfig("demo"))).not.toThrow();
  });
});
