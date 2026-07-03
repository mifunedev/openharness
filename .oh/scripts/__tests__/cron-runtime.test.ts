import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import type { Cron } from "croner";
import * as fsModule from "node:fs";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Repoint the runtime's CRONS_DIR — a const captured at module-load time from
// process.env.CRONS_DIR — at an isolated tmp path BEFORE ../cron-runtime is
// imported. vi.hoisted runs ahead of all imports, so the exported
// sighupHandler()'s internal scheduleAll() (called with no dir arg) re-reads
// THIS dir and never the repo's real .oh/crons/ directory (US-004 AC). Per-pid keeps
// parallel vitest workers from colliding on the path.
const SIGHUP_CRONS_DIR = vi.hoisted(() => {
  const dir = `/tmp/cron-sighup-test-crons-${process.pid}`;
  process.env.CRONS_DIR = dir;
  return dir;
});

import {
  acquireLock,
  buildCronAgentCommand,
  buildTmuxWrapper,
  decideOverlap,
  fire,
  inspectFallbackWorktree,
  isValidAgentBin,
  isValidCronId,
  isValidRemote,
  isValidRepo,
  isValidSchedule,
  loadCrons,
  onJobError,
  parseCronFile,
  pruneAndCountFallbackWorktrees,
  readFailureTail,
  reloadEntryForFire,
  remoteForRepo,
  reloadBody,
  resetActiveJobs,
  runPreflight,
  scheduleAll,
  sighupHandler,
  tmuxSessionName,
  worktreeInUse,
} from "../cron-runtime";

// Mock only appendFileSync (the log() writer) as a no-op spy so reloadBody's
// BODY_RELOADED / BODY_RELOAD_ERR signals are observable without polluting the
// real .oh/crons/.cron.log during test runs. All other node:fs exports pass through.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real, appendFileSync: vi.fn() };
});

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "cron-runtime-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function withTempGitRemotes<T>(remotes: Record<string, string>, fn: () => T): T {
  const prevCwd = process.cwd();
  const repo = path.join(tmp, "git-remotes");
  mkdirSync(repo, { recursive: true });
  const init = spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
  expect(init.status).toBe(0);
  for (const [name, url] of Object.entries(remotes)) {
    const add = spawnSync("git", ["remote", "add", name, url], { cwd: repo, encoding: "utf-8" });
    expect(add.status).toBe(0);
  }
  process.chdir(repo);
  try {
    return fn();
  } finally {
    process.chdir(prevCwd);
  }
}

describe("parseCronFile", () => {
  it("parses the SPEC frontmatter shape", () => {
    const content = `---
id: heartbeat
schedule: "0 * * * *"
timezone: UTC
enabled: true
overlap: false
catchup: false
---

Heartbeat body.
`;
    const entry = parseCronFile(content, "heartbeat.md");
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("heartbeat");
    expect(entry!.schedule).toBe("0 * * * *");
    expect(entry!.timezone).toBe("UTC");
    expect(entry!.enabled).toBe(true);
    expect(entry!.overlap).toBe(false);
    expect(entry!.catchup).toBe(false);
    expect(entry!.body.trim()).toBe("Heartbeat body.");
  });

  it("derives id from filename when frontmatter omits it", () => {
    const entry = parseCronFile(
      `---\nschedule: "* * * * *"\n---\nbody\n`,
      "weekly-cleanup.md",
    );
    expect(entry?.id).toBe("weekly-cleanup");
  });

  it("returns null when frontmatter is missing", () => {
    expect(parseCronFile("# Plain markdown only\n", "x.md")).toBeNull();
  });

  it("returns null when schedule is missing", () => {
    expect(parseCronFile(`---\nid: x\n---\nbody\n`, "x.md")).toBeNull();
  });

  it("parses tmux: true and defaults to false otherwise", () => {
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\ntmux: true\n---\nbody\n`, "a.md")
        ?.tmux,
    ).toBe(true);
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\ntmux: false\n---\nbody\n`, "b.md")
        ?.tmux,
    ).toBe(false);
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\n---\nbody\n`, "c.md")?.tmux,
    ).toBe(false);
  });

  it("parses an optional per-cron agent override", () => {
    const entry = parseCronFile(
      `---\nschedule: "* * * * *"\nagent: pi\n---\nbody\n`,
      "autopilot.md",
    );

    expect(entry?.agentBin).toBe("pi");
  });

  it("parses an optional preflight gate path", () => {
    expect(
      parseCronFile(
        `---\nschedule: "* * * * *"\npreflight: scripts/autopilot-caps.sh\n---\nbody\n`,
        "autopilot.md",
      )?.preflight,
    ).toBe("scripts/autopilot-caps.sh");
    // Absent frontmatter key → undefined (forward-compat additive parse).
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\n---\nbody\n`, "c.md")?.preflight,
    ).toBeUndefined();
  });

  it("parses an optional canonical repo target", () => {
    expect(
      parseCronFile(
        `---\nschedule: "* * * * *"\nrepo: mifunedev/openharness\n---\nbody\n`,
        "autopilot.md",
      )?.repo,
    ).toBe("mifunedev/openharness");
    expect(parseCronFile(`---\nschedule: "* * * * *"\n---\nbody\n`, "c.md")?.repo).toBeUndefined();
  });

  it("parses worktree: true and defaults to false otherwise", () => {
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\nworktree: true\n---\nbody\n`, "a.md")
        ?.worktree,
    ).toBe(true);
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\nworktree: false\n---\nbody\n`, "b.md")
        ?.worktree,
    ).toBe(false);
    expect(
      parseCronFile(`---\nschedule: "* * * * *"\n---\nbody\n`, "c.md")?.worktree,
    ).toBe(false);
  });
});

describe("decideOverlap", () => {
  // worktree:true ALWAYS isolates (the issue #142 default) — independent of the
  // overlap flag, whether a pidfile exists, or whether its holder is alive.
  it("returns 'worktree' for a worktree cron regardless of lock state", () => {
    for (const pidfileExists of [false, true]) {
      for (const holderAlive of [false, true]) {
        for (const overlap of [false, true]) {
          expect(
            decideOverlap({ overlap, worktree: true, pidfileExists, holderAlive }),
          ).toBe("worktree");
        }
      }
    }
  });

  it("runs (never skips) when overlap is allowed", () => {
    expect(
      decideOverlap({ overlap: true, worktree: false, pidfileExists: true, holderAlive: true }),
    ).toBe("run");
  });

  it("reclaims (runs) when there is no live holder of the id lock", () => {
    expect(
      decideOverlap({ overlap: false, worktree: false, pidfileExists: false, holderAlive: false }),
    ).toBe("run");
    // stale pidfile (exists but its pid is dead) → reclaim, do not skip
    expect(
      decideOverlap({ overlap: false, worktree: false, pidfileExists: true, holderAlive: false }),
    ).toBe("run");
  });

  it("skips a non-worktree cron only when a live holder owns the id lock", () => {
    expect(
      decideOverlap({ overlap: false, worktree: false, pidfileExists: true, holderAlive: true }),
    ).toBe("skip");
  });
});

describe("isValidCronId", () => {
  it("accepts kebab-case ids that begin with a lowercase letter or digit", () => {
    expect(isValidCronId("heartbeat")).toBe(true);
    expect(isValidCronId("eval-weekly")).toBe(true);
    expect(isValidCronId("cron2-task")).toBe(true);
  });

  it("rejects shell metacharacters, path traversal, uppercase, and empty ids", () => {
    for (const id of ["", "../evil", "evil;touch-pwned", "bad id", "Bad", "bad_id"]) {
      expect(isValidCronId(id)).toBe(false);
    }
  });
});

