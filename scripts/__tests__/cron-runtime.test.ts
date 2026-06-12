import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import * as fsModule from "node:fs";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquireLock,
  buildTmuxWrapper,
  loadCrons,
  parseCronFile,
  reloadBody,
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

describe("tmuxSessionName", () => {
  it("formats <id>-<MMDD>-<HHMM> from local time, zero-padded", () => {
    // 2026-06-10 18:05 local (month is 0-indexed → 5 = June).
    expect(tmuxSessionName("autopilot", new Date(2026, 5, 10, 18, 5))).toBe(
      "autopilot-0610-1805",
    );
    // Single-digit month/day/hour/minute all pad to two digits.
    expect(tmuxSessionName("x", new Date(2026, 0, 2, 3, 4))).toBe("x-0102-0304");
  });
});

describe("buildTmuxWrapper", () => {
  const wrapper = buildTmuxWrapper({
    session: "autopilot-0610-1805",
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
      "export CRON_TMUX_SESSION=autopilot-0610-1805 CRON_KEEP_MARKER=/tmp/autopilot-0610-1805.keep;",
    );
  });

  it("runs the agent against the prompt file and tees the log", () => {
    expect(wrapper).toContain(
      'claude -p "$(cat /tmp/cron-autopilot-0610-1805.prompt)" 2>&1 | tee /tmp/autopilot-0610-1805.log;',
    );
  });

  it("persists a kept session as a resumed live agent, falling back to a shell", () => {
    expect(wrapper).toContain(
      "[ -f /tmp/autopilot-0610-1805.keep ] && { claude --continue; exec bash; }",
    );
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
