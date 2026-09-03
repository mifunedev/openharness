import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCloudApiClient, runCloud, type CloudIO } from "../commands/cloud.js";
import { readOhConfig, ohConfigPath } from "../lib/oh-config.js";
import { readSecret } from "../lib/secrets.js";

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

interface Fixture {
  root: string;
  home: string;
  ohJson: string;
  dotenv: string;
  legacy: string;
  env: NodeJS.ProcessEnv;
}

function tempConfig(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "oh-cloud-"));
  cleanups.push(dir);
  const root = join(dir, "repo");
  const home = join(dir, "home");
  mkdirSync(join(root, ".oh"), { recursive: true });
  mkdirSync(home, { recursive: true });
  return {
    root,
    home,
    ohJson: ohConfigPath(root),
    dotenv: join(root, ".env"),
    legacy: join(home, ".config", "openharness", "cloud.json"),
    env: { HOME: home },
  };
}

function seedLegacy(fixture: Fixture, config: Record<string, unknown>): void {
  mkdirSync(join(fixture.home, ".config", "openharness"), { recursive: true });
  writeFileSync(fixture.legacy, `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`);
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function io(overrides: Partial<CloudIO> = {}): CloudIO & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    out,
    err,
    ...overrides,
  };
}

describe("cloud config", () => {
  it("splits a prompted provisioner key into the root dotenv and the URL into oh.json", async () => {
    const fixture = tempConfig();
    const console = io({
      env: fixture.env,
      cwd: fixture.root,
      askSecret: async () => "temporary-provisioner-secret",
    });

    expect(await runCloud(["config"], console)).toBe(0);
    expect(readOhConfig(fixture.ohJson).cloud).toEqual({ apiUrl: "http://127.0.0.1:3000" });
    expect(readSecret(fixture.root, "OH_CLOUD_PROVISION_KEY")).toBe("temporary-provisioner-secret");
    expect(statSync(fixture.dotenv).mode & 0o777).toBe(0o600);
    expect(readFileSync(fixture.ohJson, "utf8")).not.toContain("temporary-provisioner-secret");
    expect(console.out.join("")).toContain("Provision credential: configured");
    expect(console.out.join("")).not.toContain("temporary-provisioner-secret");
    expect(readdirSync(fixture.home)).toEqual([]);
  });

  it("shows config state without revealing the stored credential", async () => {
    const fixture = tempConfig();
    const setup = io({ env: fixture.env, cwd: fixture.root, askSecret: async () => "provisioner-secret-value" });
    await runCloud(["config", "--api-url", "https://cloud.example.test"], setup);

    const console = io({ env: fixture.env, cwd: fixture.root });
    expect(await runCloud(["config", "show"], console)).toBe(0);
    expect(console.out.join("")).toContain("API URL: https://cloud.example.test");
    expect(console.out.join("")).toContain("provi******************");
    expect(console.out.join("")).not.toContain("provisioner-secret-value");
    expect(readdirSync(fixture.home)).toEqual([]);
  });

  it("migrates a legacy user config once and leaves the old file in place", async () => {
    const fixture = tempConfig();
    seedLegacy(fixture, { apiUrl: "https://legacy.example.test", provisionKey: "legacy-key" });

    const console = io({ env: fixture.env, cwd: fixture.root });
    expect(await runCloud(["config", "show"], console)).toBe(0);

    expect(readOhConfig(fixture.ohJson).cloud).toEqual({ apiUrl: "https://legacy.example.test" });
    expect(readSecret(fixture.root, "OH_CLOUD_PROVISION_KEY")).toBe("legacy-key");
    expect(statSync(fixture.legacy).isFile()).toBe(true);
    const output = console.out.join("");
    expect(output).toContain(`Migrated OpenHarness Cloud settings out of ${fixture.legacy}`);
    expect(output).toContain("is no longer read");
    expect(output).toContain("API URL: https://legacy.example.test");
    expect(output).not.toContain("legacy-key");

    const second = io({ env: fixture.env, cwd: fixture.root });
    expect(await runCloud(["config", "show"], second)).toBe(0);
    expect(second.out.join("")).not.toContain("Migrated");
  });

  it("names the flag escape hatch when it runs outside an equipped repo", async () => {
    const fixture = tempConfig();
    const console = io({ env: fixture.env, cwd: fixture.home });
    expect(await runCloud(["nodes", "list"], console)).toBe(1);
    expect(console.err.join("")).toBe(
      "oh cloud: not an OpenHarness-equipped repo — run `oh update` first; " +
        "pass --api-url and --provision-key to run `oh cloud` outside a repo\n",
    );
  });

  it("runs outside an equipped repo when both flags are supplied", async () => {
    const fixture = tempConfig();
    let call: { url: string; init: RequestInit } | undefined;
    const console = io({
      env: fixture.env,
      cwd: fixture.home,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        call = { url: String(url), init: init ?? {} };
        return response({ ok: true });
      }) as typeof fetch,
    });
    expect(
      await runCloud(
        ["--api-url", "https://cloud.example.test", "--provision-key", "flag-key", "nodes", "list"],
        console,
      ),
    ).toBe(0);
    expect(call?.url).toBe("https://cloud.example.test/api/nodes");
    expect((call?.init.headers as Record<string, string>)["x-provision-key"]).toBe("flag-key");
    expect(readdirSync(fixture.home)).toEqual([]);
  });
});