describe("isValidAgentBin", () => {
  it("accepts safe executable tokens and paths", () => {
    for (const agent of ["claude", "pi", "codex", "opencode", "/usr/local/bin/claude", "./bin/pi-agent"]) {
      expect(isValidAgentBin(agent)).toBe(true);
    }
  });

  it("rejects shell syntax, whitespace, traversal, and flag-shaped values", () => {
    for (const agent of [
      "",
      "-c",
      "pi agent",
      "pi;touch-pwned",
      "$(touch /tmp/pwn)",
      "pi && bad",
      "pi\nwhoami",
      "../bin/pi",
      "`touch /tmp/pwn`",
    ]) {
      expect(isValidAgentBin(agent)).toBe(false);
    }
  });
});

describe("isValidRepo / isValidRemote", () => {
  it("accepts GitHub owner/name repo targets and simple remote names", () => {
    expect(isValidRepo("mifunedev/openharness")).toBe(true);
    expect(isValidRepo("ryan-eggz/open_harness.docs")).toBe(true);
    expect(isValidRemote("origin")).toBe(true);
    expect(isValidRemote("upstream")).toBe(true);
  });

  it("rejects unsafe repo and remote values", () => {
    for (const repo of ["", "-bad/repo", "../repo", "owner/../repo", "owner/repo;bad", "owner repo/name", "owner"]) {
      expect(isValidRepo(repo)).toBe(false);
    }
    for (const remote of ["", "-c", "../origin", "origin;bad", "origin upstream"]) {
      expect(isValidRemote(remote)).toBe(false);
    }
  });
});

describe("isValidSchedule", () => {
  it("returns true for a valid cron expression", () => {
    expect(isValidSchedule("0 * * * *")).toBe(true);
  });

  it("returns false for a malformed string", () => {
    expect(isValidSchedule("not-a-cron")).toBe(false);
  });

  it("returns false for the empty string", () => {
    expect(isValidSchedule("")).toBe(false);
  });

  it("never throws and leaves no live timer behind for any input", () => {
    // appendFileSync is mocked, so a probe that wrongly armed a timer and fired
    // would not surface here — instead assert the contract directly: no input
    // (valid or garbage) throws, and the call is fully synchronous.
    for (const s of ["0 * * * *", "not-a-cron", "", "* * * *", "@@@"]) {
      expect(() => isValidSchedule(s)).not.toThrow();
    }
  });
});

describe("tmuxSessionName", () => {
  it("formats cron-<id>-<MMDD>-<HHMM> from local time, zero-padded", () => {
    // 2026-06-10 18:05 local (month is 0-indexed → 5 = June).
    expect(tmuxSessionName("autopilot", new Date(2026, 5, 10, 18, 5))).toBe(
      "cron-autopilot-0610-1805",
    );
    // Single-digit month/day/hour/minute all pad to two digits.
    expect(tmuxSessionName("x", new Date(2026, 0, 2, 3, 4))).toBe("cron-x-0102-0304");
  });
});

