import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeVerbs,
  runComposeVerb,
  type ComposeVerb,
} from "../commands/lifecycle.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

vi.mock("../cli.js", async (importOriginal) => {
  const original = process.exit;
  process.exit = (() => {}) as never;
  const mod = await importOriginal<typeof import("../cli.js")>();
  await new Promise((r) => setTimeout(r, 0));
  process.exit = original;
  return mod;
});

const { printComposeVerbHelp, printOhHelp } = await import("../cli.js");

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (p: string): string => readFileSync(join(REPO_ROOT, p), "utf8");

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length > 0) rmSync(cleanups.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const ENTRY_NAME = "oh-compose-verb-box";
const entry = { name: ENTRY_NAME };

function makeRepo(): string {
  const home = mkdtempSync(join(tmpdir(), "oh-compose-verb-"));
  cleanups.push(home);
  vi.stubEnv("OH_HOME", home);
  const d = join(home, "sandboxes", ENTRY_NAME);
  mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
  writeFileSync(join(d, ".oh", "scripts", "docker-compose.sh"), "#!/usr/bin/env bash\n");
  return d;
}

interface RecordedCall {
  cmd: string;
  args: string[];
}

function makeRunner(result: RunResult = { status: 0 }): {
  calls: RecordedCall[];
  run: LifecycleRunner;
} {
  const calls: RecordedCall[] = [];
  const run: LifecycleRunner = (cmd, args) => {
    calls.push({ cmd, args: [...args] });
    return result;
  };
  return { calls, run };
}

describe("compose verbs — the surface gap they close", () => {
  it("exposes every lifecycle verb the single front door has", () => {
    expect(composeVerbs()).toEqual(["stop", "restart", "logs", "ps", "destroy"]);
  });

  it("routes destroy through the same table, not a second implementation", () => {
    expect(composeVerbs()).toContain("destroy" as ComposeVerb);
  });
});

describe("runComposeVerb", () => {
  it.each([
    ["stop", ["stop"]],
    ["restart", ["restart"]],
    ["ps", ["ps"]],
    ["logs", ["logs", "-f"]],
    ["destroy", ["down", "-v"]],
  ] as [ComposeVerb, string[]][])(
    "runs the vendored script with the %s compose argv",
    (verb, expected) => {
      const root = makeRepo();
      const { calls, run } = makeRunner();
      expect(runComposeVerb(verb, { ...entry, run })).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].cmd).toBe("bash");
      expect(calls[0].args[0]).toBe(join(root, ".oh", "scripts", "docker-compose.sh"));
      expect(calls[0].args.slice(1)).toEqual(expected);
    },
  );

  it("never names docker — the script owns the engine argv", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    for (const verb of composeVerbs()) runComposeVerb(verb, { ...entry, run });
    for (const c of calls) {
      expect(c.cmd).not.toBe("docker");
      expect(c.args.join(" ")).not.toContain("docker compose");
    }
  });

  it("forwards extra arguments after the verb", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    runComposeVerb("logs", { ...entry, run }, ["--tail", "50"]);
    expect(calls[0].args.slice(1)).toEqual(["logs", "-f", "--tail", "50"]);
  });

  it("propagates the child's exit code", () => {
    const root = makeRepo();
    const { run } = makeRunner({ status: 3 });
    expect(runComposeVerb("ps", { ...entry, run })).toBe(3);
  });

  it("reports a signal-killed child as failure, not success", () => {
    const root = makeRepo();
    const { run } = makeRunner({ status: null } as RunResult);
    expect(runComposeVerb("logs", { ...entry, run })).toBe(1);
  });

  it("fails with the re-vendor hint when the entry carries no script", () => {
    const home = mkdtempSync(join(tmpdir(), "oh-compose-bare-"));
    cleanups.push(home);
    vi.stubEnv("OH_HOME", home);
    mkdirSync(join(home, "sandboxes", "bare", ".oh", "scripts"), { recursive: true });
    const { run } = makeRunner();
    expect(() => runComposeVerb("ps", { name: "bare", run })).toThrow(/oh update/);
  });
});

describe("help", () => {
  it("lists every verb in the top-level usage block", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printOhHelp();
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    for (const verb of composeVerbs()) expect(text, verb).toContain(`oh ${verb}`);
  });

  it("names no second door and links the verb reference", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printComposeVerbHelp("stop");
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(text).not.toMatch(/\bmake\b/);
    expect(text).toContain("oh stop");
    expect(text).toContain(
      "https://github.com/mifunedev/openharness/blob/main/docs/lifecycle-commands.md",
    );
  });
});

describe("oh is the only front door", () => {
  it("has no Makefile to mirror", () => {
    expect(existsSync(join(REPO_ROOT, "Makefile"))).toBe(false);
  });

  it("documents every compose verb in the lifecycle reference", () => {
    const map = read("docs/lifecycle-commands.md");
    for (const verb of composeVerbs()) expect(map, verb).toContain(`\`oh ${verb}`);
  });

  it("names no `make` lifecycle command in the lifecycle reference", () => {
    expect(read("docs/lifecycle-commands.md")).not.toMatch(
      /`make (sandbox|shell|stop|restart|logs|ps|destroy|config|gateway)/,
    );
  });
});
