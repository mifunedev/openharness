import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SECRET_KEYS,
  isSecretKey,
  listSecretKeys,
  readSecret,
  secretsFilePath,
  setSecret,
} from "../secrets.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function makeRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-secrets-"));
  cleanups.push(d);
  return d;
}

const read = (root: string): string => readFileSync(secretsFilePath(root), "utf8");

describe("allow-list", () => {
  it("holds every key the sandbox treats as a credential", () => {
    expect([...SECRET_KEYS]).toEqual([
      "GH_TOKEN",
      "XAI_API_KEY",
      "SANDBOX_PASSWORD",
      "PI_SLACK_APP_TOKEN",
      "PI_SLACK_BOT_TOKEN",
      "LANGFUSE_PUBLIC_KEY",
      "LANGFUSE_SECRET_KEY",
      "OH_CLOUD_PROVISION_KEY",
    ]);
  });

  it("excludes non-secret settings that live in oh.json", () => {
    for (const key of ["SANDBOX_NAME", "TZ", "GIT_USER_EMAIL", "SANDBOX_SSH_AUTHORIZED_KEYS"]) {
      expect(isSecretKey(key)).toBe(false);
    }
  });
});

describe("setSecret", () => {
  it("writes an allow-listed key to the root dotenv at mode 0600", () => {
    const root = makeRoot();
    setSecret(root, "GH_TOKEN", "ghp_example");
    expect(read(root)).toContain("GH_TOKEN=ghp_example");
    expect(statSync(secretsFilePath(root)).mode & 0o777).toBe(0o600);
  });

  it("points a non-allow-listed key at `oh config set`", () => {
    const root = makeRoot();
    expect(() => setSecret(root, "SANDBOX_NAME", "demo")).toThrow(/oh config set/);
    expect(() => setSecret(root, "SANDBOX_NAME", "demo")).toThrow(/is not a secret/);
  });

  it("rewrites an existing key in place instead of duplicating it", () => {
    const root = makeRoot();
    setSecret(root, "GH_TOKEN", "one");
    setSecret(root, "GH_TOKEN", "two");
    const lines = read(root).split("\n").filter((l) => l.startsWith("GH_TOKEN="));
    expect(lines).toEqual(["GH_TOKEN=two"]);
  });

  it("uncomments a commented key rather than appending a second one", () => {
    const root = makeRoot();
    writeFileSync(secretsFilePath(root), "# GH_TOKEN=\n# PI_SLACK_BOT_TOKEN=xoxb-...\n");
    setSecret(root, "PI_SLACK_BOT_TOKEN", "xoxb-real");
    expect(read(root)).toBe("# GH_TOKEN=\nPI_SLACK_BOT_TOKEN=xoxb-real\n");
  });

  it("refuses a value containing a newline", () => {
    const root = makeRoot();
    expect(() => setSecret(root, "GH_TOKEN", "a\nb")).toThrow(/must not contain a newline/);
  });
});

describe("readSecret", () => {
  it("round-trips a value", () => {
    const root = makeRoot();
    setSecret(root, "OH_CLOUD_PROVISION_KEY", "pk-123");
    expect(readSecret(root, "OH_CLOUD_PROVISION_KEY")).toBe("pk-123");
  });

  it("returns undefined when the file or the key is absent", () => {
    const root = makeRoot();
    expect(readSecret(root, "GH_TOKEN")).toBeUndefined();
    setSecret(root, "GH_TOKEN", "x");
    expect(readSecret(root, "XAI_API_KEY")).toBeUndefined();
  });

  it("refuses to read a key that is not a secret", () => {
    const root = makeRoot();
    expect(() => readSecret(root, "TZ")).toThrow(/oh config set/);
  });
});

describe("listSecretKeys", () => {
  it("returns names only — never a value", () => {
    const root = makeRoot();
    setSecret(root, "GH_TOKEN", "ghp_supersecret");
    setSecret(root, "PI_SLACK_APP_TOKEN", "xapp-supersecret");

    const keys = listSecretKeys(root);
    expect(keys).toEqual(["GH_TOKEN", "PI_SLACK_APP_TOKEN"]);
    expect(JSON.stringify(keys)).not.toContain("supersecret");
  });

  it("omits keys present but empty", () => {
    const root = makeRoot();
    writeFileSync(secretsFilePath(root), "GH_TOKEN=\nXAI_API_KEY=k\n");
    expect(listSecretKeys(root)).toEqual(["XAI_API_KEY"]);
  });

  it("is empty when no dotenv exists", () => {
    expect(listSecretKeys(makeRoot())).toEqual([]);
  });
});