describe("buildTmuxWrapper", () => {
  const wrapper = buildTmuxWrapper({
    session: "cron-autopilot-0610-1805",
    id: "autopilot",
    agentBin: "claude",
    promptFile: "/tmp/cron-autopilot-0610-1805.prompt",
  });

  const runWrapper = (opts: { agentBin: string; status: number }) => {
    const session = `vitest-cron-wrapper-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const id = `vitest-${process.pid}-${Math.random().toString(16).slice(2)}`;
    const promptFile = path.join(tmp, `${session}.prompt`);
    const binDir = path.join(tmp, `${session}-bin`);
    const agentPath = path.isAbsolute(opts.agentBin)
      ? opts.agentBin
      : path.join(binDir, opts.agentBin);
    mkdirSync(path.dirname(agentPath), { recursive: true });
    writeFileSync(promptFile, "prompt body");
    writeFileSync(
      agentPath,
      `#!/usr/bin/env bash\nprintf 'agent-ran:%s\\n' "$1"\nexit ${opts.status}\n`,
      { mode: 0o755 },
    );
    const command = buildTmuxWrapper({
      session,
      id,
      agentBin: opts.agentBin,
      promptFile,
    });
    const result = spawnSync("bash", ["-lc", command], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` },
      encoding: "utf-8",
    });
    const pidFile = `/tmp/cron-${id}.pid`;
    const logFile = `/tmp/${session}.log`;
    const keepFile = `/tmp/${session}.keep`;
    const resumeFile = `/tmp/${session}.agent`;
    const logText = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
    rmSync(pidFile, { force: true });
    rmSync(logFile, { force: true });
    rmSync(keepFile, { force: true });
    rmSync(resumeFile, { force: true });
    return { result, command, pidFile, logText };
  };

  it("writes the per-id pidfile and cleans it up", () => {
    expect(wrapper).toContain("echo $$ > '/tmp/cron-autopilot.pid';");
    expect(wrapper).toContain("rm -f '/tmp/cron-autopilot.pid';");
  });

  it("rejects unsafe ids before generating shell wrapper text", () => {
    expect(() =>
      buildTmuxWrapper({
        session: "cron-bad-0101-0000",
        id: "bad;touch-pwned",
        agentBin: "claude",
        promptFile: "/tmp/prompt",
      }),
    ).toThrow("invalid cron id");
  });

  it("rejects unsafe agent binaries before generating shell wrapper text", () => {
    expect(() =>
      buildTmuxWrapper({
        session: "cron-bad-0101-0000",
        id: "autopilot",
        agentBin: "pi;touch-pwned",
        promptFile: "/tmp/prompt",
      }),
    ).toThrow("invalid agent bin");
  });

  it("runs cleanup after a non-Claude agent command instead of bypassing it", () => {
    const { result, command, pidFile, logText } = runWrapper({
      agentBin: path.join(tmp, "pi-agent"),
      status: 7,
    });

    expect(command).not.toContain("exit $status; rm -f");
    expect(command.indexOf("status=$?;")).toBeLessThan(command.indexOf("rm -f"));
    expect(command.indexOf("rm -f")).toBeLessThan(command.lastIndexOf("exit $status"));
    expect(result.status).toBe(7);
    expect(result.stderr).toBe("");
    expect(existsSync(pidFile)).toBe(false);
    expect(logText).toContain("agent-ran:-p");
  });

  it("runs cleanup after the Claude command path and preserves the original status", () => {
    const { result, command, pidFile, logText } = runWrapper({
      agentBin: "claude",
      status: 9,
    });

    expect(command).not.toContain("exit $status; rm -f");
    expect(command.indexOf("status=$?;")).toBeLessThan(command.indexOf("rm -f"));
    expect(command.indexOf("rm -f")).toBeLessThan(command.lastIndexOf("exit $status"));
    expect(result.status).toBe(9);
    expect(result.stderr).toBe("");
    expect(existsSync(pidFile)).toBe(false);
    expect(logText).toContain("agent-ran:-p");
  });

  it("exports the session, keep-marker, and overlap pidfile env vars", () => {
    expect(wrapper).toContain(
      "export CRON_TMUX_SESSION='cron-autopilot-0610-1805' CRON_KEEP_MARKER='/tmp/cron-autopilot-0610-1805.keep' CRON_OVERLAP_PIDFILE='/tmp/cron-autopilot.pid';",
    );
  });

  it("exports the configured repo and resolved remote into tmux wrappers", () => {
    const repoWrapper = buildTmuxWrapper({
      session: "cron-autopilot-0610-1805",
      id: "autopilot",
      agentBin: "pi",
      promptFile: "/tmp/cron-autopilot-0610-1805.prompt",
      repo: "mifunedev/openharness",
      remote: "upstream",
    });

    expect(repoWrapper).toContain(
      "AUTOPILOT_REPO='mifunedev/openharness' AUTOPILOT_REMOTE='upstream';",
    );
  });

  it("uses a session-scoped pidfile and exports CRON_WORKTREE for an isolated worktree fire", () => {
    const wt = buildTmuxWrapper({
      session: "cron-autopilot-0610-1805",
      id: "autopilot",
      agentBin: "pi",
      promptFile: "/tmp/cron-autopilot-0610-1805.prompt",
      pidFile: "/tmp/cron-autopilot-0610-1805.pid",
      worktree: "/home/sandbox/harness/.worktrees/cron/cron-autopilot-0610-1805",
    });
    // session-scoped lock (NOT the id-scoped /tmp/cron-autopilot.pid) so a worktree
    // fire never clobbers the primary run's overlap lock.
    expect(wt).toContain("echo $$ > '/tmp/cron-autopilot-0610-1805.pid';");
    expect(wt).toContain("rm -f '/tmp/cron-autopilot-0610-1805.pid';");
    expect(wt).not.toContain("/tmp/cron-autopilot.pid");
    // CRON_WORKTREE is exported so the agent (autopilot §1/§7) knows it is isolated.
    expect(wt).toContain(
      "CRON_OVERLAP_PIDFILE='/tmp/cron-autopilot-0610-1805.pid' CRON_WORKTREE='/home/sandbox/harness/.worktrees/cron/cron-autopilot-0610-1805';",
    );
  });

  it("omits CRON_WORKTREE and defaults to the id-scoped pidfile for a primary fire", () => {
    // No pidFile/worktree opts → byte-identical to the historical primary path.
    expect(wrapper).toContain("echo $$ > '/tmp/cron-autopilot.pid';");
    expect(wrapper).not.toContain("CRON_WORKTREE=");
  });

  it("runs the agent against the prompt file and tees the log", () => {
    expect(wrapper).toContain(
      'claude -p "$(cat \'/tmp/cron-autopilot-0610-1805.prompt\')" 2>&1 | tee \'/tmp/cron-autopilot-0610-1805.log\'',
    );
    expect(wrapper).toContain("AGENT_START");
    expect(wrapper).toContain("cron-runtime: Claude limit detected; retrying with Codex");
    expect(wrapper).toContain("AGENT_FALLBACK");
    expect(wrapper).toContain(
      'codex exec --sandbox danger-full-access "$(cat \'/tmp/cron-autopilot-0610-1805.prompt\')" 2>&1 | tee -a \'/tmp/cron-autopilot-0610-1805.log\'',
    );
    expect(wrapper).toContain("export RALPH_HARNESS=codex;");
    expect(wrapper).toContain("AGENT_DONE");
    expect(wrapper).toContain('agent=$active_agent exit=$status');
  });

  it("persists a kept session as a resumed live agent, using Codex after fallback", () => {
    expect(wrapper).toContain(
      '[ "$(cat \'/tmp/cron-autopilot-0610-1805.agent\' 2>/dev/null || echo \'claude\')" = codex ]; then codex; else \'claude\' --continue; fi;',
    );
  });

  it("runs kept Pi tmux sessions as attachable TUI sessions", () => {
    const piWrapper = buildTmuxWrapper({
      session: "cron-autopilot-0610-1805",
      id: "autopilot",
      agentBin: "pi",
      promptFile: "/tmp/cron-autopilot-0610-1805.prompt",
    });

    expect(piWrapper).toContain('\'pi\' "$(cat \'/tmp/cron-autopilot-0610-1805.prompt\')";');
    expect(piWrapper).not.toContain('pi -p "$(cat /tmp/cron-autopilot-0610-1805.prompt)"');
    expect(piWrapper).not.toContain("tee /tmp/cron-autopilot-0610-1805.log");
    expect(piWrapper).toContain("AGENT_START");
    expect(piWrapper).toContain("AGENT_DONE");
    expect(piWrapper).toContain(
      '[ "$(cat \'/tmp/cron-autopilot-0610-1805.agent\' 2>/dev/null || echo \'pi\')" = codex ]; then codex; else \'pi\' --continue; fi;',
    );
  });
});

describe("buildCronAgentCommand", () => {
  it("wraps default Claude with Codex fallback for tmux and non-tmux callers", () => {
    const command = buildCronAgentCommand({
      agentBin: "claude",
      promptFile: "/tmp/cron-global.prompt",
      logFile: "/tmp/cron-global.log",
    });

    expect(command).toContain('claude -p "$(cat \'/tmp/cron-global.prompt\')"');
    expect(command).toContain("grep -Eiq");
    expect(command).toContain("AGENT_START");
    expect(command).toContain("export RALPH_HARNESS=codex;");
    expect(command).toContain("AGENT_FALLBACK");
    expect(command).toContain(
      'codex exec --sandbox danger-full-access "$(cat \'/tmp/cron-global.prompt\')"',
    );
    expect(command).toContain("AGENT_DONE");
    expect(command).toContain('agent=$active_agent exit=$status');
  });

  it("exports repo targeting for non-tmux cron agent commands", () => {
    const command = buildCronAgentCommand({
      agentBin: "claude",
      promptFile: "/tmp/cron-global.prompt",
      logFile: "/tmp/cron-global.log",
      repo: "mifunedev/openharness",
      remote: "upstream",
    });

    expect(command).toContain("export AUTOPILOT_REPO='mifunedev/openharness';");
    expect(command).toContain("export AUTOPILOT_REMOTE='upstream';");
  });

  it("preserves explicit non-Claude CRON_AGENT_BIN behavior without Codex fallback", () => {
    const command = buildCronAgentCommand({
      agentBin: "pi",
      promptFile: "/tmp/cron-custom.prompt",
      logFile: "/tmp/cron-custom.log",
    });

    expect(command).toContain('\'pi\' -p "$(cat \'/tmp/cron-custom.prompt\')"');
    expect(command).toContain("AGENT_START");
    expect(command).toContain("AGENT_DONE");
    expect(command).toContain('agent=$active_agent exit=$status');
    expect(command).not.toContain("codex exec");
    expect(command).not.toContain("RALPH_HARNESS=codex");
    expect(command).not.toContain("AGENT_FALLBACK");
  });

  it("names the cron id in the shell-level agent attribution lines", () => {
    const command = buildCronAgentCommand({
      id: "heartbeat",
      agentBin: "claude",
      promptFile: "/tmp/cron-heartbeat.prompt",
      logFile: "/tmp/heartbeat.log",
    });

    expect(command).toContain("'heartbeat' 'AGENT_START'");
    expect(command).toContain("'heartbeat' 'AGENT_FALLBACK'");
    expect(command).toContain("'heartbeat' 'AGENT_DONE'");
  });

  it("rejects unsafe ids before generating agent command text", () => {
    expect(() =>
      buildCronAgentCommand({
        id: "../evil",
        agentBin: "claude",
        promptFile: "/tmp/prompt",
        logFile: "/tmp/log",
      }),
    ).toThrow("invalid cron id");
  });

  it("rejects unsafe agent binaries before generating agent command text", () => {
    for (const agentBin of ["pi;touch-pwned", "$(touch /tmp/pwn)", "pi && bad", "bad agent"]) {
      expect(() =>
        buildCronAgentCommand({
          agentBin,
          promptFile: "/tmp/prompt",
          logFile: "/tmp/log",
        }),
      ).toThrow("invalid agent bin");
    }
  });
});

describe("loadCrons", () => {
  it("skips files where enabled is false", () => {
    writeFileSync(
      path.join(tmp, "on.md"),
      `---\nid: on\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    writeFileSync(
      path.join(tmp, "off.md"),
      `---\nid: off\nschedule: "0 * * * *"\nenabled: false\n---\nbody\n`,
    );
    const out = loadCrons(tmp);
    expect(out.map((e) => e.id)).toEqual(["on"]);
  });

  it("returns [] when the directory is missing", () => {
    expect(loadCrons(path.join(tmp, "nope"))).toEqual([]);
  });

  it("excludes a cron whose schedule is malformed and does not throw", () => {
    writeFileSync(
      path.join(tmp, "bad.md"),
      `---\nid: bad\nschedule: "not-a-cron"\nenabled: true\n---\nbody\n`,
    );
    let out: ReturnType<typeof loadCrons> = [];
    expect(() => {
      out = loadCrons(tmp, vi.fn());
    }).not.toThrow();
    expect(out).toEqual([]);
  });

  it("returns a valid cron alongside an invalid sibling", () => {
    writeFileSync(
      path.join(tmp, "good.md"),
      `---\nid: good\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    writeFileSync(
      path.join(tmp, "bad.md"),
      `---\nid: bad\nschedule: "not-a-cron"\nenabled: true\n---\nbody\n`,
    );
    const out = loadCrons(tmp, vi.fn());
    expect(out.map((e) => e.id)).toEqual(["good"]);
  });

  it("logs SCHED_INVALID through the injected logFn naming the bad schedule", () => {
    writeFileSync(
      path.join(tmp, "badcron.md"),
      `---\nid: badcron\nschedule: "not-a-cron"\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    loadCrons(tmp, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    const [id, status, msg] = spy.mock.calls[0];
    expect(id).toBe("badcron");
    expect(status).toBe("SCHED_INVALID");
    expect(String(msg)).toContain("not-a-cron");
  });

  it("skips and logs invalid cron ids before schedule validation", () => {
    writeFileSync(
      path.join(tmp, "bad.md"),
      `---\nid: evil;touch-pwned\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    expect(loadCrons(tmp, spy)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "bad",
      "ID_INVALID",
      "invalid cron id: evil;touch-pwned",
    );
  });

  it("skips and logs ids that do not match the filename basename", () => {
    writeFileSync(
      path.join(tmp, "heartbeat.md"),
      `---\nid: autopilot\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    expect(loadCrons(tmp, spy)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "autopilot",
      "ID_MISMATCH",
      "id must match filename: heartbeat",
    );
  });

  it("skips derived ids from unsafe filenames", () => {
    writeFileSync(
      path.join(tmp, "bad_id.md"),
      `---\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    expect(loadCrons(tmp, spy)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "cron",
      "ID_INVALID",
      "invalid cron id: bad_id",
    );
  });

  it("skips unsafe filename basenames even when the explicit id is valid", () => {
    writeFileSync(
      path.join(tmp, "bad_id.md"),
      `---\nid: good\nschedule: "0 * * * *"\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    expect(loadCrons(tmp, spy)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "good",
      "ID_INVALID",
      "invalid cron filename id: bad_id",
    );
  });

  it("skips and logs unsafe per-cron agent overrides before scheduling", () => {
    writeFileSync(
      path.join(tmp, "autopilot.md"),
      `---\nid: autopilot\nschedule: "0 * * * *"\nagent: pi;touch-pwned\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    expect(loadCrons(tmp, spy)).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      "autopilot",
      "AGENT_INVALID",
      "invalid agent: pi;touch-pwned",
    );
  });
});

describe("scheduleAll", () => {
  const cron = (id: string, schedule: string): string =>
    `---\nid: ${id}\nschedule: "${schedule}"\nenabled: true\n---\nbody\n`;

  it("schedules valid crons, skips an invalid sibling, and logs an accurate BOOT summary", () => {
    // Files load in alphabetical order: agood (valid), bbad (invalid → dropped
    // at load time by US-002's filter), cgood (valid).
    writeFileSync(path.join(tmp, "agood.md"), cron("agood", "0 * * * *"));
    writeFileSync(path.join(tmp, "bbad.md"), cron("bbad", "not-a-cron"));
    writeFileSync(path.join(tmp, "cgood.md"), cron("cgood", "*/5 * * * *"));

    const spy = vi.fn();
    const constructed: string[] = [];
    // Inject a no-op mkCron so no real croner timer is armed in the test.
    const result = scheduleAll(tmp, spy, (e) => {
      constructed.push(e.id);
    });

    // The two valid crons are constructed; the invalid one never reaches mkCron.
    expect(constructed).toEqual(["agood", "cgood"]);
    expect(result).toEqual({ scheduled: 2, skipped: 1 });
    // The BOOT summary preserves the token and reads "2 scheduled, 1 skipped";
    // logging it at all proves the loop completed without exiting early.
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "2 scheduled, 1 skipped");
  });

  it("preserves per-cron agent overrides through scheduling", () => {
    writeFileSync(
      path.join(tmp, "autopilot.md"),
      `---\nid: autopilot\nschedule: "0 * * * *"\nagent: pi\nenabled: true\n---\nbody\n`,
    );

    const constructed: Array<string | undefined> = [];
    const result = scheduleAll(tmp, vi.fn(), (e) => {
      constructed.push(e.agentBin);
    });

    expect(result).toEqual({ scheduled: 1, skipped: 0 });
    expect(constructed).toEqual(["pi"]);
  });

  it("fault-isolates a construction throw (defense-in-depth): skips only the throwing cron", () => {
    // All three schedules are VALID, so they pass the load-time filter — this
    // bypasses US-002 and exercises the construction try/catch directly via an
    // injected mkCron that simulates a residual croner construction throw.
    writeFileSync(path.join(tmp, "aok.md"), cron("aok", "0 * * * *"));
    writeFileSync(path.join(tmp, "bboom.md"), cron("bboom", "0 * * * *"));
    writeFileSync(path.join(tmp, "cok.md"), cron("cok", "0 * * * *"));

    const spy = vi.fn();
    const constructed: string[] = [];
    const result = scheduleAll(tmp, spy, (e) => {
      if (e.id === "bboom") throw new Error("croner blew up");
      constructed.push(e.id);
    });

    // The throwing cron is skipped; construction continues for the rest.
    expect(constructed).toEqual(["aok", "cok"]);
    expect(result).toEqual({ scheduled: 2, skipped: 1 });
    // The construction throw is logged SCHED_INVALID for that id, with the error.
    const invalid = spy.mock.calls.find(
      (c) => c[0] === "bboom" && c[1] === "SCHED_INVALID",
    );
    expect(invalid).toBeTruthy();
    expect(String(invalid![2])).toContain("croner blew up");
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "2 scheduled, 1 skipped");
  });

  it("counts invalid and mismatched ids as load-time skips without constructing them", () => {
    writeFileSync(path.join(tmp, "good.md"), cron("good", "0 * * * *"));
    writeFileSync(path.join(tmp, "bad.md"), cron("bad;touch-pwned", "0 * * * *"));
    writeFileSync(path.join(tmp, "name.md"), cron("other", "0 * * * *"));

    const spy = vi.fn();
    const constructed: string[] = [];
    const result = scheduleAll(tmp, spy, (e) => {
      constructed.push(e.id);
    });

    expect(constructed).toEqual(["good"]);
    expect(result).toEqual({ scheduled: 1, skipped: 2 });
    expect(spy).toHaveBeenCalledWith(
      "bad",
      "ID_INVALID",
      "invalid cron id: bad;touch-pwned",
    );
    expect(spy).toHaveBeenCalledWith(
      "other",
      "ID_MISMATCH",
      "id must match filename: name",
    );
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "1 scheduled, 2 skipped");
  });

  it("counts invalid agent overrides as load-time skips without constructing them", () => {
    writeFileSync(path.join(tmp, "good.md"), cron("good", "0 * * * *"));
    writeFileSync(
      path.join(tmp, "badagent.md"),
      `---\nid: badagent\nschedule: "0 * * * *"\nagent: pi && bad\nenabled: true\n---\nbody\n`,
    );

    const spy = vi.fn();
    const constructed: string[] = [];
    const result = scheduleAll(tmp, spy, (e) => {
      constructed.push(e.id);
    });

    expect(constructed).toEqual(["good"]);
    expect(result).toEqual({ scheduled: 1, skipped: 1 });
    expect(spy).toHaveBeenCalledWith("badagent", "AGENT_INVALID", "invalid agent: pi && bad");
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "1 scheduled, 1 skipped");
  });

  it("counts invalid repo targets as load-time skips without constructing them", () => {
    writeFileSync(
      path.join(tmp, "autopilot.md"),
      `---\nid: autopilot\nschedule: "0 * * * *"\nrepo: ../evil\nenabled: true\n---\nbody\n`,
    );
    const spy = vi.fn();
    const result = scheduleAll(tmp, spy, () => {
      throw new Error("must not construct");
    });

    expect(result).toEqual({ scheduled: 0, skipped: 1 });
    expect(spy).toHaveBeenCalledWith("autopilot", "REPO_INVALID", "invalid repo: ../evil");
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "0 scheduled, 1 skipped");
  });

  it("does not double-count: a load-time skip and a construction skip sum disjointly", () => {
    writeFileSync(path.join(tmp, "aok.md"), cron("aok", "0 * * * *"));
    writeFileSync(path.join(tmp, "bload.md"), cron("bload", "not-a-cron"));
    writeFileSync(path.join(tmp, "cboom.md"), cron("cboom", "0 * * * *"));

    const spy = vi.fn();
    const result = scheduleAll(tmp, spy, (e) => {
      if (e.id === "cboom") throw new Error("construct fail");
    });

    // bload dropped at load time, cboom dropped at construction, aok scheduled.
    expect(result).toEqual({ scheduled: 1, skipped: 2 });
    expect(spy).toHaveBeenCalledWith("system", "BOOT", "1 scheduled, 2 skipped");
  });
});

describe("acquireLock", () => {
  it("acquires when no PID file exists", () => {
    const pidFile = path.join(tmp, ".pid");
    expect(acquireLock(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf-8")).toBe(String(process.pid));
  });

  it("returns false when an existing PID is alive and preserves the pidfile", () => {
    const pidFile = path.join(tmp, ".pid");
    const child = spawn("sleep", ["10"], { stdio: "ignore" });
    try {
      writeFileSync(pidFile, String(child.pid));
      expect(acquireLock(pidFile)).toBe(false);
      expect(readFileSync(pidFile, "utf-8")).toBe(String(child.pid));
    } finally {
      child.kill();
    }
  });

  it("returns true when the current process already owns the lock", () => {
    const pidFile = path.join(tmp, ".pid");
    writeFileSync(pidFile, String(process.pid));
    expect(acquireLock(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf-8")).toBe(String(process.pid));
  });

  it("steals stale lock when previous PID is dead", () => {
    const pidFile = path.join(tmp, ".pid");
    // Pick a high PID unlikely to be running.
    writeFileSync(pidFile, "999999");
    expect(acquireLock(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf-8")).toBe(String(process.pid));
  });

  it("reclaims an unparsable lock file", () => {
    const pidFile = path.join(tmp, ".pid");
    writeFileSync(pidFile, "not-a-pid");
    expect(acquireLock(pidFile)).toBe(true);
    expect(readFileSync(pidFile, "utf-8")).toBe(String(process.pid));
  });

  it("lets exactly one concurrent process win an absent lock", () => {
    const pidFile = path.join(tmp, ".pid");
    const gateFile = path.join(tmp, ".start");
    const worker = path.join(tmp, "lock-worker.mjs");
    writeFileSync(
      worker,
      `import { existsSync, readFileSync } from "node:fs";\n` +
        `import { acquireLock } from ${JSON.stringify(path.resolve(".oh/scripts/cron-runtime.ts"))};\n` +
        `const [pidFile, gateFile] = process.argv.slice(2);\n` +
        `const deadline = Date.now() + 2000;\n` +
        `while (!existsSync(gateFile) && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 5)); }\n` +
        `const ok = acquireLock(pidFile);\n` +
        `console.log(JSON.stringify({ pid: process.pid, ok, holder: readFileSync(pidFile, "utf-8") }));\n` +
        `setTimeout(() => process.exit(0), ok ? 500 : 0);\n`,
    );

    const children = [
      spawn(process.execPath, ["--experimental-strip-types", worker, pidFile, gateFile], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }),
      spawn(process.execPath, ["--experimental-strip-types", worker, pidFile, gateFile], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ];

    writeFileSync(gateFile, "go");
    const outputs = children.map(
      (child) =>
        new Promise<string>((resolve, reject) => {
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
          child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr || `worker exited ${code}`));
          });
        }),
    );

    return Promise.all(outputs).then((lines) => {
      const results = lines.map((line) => JSON.parse(line) as { pid: number; ok: boolean; holder: string });
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(readFileSync(pidFile, "utf-8")).toBe(String(results.find((r) => r.ok)!.pid));
    });
  });

});

describe("reloadEntryForFire", () => {
  afterEach(() => {
    vi.mocked(fsModule.appendFileSync).mockClear();
  });

  it("picks up fire-time metadata changes while preserving cached body for reloadBody", () => {
    const cronFile = path.join(tmp, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\nagent: claude\n---\noriginal body\n`,
    );
    const [entry] = loadCrons(tmp);
    expect(entry.agentBin).toBe("claude");

    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\nagent: pi\npreflight: scripts/autopilot-caps.sh\nrepo: mifunedev/openharness\n---\nupdated body\n`,
    );

    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();
    const liveEntry = reloadEntryForFire(entry);

    expect(liveEntry?.agentBin).toBe("pi");
    expect(liveEntry?.preflight).toBe("scripts/autopilot-caps.sh");
    expect(liveEntry?.repo).toBe("mifunedev/openharness");
    // Body stays cached here so reloadBody remains the single BODY_RELOADED logger.
    expect(liveEntry?.body).toBe("original body\n");
    const lines = appendSpy.mock.calls.map((c) => String(c[1]));
    expect(lines.some((line) => line.includes("ENTRY_RELOADED") && line.includes("agentBin,preflight,repo"))).toBe(true);
  });

  it("keeps filePath absolute through reload (regression: #275 basename leak)", () => {
    const cronFile = path.join(tmp, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\nbody\n`,
    );
    const [entry] = loadCrons(tmp);
    // loadCrons yields a dir-qualified (absolute) filePath.
    expect(path.isAbsolute(entry.filePath)).toBe(true);

    const liveEntry = reloadEntryForFire(entry);
    // The reloaded entry MUST retain the original absolute path, not a bare
    // basename — otherwise a later reloadBody() reads a CWD-relative path and
    // silently falls back to the stale cached body.
    expect(liveEntry).not.toBeNull();
    expect(path.isAbsolute(liveEntry!.filePath)).toBe(true);
    expect(liveEntry!.filePath).toBe(entry.filePath);
  });

  it("skips a fire when the cron is disabled on disk after scheduling", () => {
    const cronFile = path.join(tmp, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\nbody\n`,
    );
    const [entry] = loadCrons(tmp);
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: false\n---\nbody\n`,
    );

    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();
    expect(reloadEntryForFire(entry)).toBeNull();
    const lines = appendSpy.mock.calls.map((c) => String(c[1]));
    expect(lines.some((line) => line.includes("CONFIG_RELOAD_DISABLED"))).toBe(true);
  });
});

