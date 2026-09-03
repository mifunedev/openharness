import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runConfigRepo, type RepoIO } from "../commands/config.js";
import type { LifecycleRunner, RunResult } from "../lib/execution/runner.js";

const cleanups: string[] = [];

afterEach(() => {
  while (cleanups.length > 0) {
    const dir = cleanups.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "oh-config-repo-"));
  cleanups.push(dir);
  mkdirSync(join(dir, ".oh"), { recursive: true });
  return dir;
}

interface Recorder {
  calls: string[][];
  run: LifecycleRunner;
}

function recorder(reply: (cmd: string, args: string[]) => RunResult = () => ({ status: 0 })): Recorder {
  const calls: string[][] = [];
  const run: LifecycleRunner = (cmd, args) => {
    calls.push([cmd, ...args]);
    return reply(cmd, args);
  };
  return { calls, run };
}

function scriptedIO(answers: string[]): { io: RepoIO; out: string[]; err: string[]; asked: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const queue = [...answers];
  const io: RepoIO = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    ask: async (q) => {
      asked.push(q);
      return queue.shift() ?? "";
    },
    isTTY: true,
  };
  return { io, out, err, asked };
}

const OK_PROBES = (cmd: string, args: string[]): RunResult => {
  if (cmd === "gh" && args[0] === "auth") return { status: 0 };
  if (cmd === "git" && args.join(" ") === "remote") return { status: 0, stdout: "origin\n" };
  if (cmd === "git" && args[1] === "get-url") {
    return { status: 0, stdout: "https://github.com/mifunedev/openharness.git\n" };
  }
  if (cmd === "gh" && args[0] === "repo" && args[1] === "view") return { status: 1 };
  return { status: 0 };
};

