import { describe, it, expect } from "vitest";
import { buildProgram, HOST_ONLY_COMMANDS } from "../cli/index.js";

describe("Commander program structure", () => {
  it("declares the program name and description", () => {
    const program = buildProgram();
    expect(program.name()).toBe("oh");
    expect(program.description()).toContain("openharness");
  });

  it("registers all expected top-level commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    const expected = [
      "sandbox",
      "run",
      "stop",
      "clean",
      "shell",
      "list",
      "onboard",
      "worktree",
      "ports",
      "expose",
      "unexpose",
      "open",
      "harness",
    ];
    for (const cmd of expected) {
      expect(names).toContain(cmd);
    }
  });

  it("does not contain removed commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).not.toContain("build");
    expect(names).not.toContain("rebuild");
    expect(names).not.toContain("push");
    expect(names).not.toContain("install");
  });
});

describe("heartbeat subcommand group is gone", () => {
  it("does not register a top-level heartbeat command", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).not.toContain("heartbeat");
  });
});

describe("harness subcommand group", () => {
  it("registers add, list, remove placeholders", () => {
    const program = buildProgram();
    const harness = program.commands.find((c) => c.name() === "harness");
    expect(harness).toBeDefined();
    const subnames = harness!.commands.map((c) => c.name());
    expect(subnames.sort()).toEqual(["add", "list", "remove"]);
  });

  it("`harness add` requires a <spec> arg", () => {
    const program = buildProgram();
    const harness = program.commands.find((c) => c.name() === "harness");
    const add = harness!.commands.find((c) => c.name() === "add");
    expect(add).toBeDefined();
    const args = add!.registeredArguments;
    expect(args[0].name()).toBe("spec");
    expect(args[0].required).toBe(true);
  });

  it("`harness remove` requires a <name> arg", () => {
    const program = buildProgram();
    const harness = program.commands.find((c) => c.name() === "harness");
    const remove = harness!.commands.find((c) => c.name() === "remove");
    expect(remove).toBeDefined();
    expect(remove!.registeredArguments[0].required).toBe(true);
  });

  it("`harness list` takes no args", () => {
    const program = buildProgram();
    const harness = program.commands.find((c) => c.name() === "harness");
    const list = harness!.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
    expect(list!.registeredArguments.length).toBe(0);
  });
});

describe("optional-name commands", () => {
  const optional = ["sandbox", "run", "stop", "clean", "ports"];

  for (const cmd of optional) {
    it(`${cmd} accepts an optional [name]`, () => {
      const program = buildProgram();
      const c = program.commands.find((x) => x.name() === cmd);
      expect(c).toBeDefined();
      const arg = c!.registeredArguments[0];
      expect(arg).toBeDefined();
      expect(arg.required).toBe(false);
    });
  }
});

describe("required-name commands", () => {
  const required = ["shell", "worktree", "expose", "unexpose"];

  for (const cmd of required) {
    it(`${cmd} requires <name>`, () => {
      const program = buildProgram();
      const c = program.commands.find((x) => x.name() === cmd);
      expect(c).toBeDefined();
      const arg = c!.registeredArguments[0];
      expect(arg).toBeDefined();
      expect(arg.required).toBe(true);
    });
  }
});

describe("expose command", () => {
  it("requires <name> and <port>", () => {
    const program = buildProgram();
    const expose = program.commands.find((c) => c.name() === "expose");
    expect(expose!.registeredArguments).toHaveLength(2);
    expect(expose!.registeredArguments.every((a) => a.required)).toBe(true);
  });
});

describe("worktree command", () => {
  it("declares a --base-branch option", () => {
    const program = buildProgram();
    const worktree = program.commands.find((c) => c.name() === "worktree");
    const flags = worktree!.options.map((o) => o.long);
    expect(flags).toContain("--base-branch");
  });
});

describe("onboard command", () => {
  it("declares --force and --only flags", () => {
    const program = buildProgram();
    const onboard = program.commands.find((c) => c.name() === "onboard");
    const flags = onboard!.options.map((o) => o.long);
    expect(flags).toContain("--force");
    expect(flags).toContain("--only");
  });

  it("accepts an optional [target] arg", () => {
    const program = buildProgram();
    const onboard = program.commands.find((c) => c.name() === "onboard");
    const arg = onboard!.registeredArguments[0];
    expect(arg.name()).toBe("target");
    expect(arg.required).toBe(false);
  });
});

describe("--version", () => {
  it("returns the package.json version (no pi-coding-agent suffix)", async () => {
    const program = buildProgram();
    // Commander's exitOverride lets us catch the exit instead of process.exit().
    program.exitOverride();
    let captured = "";
    program.configureOutput({
      writeOut: (s) => {
        captured = s;
      },
    });
    try {
      await program.parseAsync(["node", "oh", "--version"]);
    } catch {
      // exitOverride throws CommanderError on --version
    }
    expect(captured.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(captured).not.toContain("pi");
  });
});

describe("HOST_ONLY_COMMANDS", () => {
  it("contains all container-lifecycle commands", () => {
    const expected = ["sandbox", "run", "stop", "clean", "shell", "list"];
    for (const cmd of expected) {
      expect(HOST_ONLY_COMMANDS.has(cmd)).toBe(true);
    }
  });

  it("does not include sandbox-side commands", () => {
    expect(HOST_ONLY_COMMANDS.has("onboard")).toBe(false);
    expect(HOST_ONLY_COMMANDS.has("expose")).toBe(false);
    expect(HOST_ONLY_COMMANDS.has("harness")).toBe(false);
  });
});