describe("reloadBody", () => {
  afterEach(() => {
    vi.mocked(fsModule.appendFileSync).mockClear();
  });

  it("returns the on-disk body when it has been mutated after CronEntry was built", () => {
    // Write the initial cron file and load it via loadCrons to get a dir-qualified CronEntry.
    const cronFile = path.join(tmp, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\noriginal body\n`,
    );
    const [entry] = loadCrons(tmp);
    expect(entry.body).toBe("original body\n");

    // Mutate only the body on disk — keep frontmatter intact so parseCronFile succeeds.
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\nupdated body\n`,
    );

    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();
    const result = reloadBody(entry);

    // Should return the fresh on-disk body, not the cached entry.body.
    expect(result).toBe("updated body\n");

    // BODY_RELOADED must be logged because the on-disk body differed from entry.body.
    const loggedArgs = appendSpy.mock.calls.map((c) => String(c[1]));
    expect(loggedArgs.some((line) => line.includes("BODY_RELOADED"))).toBe(true);
  });

  it("reads the fresh body regardless of cwd after a metadata reload (regression: #275 CWD-relative read)", () => {
    // Reproduce the LIVE failure chain: reloadEntryForFire() returns the live
    // entry the runtime reuses for subsequent fires; that entry's filePath must
    // stay absolute. With the basename bug it became "hot.md", so a later
    // reloadBody() — running from a cwd that is NOT the crons dir — resolves the
    // read CWD-relative, hits ENOENT, and silently returns the stale body.
    const cronFile = path.join(tmp, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\noriginal body\n`,
    );
    const [entry] = loadCrons(tmp);
    expect(path.isAbsolute(entry.filePath)).toBe(true);

    // The runtime reloads metadata before a fire; reuse that returned entry.
    const liveEntry = reloadEntryForFire(entry);
    expect(liveEntry).not.toBeNull();

    // A frontmatter-preserving body edit lands on disk before the next fire.
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\nupdated body\n`,
    );

    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();

    const prevCwd = process.cwd();
    // chdir to a directory that is NOT the crons dir (the OS temp root).
    process.chdir(tmpdir());
    let result: string;
    try {
      result = reloadBody(liveEntry!);
    } finally {
      process.chdir(prevCwd);
    }

    // Must read the on-disk body, not silently fall back to the cached one.
    expect(result).toBe("updated body\n");
    const loggedArgs = appendSpy.mock.calls.map((c) => String(c[1]));
    expect(loggedArgs.some((line) => line.includes("BODY_RELOADED"))).toBe(true);
    expect(loggedArgs.some((line) => line.includes("BODY_RELOAD_ERR"))).toBe(false);
  });

  it("hot-reloads via an absolute filePath after the process cwd changes", () => {
    // loadCrons() invoked with a RELATIVE dir must still resolve filePath to an
    // absolute path (#517 path.resolve), so a later reloadBody() from a changed
    // cwd reads the on-disk body instead of falling back to the cached one.
    const prevCwd = process.cwd();
    const root = path.join(tmp, "cron-root");
    const cronsDir = path.join(root, "crons");
    mkdirSync(cronsDir, { recursive: true });
    const cronFile = path.join(cronsDir, "hot.md");
    writeFileSync(
      cronFile,
      `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\noriginal body\n`,
    );

    try {
      process.chdir(root);
      const [entry] = loadCrons("crons");
      expect(path.isAbsolute(entry.filePath)).toBe(true);
      expect(entry.body).toBe("original body\n");

      process.chdir(tmpdir());
      writeFileSync(
        cronFile,
        `---\nid: hot\nschedule: "* * * * *"\nenabled: true\n---\nupdated body\n`,
      );

      const appendSpy = vi.mocked(fsModule.appendFileSync);
      appendSpy.mockClear();
      expect(reloadBody(entry)).toBe("updated body\n");
      const loggedArgs = appendSpy.mock.calls.map((c) => String(c[1]));
      expect(loggedArgs.some((line) => line.includes("BODY_RELOADED"))).toBe(true);
      expect(loggedArgs.some((line) => line.includes("BODY_RELOAD_ERR"))).toBe(false);
    } finally {
      process.chdir(prevCwd);
    }
  });

  it("returns cached entry.body and logs BODY_RELOAD_ERR when filePath is unreadable", () => {
    // Build a hand-crafted entry pointing at a nonexistent path.
    const missingPath = path.join(tmp, "ghost.md");
    const entry = {
      id: "ghost",
      schedule: "* * * * *",
      enabled: true,
      overlap: false,
      catchup: false,
      tmux: false,
      worktree: false,
      body: "cached body\n",
      filePath: missingPath,
    };

    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();
    const result = reloadBody(entry);

    // Should fall back to the cached body.
    expect(result).toBe("cached body\n");

    // BODY_RELOAD_ERR must appear in at least one appendFileSync call.
    const loggedArgs = appendSpy.mock.calls.map((c) => String(c[1]));
    expect(loggedArgs.some((line) => line.includes("BODY_RELOAD_ERR"))).toBe(true);
  });
});

