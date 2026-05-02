import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireLock, loadCrons, parseCronFile } from "../cron-runtime";

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