describe("cloud API commands", () => {
  it("uses saved config to create a node and print one selected field", async () => {
    const fixture = tempConfig();
    await runCloud(
      ["config", "--api-url", "https://cloud.example.test", "--provision-key", "saved-key"],
      io({ env: fixture.env, cwd: fixture.root }),
    );

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const console = io({
      env: fixture.env,
      cwd: fixture.root,
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return response({ id: "node-1", status: "queued" }, 202);
      }) as typeof fetch,
    });

    expect(
      await runCloud(
        ["nodes", "create", "--name", "smoke-1", "--ssh-key-id", "key-1", "--output", "id"],
        console,
      ),
    ).toBe(0);
    expect(console.out.join("")).toBe("node-1\n");
    expect(calls[0]?.url).toBe("https://cloud.example.test/api/nodes");
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string>)["x-provision-key"]).toBe("saved-key");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ name: "smoke-1", sshKeyId: "key-1" });
  });

  it("maps every SSH-key and node lifecycle command to its API endpoint", async () => {
    const cases = [
      { args: ["nodes", "list"], method: "GET", path: "/api/nodes" },
      { args: ["nodes", "get", "node/1"], method: "GET", path: "/api/nodes/node%2F1" },
      { args: ["nodes", "events", "node-1"], method: "GET", path: "/api/nodes/node-1/events" },
      { args: ["nodes", "destroy", "node-1"], method: "DELETE", path: "/api/nodes/node-1" },
      { args: ["nodes", "restart", "node-1"], method: "POST", path: "/api/nodes/node-1/restart" },
      { args: ["nodes", "rebuild", "node-1"], method: "POST", path: "/api/nodes/node-1/rebuild" },
      { args: ["ssh-keys", "list"], method: "GET", path: "/api/ssh-keys" },
    ];

    for (const item of cases) {
      const fixture = tempConfig();
      let call: { url: string; init: RequestInit } | undefined;
      const console = io({
        env: { ...fixture.env, OH_CLOUD_PROVISION_KEY: "env-key" },
        cwd: fixture.root,
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          call = { url: String(url), init: init ?? {} };
          return response({ ok: true });
        }) as typeof fetch,
      });
      expect(await runCloud(item.args, console)).toBe(0);
      expect(call?.url).toBe(`http://127.0.0.1:3000${item.path}`);
      expect(call?.init.method).toBe(item.method);
    }
  });

  it("reads and trims an SSH public key file", async () => {
    const fixture = tempConfig();
    let body: unknown;
    const console = io({
      env: { ...fixture.env, PROVISION_KEY: "key" },
      cwd: fixture.root,
      readFile: async () => "ssh-ed25519 AAAA user@example\n",
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return response({ id: "key-1" }, 201);
      }) as typeof fetch,
    });

    expect(
      await runCloud(
        ["ssh-keys", "create", "--name", "laptop", "--public-key-file", "/tmp/key.pub"],
        console,
      ),
    ).toBe(0);
    expect(body).toEqual({ name: "laptop", publicKey: "ssh-ed25519 AAAA user@example" });
  });

  it("watches status changes and stops at the requested terminal status", async () => {
    const fixture = tempConfig();
    const nodes = [
      { id: "node-1", status: "queued" },
      { id: "node-1", status: "queued" },
      { id: "node-1", status: "creating_vm" },
      { id: "node-1", status: "running" },
    ];
    const sleeps: number[] = [];
    const console = io({
      env: { ...fixture.env, OH_PROVISION_KEY: "key" },
      cwd: fixture.root,
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      fetch: (async () => response(nodes.shift())) as typeof fetch,
    });

    expect(await runCloud(["nodes", "watch", "node-1", "--interval", "0.25"], console)).toBe(0);
    expect(console.out.map((text) => JSON.parse(text).status)).toEqual([
      "queued",
      "creating_vm",
      "running",
    ]);
    expect(sleeps).toEqual([250, 250, 250]);
  });

  it("reports structured API errors without throwing past the command boundary", async () => {
    const request = createCloudApiClient({
      apiUrl: "http://127.0.0.1:3000",
      provisionKey: "wrong",
      fetch: (async () => response({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)) as typeof fetch,
    });
    await expect(request("GET", "/api/nodes")).rejects.toMatchObject({
      status: 401,
      message: "API request failed with 401 (UNAUTHORIZED): Unauthorized",
    });

    const fixture = tempConfig();
    const console = io({
      env: { ...fixture.env, OH_PROVISION_KEY: "wrong" },
      cwd: fixture.root,
      fetch: (async () => response({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)) as typeof fetch,
    });
    expect(await runCloud(["nodes", "list"], console)).toBe(1);
    expect(console.err.join("")).toBe(
      "oh cloud: API request failed with 401 (UNAUTHORIZED): Unauthorized\n",
    );
  });

  it("summarizes HTML responses instead of dumping a full Next.js error page", async () => {
    const html = `<!DOCTYPE html><html><body>${"server-details-".repeat(100)}</body></html>`;
    const htmlResponse = (status: number): Response =>
      new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });

    const failedRequest = createCloudApiClient({
      apiUrl: "http://127.0.0.1:3000",
      provisionKey: "key",
      fetch: (async () => htmlResponse(500)) as typeof fetch,
    });
    const failure = await failedRequest("GET", "/api/nodes").catch((error: unknown) => error);
    expect(failure).toMatchObject({
      status: 500,
      message: expect.stringContaining("server returned text/html instead of JSON"),
    });
    expect((failure as Error).message.length).toBeLessThan(300);

    const successfulHtmlRequest = createCloudApiClient({
      apiUrl: "http://127.0.0.1:3000",
      provisionKey: "key",
      fetch: (async () => htmlResponse(200)) as typeof fetch,
    });
    await expect(successfulHtmlRequest("GET", "/api/nodes")).rejects.toMatchObject({
      status: 200,
      message: expect.stringContaining("expected JSON"),
    });
  });

  it("prints help without requiring a stored credential", async () => {
    const console = io({ env: {} });
    expect(await runCloud(["--help"], console)).toBe(0);
    expect(console.out.join("")).toContain("oh cloud config");
    expect(console.out.join("")).toContain("nodes create");
  });
});