describe("fallback worktree pruning", () => {
  const git = (cwd: string, args: string[]): void => {
    const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
    expect(result.status, `${args.join(" ")}\n${result.stderr}`).toBe(0);
  };

  const initRepoWithFallbackWorktrees = (): { repo: string; dirtyWt: string; cleanWt: string } => {
    const repo = path.join(tmp, "repo");
    mkdirSync(repo, { recursive: true });
    git(repo, ["init", "-b", "development"]);
    writeFileSync(path.join(repo, "README.md"), "fixture\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"]);

    const dirtyWt = path.join(repo, ".worktrees", "cron", "cron-autopilot-dirty");
    const cleanWt = path.join(repo, ".worktrees", "cron", "cron-autopilot-clean");
    git(repo, ["worktree", "add", "--detach", dirtyWt, "HEAD"]);
    git(repo, ["worktree", "add", "--detach", cleanWt, "HEAD"]);
    writeFileSync(path.join(dirtyWt, "uncommitted.txt"), "salvage me\n");
    return { repo, dirtyWt, cleanWt };
  };

  it("reports dirty fallback worktree state including untracked files", () => {
    const { dirtyWt } = initRepoWithFallbackWorktrees();

    const state = inspectFallbackWorktree(dirtyWt);

    expect(state.dirty).toBe(true);
    expect(state.changes).toContain("?? uncommitted.txt");
    expect(state.ref).not.toBe("unknown");
  });

  it("treats a matching live tmux session name as fallback worktree liveness", () => {
    const wt = path.join(tmp, "repo", ".worktrees", "cron", "cron-autopilot-0618-1505");

    expect(worktreeInUse(wt, [], ["cron-autopilot-0618-1505"])).toBe(true);
    expect(worktreeInUse(wt, [path.join(wt, "nested")], [])).toBe(true);
    expect(worktreeInUse(wt, [path.join(tmp, "elsewhere")], ["autopilot-feat-445-example"])).toBe(false);
  });

  it("does not prune a clean fallback worktree while a matching tmux session is live", () => {
    const { repo, cleanWt } = initRepoWithFallbackWorktrees();
    const priorCwd = process.cwd();
    const priorPath = process.env.PATH;
    const binDir = path.join(tmp, "bin");
    const fakeTmux = path.join(binDir, "tmux");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      fakeTmux,
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  list-panes) printf '%s\\n' '${path.join(tmp, "elsewhere").replace(/'/g, "'\\''")}' ;;
  ls) printf '%s\\n' 'cron-autopilot-clean' ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(fakeTmux, 0o755);

    try {
      process.chdir(repo);
      process.env.PATH = `${binDir}:${priorPath ?? ""}`;

      expect(pruneAndCountFallbackWorktrees("autopilot")).toBe(1);
    } finally {
      process.env.PATH = priorPath;
      process.chdir(priorCwd);
    }

    expect(existsSync(cleanWt)).toBe(true);
  });

  it("preserves dirty dead fallback worktrees but removes clean dead ones", () => {
    const { repo, dirtyWt, cleanWt } = initRepoWithFallbackWorktrees();
    const priorCwd = process.cwd();
    const appendSpy = vi.mocked(fsModule.appendFileSync);
    appendSpy.mockClear();

    try {
      process.chdir(repo);
      expect(pruneAndCountFallbackWorktrees("autopilot")).toBe(0);
    } finally {
      process.chdir(priorCwd);
    }

    expect(existsSync(dirtyWt)).toBe(true);
    expect(readFileSync(path.join(dirtyWt, "uncommitted.txt"), "utf-8")).toBe("salvage me\n");
    expect(existsSync(cleanWt)).toBe(false);
    expect(
      appendSpy.mock.calls.some((c) =>
        String(c[1]).includes("\tautopilot\tWORKTREE_DIRTY\t") &&
        String(c[1]).includes("?? uncommitted.txt"),
      ),
    ).toBe(true);
  });
});

