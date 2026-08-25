import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeVerbs,
  runComposeVerb,
  type ComposeVerb,
} from "../commands/lifecycle.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

// cli.ts has a top-level side effect: main(process.argv.slice(2)).then(process.exit).
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
});

/** An equipped-repo fixture with the vendored compose script present. */
function makeRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "oh-compose-verb-"));
  cleanups.push(d);
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
  it("exposes exactly the four non-destructive verbs", () => {
    // `destroy` and a `config` equivalent are deliberately absent — see
    // .oh/docs/lifecycle-commands.md and the probe that keeps them documented.
    expect(composeVerbs()).toEqual(["stop", "restart", "logs", "ps"]);
  });

  it("does not expose destroy", () => {
    // `down -v` wipes the volumes holding provider auth. It needs a
    // confirmation policy, not a passthrough.
    expect(composeVerbs()).not.toContain("destroy" as ComposeVerb);
  });
});

describe("runComposeVerb", () => {
  it.each([
    ["stop", ["stop"]],
    ["restart", ["restart"]],
    ["ps", ["ps"]],
    ["logs", ["logs", "-f"]],
  ] as [ComposeVerb, string[]][])(
    "runs the vendored script with the %s argv the Makefile uses",
    (verb, expected) => {
      const root = makeRepo();
      const { calls, run } = makeRunner();
      expect(runComposeVerb(verb, { cwd: root, run })).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0].cmd).toBe("bash");
      expect(calls[0].args[0]).toBe(join(root, ".oh", "scripts", "docker-compose.sh"));
      expect(calls[0].args.slice(1)).toEqual(expected);
    },
  );

  it("never names docker — the script owns the engine argv", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    for (const verb of composeVerbs()) runComposeVerb(verb, { cwd: root, run });
    for (const c of calls) {
      expect(c.cmd).not.toBe("docker");
      expect(c.args.join(" ")).not.toContain("docker compose");
    }
  });

  it("forwards extra arguments after the verb", () => {
    const root = makeRepo();
    const { calls, run } = makeRunner();
    runComposeVerb("logs", { cwd: root, run }, ["--tail", "50"]);
    expect(calls[0].args.slice(1)).toEqual(["logs", "-f", "--tail", "50"]);
  });

  it("propagates the child's exit code", () => {
    const root = makeRepo();
    const { run } = makeRunner({ status: 3 });
    expect(runComposeVerb("ps", { cwd: root, run })).toBe(3);
  });

  it("reports a signal-killed child as failure, not success", () => {
    const root = makeRepo();
    const { run } = makeRunner({ status: null } as RunResult);
    expect(runComposeVerb("logs", { cwd: root, run })).toBe(1);
  });

  it("fails with the re-vendor hint when the script is missing", () => {
    const d = mkdtempSync(join(tmpdir(), "oh-compose-bare-"));
    cleanups.push(d);
    mkdirSync(join(d, ".oh", "scripts"), { recursive: true });
    const { run } = makeRunner();
    expect(() => runComposeVerb("ps", { cwd: d, run })).toThrow(/oh update/);
  });
});

describe("help", () => {
  it("lists every verb in the top-level usage block", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printOhHelp();
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    for (const verb of composeVerbs()) expect(text, verb).toContain(`oh ${verb}`);
  });

  it("names the make equivalent, so neither door looks like the only one", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    printComposeVerbHelp("stop");
    const text = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toContain("make stop");
    expect(text).toContain("lifecycle-commands.md");
  });
});

/**
 * The consolidation's real invariant: the two front doors must keep agreeing.
 * These read the repo's own Makefile, not a fixture.
 */
describe("parity with the Makefile", () => {
  const MAKEFILE = read("Makefile");

  it("has an oh verb for every compose target the Makefile exposes", () => {
    for (const verb of composeVerbs()) {
      expect(MAKEFILE, verb).toMatch(new RegExp(`^${verb}:`, "m"));
    }
  });

  it("keeps the Makefile free of direct `docker compose` calls", () => {
    // Both doors run .oh/scripts/docker-compose.sh; a raw call in a recipe
    // would fork overlay resolution and project naming.
    const recipes = MAKEFILE.split("\n").filter((l) => l.startsWith("\t"));
    for (const line of recipes) expect(line).not.toContain("docker compose");
  });

  it("leaves the pinned `make shell` line verbatim", () => {
    // execution-target-contract.sh C5 asserts this too. Restated here so that
    // changing it fails from both sides.
    expect(MAKEFILE).toContain("docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh");
  });

  it("documents each make-only target in the mapping doc", () => {
    const map = read(".oh/docs/lifecycle-commands.md");
    for (const target of ["destroy", "config", "shell"]) {
      expect(map, target).toContain(`make ${target}`);
    }
  });
});
