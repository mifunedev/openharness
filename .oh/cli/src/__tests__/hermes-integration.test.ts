import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHarnessInstall } from "../commands/harness.js";
import type { LifecycleRunner } from "../lib/execution/runner.js";

vi.mock("node:os", async importOriginal => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, userInfo: () => ({ ...actual.userInfo(), username: "sandbox", uid: 1000 }) };
});

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function setup({ installed = false, installExit = 0, linkExit = 0, verify = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "oh-hermes-install-"));
  roots.push(root);
  mkdirSync(join(root, ".oh"));
  const calls: { cmd: string; args: string[]; env?: NodeJS.ProcessEnv }[] = [];
  let probes = 0;
  const run: LifecycleRunner = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], env: opts.env });
    let status = 0;
    if (args.includes("--hermes-only")) status = linkExit;
    else if (cmd === "hermes") status = (probes++ === 0 ? installed : verify) ? 0 : 1;
    else if (args.some(a => a.includes("install.sh"))) status = installExit;
    return { status, stdout: "", stderr: "" };
  };
  const out: string[] = [], err: string[] = [];
  return { root, calls, out, err, invoke: () => runHarnessInstall("hermes", {
    cwd: tmpdir(), run,
    env: { OH_EXECUTION_TARGET: "local", OH_PROJECT_ROOT: root },
  }, { stdout: s => out.push(s), stderr: s => err.push(s) }) };
}

describe("Hermes installation postconditions", () => {
  it("uses container paths rather than host checkout paths through Docker", async () => {
    const t = setup();
    const calls: string[][] = [];
    const run: LifecycleRunner = (cmd, args) => {
      calls.push([cmd, ...args]);
      return { status: 0, stdout: args[0] === "inspect" ? "running\n" : "", stderr: "" };
    };
    expect(await runHarnessInstall("hermes", {
      cwd: t.root, run, env: { OH_EXECUTION_TARGET: "docker-compose" },
    }, { stdout: () => {}, stderr: () => {} })).toBe(0);
    const link = calls.find(args => args.includes("--hermes-only"))!;
    expect(link).toContain("/home/sandbox/harness/.oh/scripts/link-providers.sh");
    expect(link).toContain("OH_PROJECT_ROOT=/home/sandbox/harness");
    expect(calls.flat().some(arg => arg.includes(t.root))).toBe(false);
  });

  it("anchors to the sandbox project outside a project cwd, and sets home before install", async () => {
    const t = setup();
    expect(await t.invoke()).toBe(0);
    const install = t.calls.find(c => c.args.some(a => a.includes("install.sh")))!;
    expect(install.env?.HERMES_HOME).toBe(join(t.root, ".hermes"));
    expect(install.env?.OH_PROJECT_ROOT).toBe(t.root);
    expect(t.calls.filter(c => c.args.includes("--hermes-only"))).toHaveLength(2);
    expect(t.calls.filter(c => c.cmd === "hermes")).toHaveLength(2);
    expect(t.calls[0].args).toContain(join(t.root, ".oh/scripts/link-providers.sh"));
    expect(t.out.join("")).toContain("installed —");
  });

  it("repairs an already-installed integration without invoking the installer", async () => {
    const t = setup({ installed: true });
    expect(await t.invoke()).toBe(0);
    expect(t.calls.filter(c => c.args.includes("--hermes-only"))).toHaveLength(1);
    expect(t.calls.some(c => c.args.some(a => a.includes("install.sh")))).toBe(false);
    expect(t.out.join("")).toContain("already installed");
  });

  it("reports an integration conflict before invoking the installer", async () => {
    const t = setup({ linkExit: 1 });
    expect(await t.invoke()).toBe(1);
    expect(t.calls).toHaveLength(1);
    expect(t.err.join("")).toContain("integration failed");
    expect(t.out.join("")).not.toContain("installed");
  });

  it("propagates installation failures without reporting success", async () => {
    const t = setup({ installExit: 7 });
    expect(await t.invoke()).toBe(7);
    expect(t.err.join("")).toContain("exit 7");
    expect(t.out.join("")).not.toContain("installed —");
  });

  it("rejects a successful installer whose executable does not verify", async () => {
    const t = setup({ verify: false });
    expect(await t.invoke()).toBe(1);
    expect(t.err.join("")).toContain("executable verification failed");
    expect(t.out.join("")).not.toContain("installed —");
  });
});