describe("oh config repo — opt-in gate", () => {
  it("declining runs zero gh and zero git commands", async () => {
    const t = freshRepo();
    const { calls, run } = recorder();
    const { io, out } = scriptedIO([""]);

    const code = await runConfigRepo({ cwd: t, run }, io);

    expect(code).toBe(0);
    expect(calls).toEqual([]);
    const joined = out.join("");
    expect(joined).toContain("nothing was created and no remote was touched");
    expect(joined).toContain("gh repo create");
    expect(joined).toContain("git remote rename origin openharness");
  });

  it("an explicit no also runs nothing", async () => {
    const t = freshRepo();
    const { calls, run } = recorder();
    const { io } = scriptedIO(["n"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls).toEqual([]);
  });

  it("refuses to run without a TTY", async () => {
    const t = freshRepo();
    const { calls, run } = recorder();
    const out: string[] = [];
    const err: string[] = [];
    let asked = 0;

    const code = await runConfigRepo(
      { cwd: t, run },
      {
        stdout: (s) => out.push(s),
        stderr: (s) => err.push(s),
        ask: async () => {
          asked++;
          return "y";
        },
        isTTY: false,
      },
    );

    expect(code).toBe(1);
    expect(asked).toBe(0);
    expect(calls).toEqual([]);
    expect(err.join("")).toContain("interactive terminal");
  });
});

describe("oh config repo — argument validation", () => {
  it("rejects an owner that starts with a dash", async () => {
    const t = freshRepo();
    const { calls, run } = recorder();
    const { io, err } = scriptedIO(["y", "--upload-pack=evil", "openharness", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(1);
    expect(calls).toEqual([]);
    expect(err.join("")).toContain('must not start with "-"');
  });

  it("rejects a repository name that starts with a dash", async () => {
    const t = freshRepo();
    const { calls, run } = recorder();
    const { io, err } = scriptedIO(["y", "ada", "-oops", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(1);
    expect(calls).toEqual([]);
    expect(err.join("")).toContain('must not start with "-"');
  });
});

describe("oh config repo — preflight fallbacks", () => {
  it("prints the manual commands when gh is not on PATH", async () => {
    const t = freshRepo();
    const { calls, run } = recorder(() => ({ status: null, error: { code: "ENOENT" } }));
    const { io, out } = scriptedIO(["y", "ada", "", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls).toEqual([["gh", "auth", "status"]]);
    const joined = out.join("");
    expect(joined).toContain("gh is not on PATH");
    expect(joined).toContain("gh repo create ada/openharness --private");
    expect(joined).toContain("git push -u origin HEAD");
  });

  it("prints the manual commands when gh is unauthenticated", async () => {
    const t = freshRepo();
    const { calls, run } = recorder(() => ({ status: 1 }));
    const { io, out } = scriptedIO(["y", "ada", "harness", "2"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls).toEqual([["gh", "auth", "status"]]);
    const joined = out.join("");
    expect(joined).toContain("gh is not authenticated");
    expect(joined).toContain("gh repo create ada/harness --public");
  });
});

describe("oh config repo — command sequence", () => {
  it("creates, renames origin to openharness, adds origin and pushes", async () => {
    const t = freshRepo();
    const { calls, run } = recorder(OK_PROBES);
    const { io, out } = scriptedIO(["y", "ada", "", ""]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls).toEqual([
      ["gh", "auth", "status"],
      ["git", "remote"],
      ["git", "remote", "get-url", "origin"],
      ["gh", "repo", "view", "ada/openharness"],
      ["gh", "repo", "create", "ada/openharness", "--private"],
      ["git", "remote", "rename", "origin", "openharness"],
      ["git", "remote", "add", "origin", "git@github.com:ada/openharness.git"],
      ["git", "push", "-u", "origin", "HEAD"],
    ]);
    const joined = out.join("");
    expect(joined).toContain("$ gh repo create ada/openharness --private");
    expect(joined).toContain('upstream kept as "openharness"');
  });

  it("stops at the first failure and prints the unrun remainder", async () => {
    const t = freshRepo();
    const { calls, run } = recorder((cmd, args) => {
      if (cmd === "git" && args[0] === "remote" && args[1] === "add") return { status: 128 };
      return OK_PROBES(cmd, args);
    });
    const { io, out, err } = scriptedIO(["y", "ada", "", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(1);
    expect(calls.some((c) => c[0] === "git" && c[1] === "push")).toBe(false);
    expect(err.join("")).toContain("git remote add origin git@github.com:ada/openharness.git failed");
    const joined = out.join("");
    expect(joined).toContain("Finish by hand");
    expect(joined).toContain("git push -u origin HEAD");
  });

  it("skips creation when the repo already exists", async () => {
    const t = freshRepo();
    const { calls, run } = recorder((cmd, args) => {
      if (cmd === "gh" && args[0] === "repo" && args[1] === "view") return { status: 0 };
      return OK_PROBES(cmd, args);
    });
    const { io, out } = scriptedIO(["y", "ada", "", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls.some((c) => c[1] === "create")).toBe(false);
    expect(out.join("")).toContain("already exists — skipping creation");
  });

  it("leaves the remotes alone when origin already points at the target repo", async () => {
    const t = freshRepo();
    const { calls, run } = recorder((cmd, args) => {
      if (cmd === "git" && args[1] === "get-url") {
        return { status: 0, stdout: "git@github.com:ada/openharness.git\n" };
      }
      return OK_PROBES(cmd, args);
    });
    const { io, out } = scriptedIO(["y", "ada", "", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(0);
    expect(calls.some((c) => c[1] === "remote" && c[2] === "rename")).toBe(false);
    expect(calls.some((c) => c[1] === "remote" && c[2] === "add")).toBe(false);
    expect(calls.some((c) => c[0] === "git" && c[1] === "push")).toBe(true);
    expect(out.join("")).toContain("origin already points at your repo");
  });

  it("changes nothing when origin points elsewhere and openharness is taken", async () => {
    const t = freshRepo();
    const { calls, run } = recorder((cmd, args) => {
      if (cmd === "git" && args.join(" ") === "remote") {
        return { status: 0, stdout: "openharness\norigin\n" };
      }
      if (cmd === "git" && args[1] === "get-url") {
        return { status: 0, stdout: "git@github.com:someone/else.git\n" };
      }
      return OK_PROBES(cmd, args);
    });
    const { io, err } = scriptedIO(["y", "ada", "", "1"]);

    expect(await runConfigRepo({ cwd: t, run }, io)).toBe(1);
    expect(calls.map((c) => c.join(" "))).toEqual([
      "gh auth status",
      "git remote",
      "git remote get-url origin",
    ]);
    expect(err.join("")).toContain("already exists");
  });
});
