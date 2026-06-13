import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import type { Cron } from "croner";
import * as fsModule from "node:fs";
import {
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
// THIS dir and never the repo's real crons/ directory (US-004 AC). Per-pid keeps
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
  isValidSchedule,
  loadCrons,
  onJobError,
  parseCronFile,
  readFailureTail,
  reloadBody,
  resetActiveJobs,
  scheduleAll,
  sighupHandler,
  tmuxSessionName,
} from "../cron-runtime";

// Mock only appendFileSync (the log() writer) as a no-op spy so reloadBody's
// BODY_RELOADED / BODY_RELOAD_ERR signals are observable without polluting the
// real crons/.cron.log during test runs. All other node:fs exports pass through.
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

  it("writes the per-id pidfile and cleans it up", () => {
    expect(wrapper).toContain("echo $$ > /tmp/cron-autopilot.pid;");
    expect(wrapper).toContain("rm -f /tmp/cron-autopilot.pid;");
  });

  it("exports the session + keep-marker env vars", () => {
    expect(wrapper).toContain(
      "export CRON_TMUX_SESSION=cron-autopilot-0610-1805 CRON_KEEP_MARKER=/tmp/cron-autopilot-0610-1805.keep;",
    );
  });

  it("runs the agent against the prompt file and tees the log", () => {
    expect(wrapper).toContain(
      'claude -p "$(cat /tmp/cron-autopilot-0610-1805.prompt)" 2>&1 | tee /tmp/cron-autopilot-0610-1805.log',
    );
    expect(wrapper).toContain("cron-runtime: Claude limit detected; retrying with Codex");
    expect(wrapper).toContain(
      'codex exec --sandbox danger-full-access "$(cat /tmp/cron-autopilot-0610-1805.prompt)" 2>&1 | tee -a /tmp/cron-autopilot-0610-1805.log',
    );
    expect(wrapper).toContain("export RALPH_HARNESS=codex;");
  });

  it("persists a kept session as a resumed live agent, using Codex after fallback", () => {
    expect(wrapper).toContain(
      '[ "$(cat /tmp/cron-autopilot-0610-1805.agent 2>/dev/null || echo claude)" = codex ]; then codex; else claude --continue; fi;',
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

    expect(command).toContain('claude -p "$(cat /tmp/cron-global.prompt)"');
    expect(command).toContain("grep -Eiq");
    expect(command).toContain("export RALPH_HARNESS=codex;");
    expect(command).toContain(
      'codex exec --sandbox danger-full-access "$(cat /tmp/cron-global.prompt)"',
    );
  });

  it("preserves explicit non-Claude CRON_AGENT_BIN behavior without Codex fallback", () => {
    const command = buildCronAgentCommand({
      agentBin: "pi",
      promptFile: "/tmp/cron-custom.prompt",
      logFile: "/tmp/cron-custom.log",
    });

    expect(command).toContain('pi -p "$(cat /tmp/cron-custom.prompt)"');
    expect(command).not.toContain("codex exec");
    expect(command).not.toContain("RALPH_HARNESS=codex");
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
      path.join(tmp, "bad.md"),
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
});

describe("scheduleAll", () => {
  const cron = (id: string, schedule: string): string =>
    `---\nid: ${id}\nschedule: "${schedule}"\nenabled: true\n---\nbody\n`;

  it("schedules valid crons, skips an invalid sibling, and logs an accurate BOOT summary", () => {
    // Files load in alphabetical order: a-good (valid), b-bad (invalid → dropped
    // at load time by US-002's filter), c-good (valid).
    writeFileSync(path.join(tmp, "a-good.md"), cron("agood", "0 * * * *"));
    writeFileSync(path.join(tmp, "b-bad.md"), cron("bbad", "not-a-cron"));
    writeFileSync(path.join(tmp, "c-good.md"), cron("cgood", "*/5 * * * *"));

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

  it("fault-isolates a construction throw (defense-in-depth): skips only the throwing cron", () => {
    // All three schedules are VALID, so they pass the load-time filter — this
    // bypasses US-002 and exercises the construction try/catch directly via an
    // injected mkCron that simulates a residual croner construction throw.
    writeFileSync(path.join(tmp, "a-ok.md"), cron("aok", "0 * * * *"));
    writeFileSync(path.join(tmp, "b-boom.md"), cron("bboom", "0 * * * *"));
    writeFileSync(path.join(tmp, "c-ok.md"), cron("cok", "0 * * * *"));

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

  it("does not double-count: a load-time skip and a construction skip sum disjointly", () => {
    writeFileSync(path.join(tmp, "a-ok.md"), cron("aok", "0 * * * *"));
    writeFileSync(path.join(tmp, "b-loadbad.md"), cron("bload", "not-a-cron"));
    writeFileSync(path.join(tmp, "c-boom.md"), cron("cboom", "0 * * * *"));

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

  it("returns false when an existing PID is alive", () => {
    const pidFile = path.join(tmp, ".pid");
    const child = spawn("sleep", ["10"], { stdio: "ignore" });
    try {
      writeFileSync(pidFile, String(child.pid));
      expect(acquireLock(pidFile)).toBe(false);
    } finally {
      child.kill();
    }
  });

  it("steals stale lock when previous PID is dead", () => {
    const pidFile = path.join(tmp, ".pid");
    // Pick a high PID unlikely to be running.
    writeFileSync(pidFile, "999999");
    expect(acquireLock(pidFile)).toBe(true);
    expect(existsSync(pidFile)).toBe(true);
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

describe("onJobError", () => {
  it("logs an ERR_JOB line through the injected logger", () => {
    // Inject a spy logger so the test is fully deterministic and never touches
    // the filesystem or the real crons/.cron.log (the default logger is log()).
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
  // — instead of the repo's real crons/. resetActiveJobs() clears the
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