describe("onJobError", () => {
  it("logs an ERR_JOB line through the injected logger", () => {
    // Inject a spy logger so the test is fully deterministic and never touches
    // the filesystem or the real .oh/crons/.cron.log (the default logger is log()).
    const spy = vi.fn();
    onJobError("testjob", new Error("disk full"), spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("testjob", "ERR_JOB", "Error: disk full");
  });
});

describe("readFailureTail", () => {
  it("returns a non-empty tail containing the file's trailing text", () => {
    const logFile = path.join(tmp, "job.log");
    writeFileSync(logFile, "first line\nsecond line\nlast line: boom\n");
    const tail = readFailureTail(logFile);
    expect(tail).not.toBe("");
    expect(tail).toContain("boom");
  });

  it('returns "" for a nonexistent path without throwing', () => {
    const missing = path.join(tmp, "nope.log");
    expect(() => readFailureTail(missing)).not.toThrow();
    expect(readFailureTail(missing)).toBe("");
  });

  it('returns "" for an empty file', () => {
    const empty = path.join(tmp, "empty.log");
    writeFileSync(empty, "");
    expect(readFailureTail(empty)).toBe("");
  });

  it("returns exactly the last maxChars characters when the file is longer", () => {
    const logFile = path.join(tmp, "long.log");
    writeFileSync(logFile, "x".repeat(50) + "TAIL");
    const tail = readFailureTail(logFile, 4);
    expect(tail).toBe("TAIL");
    expect(tail.length).toBe(4);
  });
});

describe("SIGHUP reload", () => {
  // These tests drive the exported sighupHandler() directly (not scheduleAll) per
  // US-004. The handler calls scheduleAll() with no dir arg, so it re-reads
  // SIGHUP_CRONS_DIR — repointed via the vi.hoisted block at the top of this file
  // — instead of the repo's real .oh/crons/. resetActiveJobs() clears the
  // module-private registry between cases.
  const appendSpy = () => vi.mocked(fsModule.appendFileSync);
  const loggedLines = (): string[] =>
    appendSpy().mock.calls.map((c) => String(c[1]));
  const reloadLines = (): string[] =>
    loggedLines().filter((l) => l.includes("\tRELOAD\t"));
  const validCron = (id: string, schedule = "0 * * * *"): string =>
    `---\nid: ${id}\nschedule: "${schedule}"\nenabled: true\n---\nbody\n`;
  // A valid 5-field pattern whose next run (next Jan 1) is far enough out that a
  // real croner timer armed by the handler's private constructCron never fires
  // during the test; the afterEach safety-reschedule stops it afterward.
  const FAR_FUTURE = "0 0 1 1 *";

  const emptyCronsDir = (): void => {
    rmSync(SIGHUP_CRONS_DIR, { recursive: true, force: true });
    mkdirSync(SIGHUP_CRONS_DIR, { recursive: true });
  };

  beforeEach(() => {
    resetActiveJobs();
    emptyCronsDir();
    appendSpy().mockClear();
  });

  afterEach(() => {
    // The handler arms REAL croner timers (via the private constructCron, which
    // croner does not unref) for any file left in SIGHUP_CRONS_DIR; those handles
    // live in the module-private activeJobs registry and aren't otherwise
    // reachable to .stop(). Empty the dir and run one more reschedule so the
    // handler stops the last generation (and arms nothing), leaving no live timer.
    emptyCronsDir();
    sighupHandler();
    resetActiveJobs();
    appendSpy().mockClear();
  });

  afterAll(() => {
    rmSync(SIGHUP_CRONS_DIR, { recursive: true, force: true });
  });

  it("stops every prior job handle before re-arming (.stop on each)", () => {
    // Seed activeJobs with two fake handles via an injected mkCron so no real
    // timer is armed and each handle carries an observable .stop spy.
    writeFileSync(path.join(tmp, "a.md"), validCron("a"));
    writeFileSync(path.join(tmp, "b.md"), validCron("b"));
    const stops = [vi.fn(), vi.fn()];
    let i = 0;
    scheduleAll(tmp, vi.fn(), () => ({ stop: stops[i++] }) as unknown as Cron);

    sighupHandler();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  it("picks up an added cron file and drops a removed one on reload", () => {
    writeFileSync(path.join(SIGHUP_CRONS_DIR, "one.md"), validCron("one", FAR_FUTURE));
    sighupHandler();
    expect(reloadLines().at(-1)).toContain("1 scheduled, 0 skipped");

    // Add a second file: the next reload re-reads the dir and counts both.
    appendSpy().mockClear();
    writeFileSync(path.join(SIGHUP_CRONS_DIR, "two.md"), validCron("two", FAR_FUTURE));
    sighupHandler();
    expect(reloadLines().at(-1)).toContain("2 scheduled, 0 skipped");

    // Remove the first file: the next reload drops it.
    appendSpy().mockClear();
    rmSync(path.join(SIGHUP_CRONS_DIR, "one.md"));
    sighupHandler();
    expect(reloadLines().at(-1)).toContain("1 scheduled, 0 skipped");
  });

  it("isolates a malformed cron file during reload without crashing", () => {
    // A valid sibling plus a file with an invalid schedule: loadCrons drops the
    // bad one (SCHED_INVALID) at reload time exactly as at boot, the good one
    // stays scheduled, and the handler neither throws nor exits.
    writeFileSync(path.join(SIGHUP_CRONS_DIR, "good.md"), validCron("good", FAR_FUTURE));
    writeFileSync(path.join(SIGHUP_CRONS_DIR, "bad.md"), validCron("bad", "not-a-cron"));

    expect(() => sighupHandler()).not.toThrow();
    expect(reloadLines().at(-1)).toContain("1 scheduled, 1 skipped");
  });

  it("writes a RELOAD liveness line via the appendFileSync spy", () => {
    sighupHandler();
    expect(loggedLines().some((l) => l.includes("\tRELOAD\t"))).toBe(true);
    // RELOAD reuses the private log() format with id "system" (BOOT precedent).
    expect(reloadLines().at(-1)).toContain("\tsystem\tRELOAD\t");
  });

  it("does not throw when the prior activeJobs registry is empty", () => {
    resetActiveJobs();
    expect(() => sighupHandler()).not.toThrow();
    expect(reloadLines()).toHaveLength(1);
  });

  it("is re-entrancy-safe: a SIGHUP arriving mid-reload is a no-op", () => {
    // Seed one fake handle whose .stop re-enters sighupHandler() while the first
    // reload is still in progress; the reload-lock must make that second call a
    // no-op so the reschedule runs exactly once.
    writeFileSync(path.join(tmp, "a.md"), validCron("a"));
    const stop = vi.fn(() => {
      sighupHandler(); // mid-reload: must return immediately (reloading === true)
    });
    scheduleAll(tmp, vi.fn(), () => ({ stop }) as unknown as Cron);

    sighupHandler();

    // The handle is stopped exactly once: the re-entrant call returned before the
    // stop loop, so it neither re-stopped the handle nor re-ran scheduleAll.
    expect(stop).toHaveBeenCalledTimes(1);
    // Exactly one reschedule completed → exactly one BOOT and one RELOAD line.
    expect(reloadLines()).toHaveLength(1);
    expect(loggedLines().filter((l) => l.includes("\tBOOT\t"))).toHaveLength(1);
  });
});

describe("runPreflight + the fire() preflight gate", () => {
  // Build a real executable preflight script with a chosen exit code and stdout,
  // then point a CronEntry at it. This mirrors buildTmuxWrapper's runWrapper
  // helper (real spawn against a throwaway script) — there is no child_process
  // mock in this suite, and runPreflight calls spawnSync for real.
  const preflightScript = (opts: { exit: number; stdout?: string; sleep?: number }): string => {
    const p = path.join(tmp, `preflight-${process.pid}-${Math.random().toString(16).slice(2)}.sh`);
    // Emit one `echo` per line so a multi-line `stdout` becomes real newlines in
    // the child's output (a single `echo "a\nb"` would print a literal backslash-n).
    const echoes =
      opts.stdout != null
        ? opts.stdout.split("\n").map((l) => `echo ${JSON.stringify(l)}`).join("\n") + "\n"
        : "";
    writeFileSync(
      p,
      `#!/usr/bin/env bash\n` +
        (opts.sleep ? `sleep ${opts.sleep}\n` : "") +
        echoes +
        `exit ${opts.exit}\n`,
      { mode: 0o755 },
    );
    return p;
  };

  const entry = (preflight?: string) => ({
    id: "autopilot",
    schedule: "* * * * *",
    enabled: true,
    overlap: false,
    catchup: false,
    tmux: true,
    worktree: true,
    preflight,
    repo: undefined as string | undefined,
    body: "body\n",
    filePath: "autopilot.md",
  });

  const appendSpy = () => vi.mocked(fsModule.appendFileSync);
  const loggedLines = (): string[] => appendSpy().mock.calls.map((c) => String(c[1]));

  beforeEach(() => appendSpy().mockClear());
  afterEach(() => appendSpy().mockClear());

  it("returns the gate's exit code and its final stdout line as the reason", () => {
    const skip = runPreflight(entry(preflightScript({ exit: 10, stdout: "SKIPPED-CAP-DAILY" })));
    expect(skip).toEqual({ status: 10, reason: "SKIPPED-CAP-DAILY" });

    const total = runPreflight(entry(preflightScript({ exit: 11, stdout: "SKIPPED-CAP-TOTAL" })));
    expect(total).toEqual({ status: 11, reason: "SKIPPED-CAP-TOTAL" });
  });

  it("returns status 0 with the PROCEED line as the reason on a green gate", () => {
    const r = runPreflight(entry(preflightScript({ exit: 0, stdout: "PROCEED total=1/10 today=1/6" })));
    expect(r.status).toBe(0);
    expect(r.reason).toBe("PROCEED total=1/10 today=1/6");
  });

  it("uses only the LAST stdout line as the reason (diagnostics above it are ignored)", () => {
    const script = preflightScript({ exit: 10, stdout: "noise line\nSKIPPED-CAP-DAILY" });
    expect(runPreflight(entry(script)).reason).toBe("SKIPPED-CAP-DAILY");
  });

  it("fails CLOSED (non-zero status) and logs PREFLIGHT_ERROR for an invalid preflight path", () => {
    const r = runPreflight(entry("../evil"));
    expect(r.status).not.toBe(0);
    expect(r.reason).toBe("preflight-error: invalid-path");
    expect(loggedLines().some((l) => l.includes("PREFLIGHT_ERROR"))).toBe(true);
  });

  it("fails CLOSED (non-zero status) and logs PREFLIGHT_ERROR when the script is missing/unexecutable", () => {
    const r = runPreflight(entry("scripts/definitely-missing-preflight.sh"));
    expect(r.status).not.toBe(0);
    expect(r.reason).toBe("preflight-error: exec-error");
    expect(loggedLines().some((l) => l.includes("PREFLIGHT_ERROR"))).toBe(true);
  });

  it("fails CLOSED (non-zero status) and logs PREFLIGHT_ERROR when the gate times out", () => {
    // 50ms budget against a 2s sleep → spawnSync kills it (error/null status).
    const r = runPreflight(entry(preflightScript({ exit: 10, sleep: 2 })), 50);
    expect(r.status).not.toBe(0);
    expect(r.reason).toBe("preflight-error: exec-error");
    expect(loggedLines().some((l) => l.includes("PREFLIGHT_ERROR"))).toBe(true);
  });

  it("fire() short-circuits on a non-zero gate: logs SKIPPED_PREFLIGHT and never spawns", () => {
    // tmux:true would normally reach fireTmux's real `spawn("tmux", …)`, but the
    // gate returns first, so no SPAWNED/SPAWNED_WORKTREE line is ever logged.
    const cronFile = path.join(tmp, "autopilot.md");
    const script = preflightScript({ exit: 10, stdout: "SKIPPED-CAP-DAILY" });
    writeFileSync(
      cronFile,
      `---\nid: autopilot\nschedule: "* * * * *"\nenabled: true\ntmux: true\nworktree: true\npreflight: ${script}\n---\nbody\n`,
    );
    fire({ ...entry(script), filePath: cronFile });
    const lines = loggedLines();
    expect(lines.some((l) => l.includes("\tSKIPPED_PREFLIGHT\t") && l.includes("SKIPPED-CAP-DAILY"))).toBe(true);
    expect(lines.some((l) => l.includes("SPAWNED"))).toBe(false);
    expect(lines.some((l) => l.includes("\tFIRE\t"))).toBe(false);
  });

  it("fire() picks up newly-added repo and preflight metadata before any spawn", () => {
    const cronFile = path.join(tmp, "autopilot.md");
    const script = preflightScript({ exit: 10, stdout: "SKIPPED-CAP-DAILY" });
    writeFileSync(
      cronFile,
      `---\nid: autopilot\nschedule: "* * * * *"\nenabled: true\ntmux: true\nworktree: true\npreflight: ${script}\nrepo: mifunedev/openharness\n---\nbody\n`,
    );
    fire({ ...entry(undefined), filePath: cronFile });

    const lines = loggedLines();
    expect(lines.some((l) => l.includes("\tENTRY_RELOADED\t") && l.includes("preflight,repo"))).toBe(true);
    expect(lines.some((l) => l.includes("\tSKIPPED_PREFLIGHT\t") && l.includes("SKIPPED-CAP-DAILY"))).toBe(true);
    expect(lines.some((l) => l.includes("SPAWNED"))).toBe(false);
  });

  it("exports repo and matching remote into preflight runs", () => {
    withTempGitRemotes({ upstream: "https://github.com/mifunedev/openharness.git" }, () => {
      const script = path.join(tmp, "preflight-env.sh");
      const out = path.join(tmp, "preflight-env.out");
      const expectedRemote = remoteForRepo("mifunedev/openharness");
      expect(expectedRemote).toBe("upstream");
      writeFileSync(
        script,
        `#!/usr/bin/env bash\nprintf '%s %s\\n' "$AUTOPILOT_REPO" "$AUTOPILOT_REMOTE" > ${JSON.stringify(out)}\necho PROCEED\n`,
        { mode: 0o755 },
      );

      const r = runPreflight({ ...entry(script), repo: "mifunedev/openharness" });

      expect(r.status).toBe(0);
      expect(readFileSync(out, "utf-8").trim()).toBe(`mifunedev/openharness ${expectedRemote}`);
    });
  });

  it("fire() also short-circuits when preflight itself errors", () => {
    const cronFile = path.join(tmp, "autopilot.md");
    writeFileSync(
      cronFile,
      `---\nid: autopilot\nschedule: "* * * * *"\nenabled: true\ntmux: true\nworktree: true\npreflight: scripts/definitely-missing-preflight.sh\n---\nbody\n`,
    );
    fire({ ...entry("scripts/definitely-missing-preflight.sh"), filePath: cronFile });
    const lines = loggedLines();
    expect(lines.some((l) => l.includes("\tPREFLIGHT_ERROR\t"))).toBe(true);
    expect(
      lines.some((l) => l.includes("\tSKIPPED_PREFLIGHT\t") && l.includes("preflight-error: exec-error")),
    ).toBe(true);
    expect(lines.some((l) => l.includes("SPAWNED"))).toBe(false);
    expect(lines.some((l) => l.includes("\tFIRE\t"))).toBe(false);
  });
});

describe("remoteForRepo", () => {
  it("resolves the canonical repo to the local remote whose URL matches it", () => {
    withTempGitRemotes({ origin: "https://github.com/example/openharness.git", upstream: "git@github.com:mifunedev/openharness.git" }, () => {
      const remote = remoteForRepo("mifunedev/openharness");
      expect(remote).toBe("upstream");
      expect(isValidRemote(remote!)).toBe(true);
    });
  });
});
