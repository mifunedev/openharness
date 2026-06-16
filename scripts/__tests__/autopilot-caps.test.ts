import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "autopilot-caps.sh");

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
  lastStdoutLine: string;
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "autopilot-caps-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// A fake `gh` that ignores its args and prints `count` (the number `gh pr list
// --json number --jq 'length'` would emit). `exitStatus` lets a test simulate a
// gh failure (non-numeric/empty output → the script's fail-open path).
function ghStub(count: string, exitStatus = 0): string {
  const p = path.join(tmp, "gh-stub");
  writeFileSync(p, `#!/usr/bin/env bash\necho '${count}'\nexit ${exitStatus}\n`);
  chmodSync(p, 0o755);
  return p;
}

// MUST invoke via `bash`: autopilot-caps.sh uses [[ =~ ]] and `local`, neither
// POSIX sh. AUTOPILOT_LOG_ROOT is pinned to the per-test tmp so the resolver
// never shells out to git and writes never escape the sandbox.
function run(env: Record<string, string>): RunResult {
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf-8",
    env: { ...process.env, AUTOPILOT_LOG_ROOT: tmp, ...env },
  });
  const stdout = result.stdout ?? "";
  const lines = stdout.trim().split("\n");
  return {
    stdout,
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
    lastStdoutLine: lines[lines.length - 1] ?? "",
  };
}

const today = (): string => {
  const r = spawnSync("date", ["-u", "+%Y-%m-%d"], { encoding: "utf-8" });
  return (r.stdout ?? "").trim();
};
const memoryLog = (): string => {
  const p = path.join(tmp, "memory", today(), "log.md");
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
};
const liveness = (): string => {
  const p = path.join(tmp, "crons", ".cron.log");
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
};

describe("autopilot-caps.sh — exit-code + STATUS contract", () => {
  it("PROCEEDs (exit 0) with both counts when there is cap headroom", () => {
    const r = run({ GH_BIN: ghStub("1") });
    expect(r.status).toBe(0);
    expect(r.lastStdoutLine).toBe("PROCEED total=1/10 today=1/6");
    // A PROCEED writes neither the memory block nor a liveness line.
    expect(memoryLog()).toBe("");
    expect(liveness()).toBe("");
  });

  it("SKIPPED-CAP-TOTAL (exit 11) when total open >= ceiling", () => {
    const r = run({ GH_BIN: ghStub("10") });
    expect(r.status).toBe(11);
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-TOTAL");
    expect(liveness()).toContain("autopilot: SKIPPED-CAP-TOTAL");
    expect(memoryLog()).toContain("**Result**: SKIPPED-CAP-TOTAL");
  });

  it("checks the total ceiling FIRST (total wins when both caps are hit)", () => {
    // 10 satisfies both ceilings; the total branch is evaluated first → exit 11.
    const r = run({ GH_BIN: ghStub("10"), AUTOPILOT_TOTAL_CAP: "10", AUTOPILOT_DAILY_CAP: "6" });
    expect(r.status).toBe(11);
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-TOTAL");
  });

  it("SKIPPED-CAP-DAILY (exit 10) when only the daily cap is hit", () => {
    // Raise the total ceiling so only the daily cap trips.
    const r = run({ GH_BIN: ghStub("6"), AUTOPILOT_TOTAL_CAP: "99" });
    expect(r.status).toBe(10);
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-DAILY");
    expect(liveness()).toContain("autopilot: SKIPPED-CAP-DAILY");
  });

  it("writes a byte-faithful memory block on a daily-cap skip", () => {
    run({ GH_BIN: ghStub("6"), AUTOPILOT_TOTAL_CAP: "99" });
    const block = memoryLog();
    // The same shape the autopilot model wrote by hand on a capped hour, so
    // heartbeat/watchdog parsing is unchanged.
    expect(block).toContain("## Autopilot --");
    expect(block).toContain("- **Result**: SKIPPED-CAP-DAILY");
    expect(block).toContain("- **Executor**: delegate-advisor");
    expect(block).toContain("- **Selected**: none");
    expect(block).toContain("- **Session**: none");
    expect(block).toContain(
      "- **Action**: Skipped before selection because the daily open autopilot PR cap is already full.",
    );
    expect(block).toContain(
      "- **Observation**: 6 open autopilot PRs were created today (cap 6); no issue selection, branch, or PR was produced.",
    );
  });

  it("honors AUTOPILOT_EXECUTOR / CRON_TMUX_SESSION in the memory block", () => {
    run({
      GH_BIN: ghStub("6"),
      AUTOPILOT_TOTAL_CAP: "99",
      AUTOPILOT_EXECUTOR: "ralph",
      CRON_TMUX_SESSION: "cron-autopilot-0615-1105",
    });
    const block = memoryLog();
    expect(block).toContain("- **Executor**: ralph");
    expect(block).toContain("- **Session**: cron-autopilot-0615-1105");
  });

  it("fails OPEN (PROCEED-GH-ERROR, exit 0) and writes no logs when gh errors", () => {
    const r = run({ GH_BIN: ghStub("", 1) });
    expect(r.status).toBe(0);
    expect(r.lastStdoutLine).toBe("PROCEED-GH-ERROR");
    expect(memoryLog()).toBe("");
    expect(liveness()).toBe("");
  });

  it("fails OPEN when GH_BIN is missing entirely", () => {
    const r = run({ GH_BIN: path.join(tmp, "does-not-exist") });
    expect(r.status).toBe(0);
    expect(r.lastStdoutLine).toBe("PROCEED-GH-ERROR");
  });

  it("keeps every diagnostic on stderr so stdout's last line is the STATUS token", () => {
    const r = run({ GH_BIN: ghStub("6"), AUTOPILOT_TOTAL_CAP: "99" });
    // The reason the cron runtime reads is r.stdout's last line; diagnostics
    // (counts, logged-to messages) must never shadow it.
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-DAILY");
    expect(r.stderr).toContain("total=6/99 today=6/6");
  });
});

describe("autopilot-caps.sh — harness.yaml configurable cap defaults", () => {
  // Point the script at a fixture harness.yaml via HARNESS_YAML and assert the
  // caps default from `autopilot.total_cap` / `autopilot.daily_cap` there.
  const fixtureYaml = (body: string): string => {
    const p = path.join(tmp, "harness.yaml");
    writeFileSync(p, body);
    return p;
  };

  it("reads the daily cap from harness.yaml when no env override is set", () => {
    // daily_cap 3 (total 50 not hit) + 3 open today → trips DAILY.
    const r = run({
      GH_BIN: ghStub("3"),
      HARNESS_YAML: fixtureYaml("autopilot:\n  daily_cap: 3\n  total_cap: 50\n"),
    });
    expect(r.status).toBe(10);
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-DAILY");
  });

  it("reads the total ceiling from harness.yaml when no env override is set", () => {
    const r = run({
      GH_BIN: ghStub("4"),
      HARNESS_YAML: fixtureYaml("autopilot:\n  total_cap: 4\n  daily_cap: 99\n"),
    });
    expect(r.status).toBe(11);
    expect(r.lastStdoutLine).toBe("SKIPPED-CAP-TOTAL");
  });

  it("lets an env override beat the harness.yaml cap default", () => {
    // harness.yaml says 3, but the env raises both caps to 99 → PROCEED.
    const r = run({
      GH_BIN: ghStub("3"),
      HARNESS_YAML: fixtureYaml("autopilot:\n  daily_cap: 3\n  total_cap: 3\n"),
      AUTOPILOT_TOTAL_CAP: "99",
      AUTOPILOT_DAILY_CAP: "99",
    });
    expect(r.status).toBe(0);
    expect(r.lastStdoutLine).toBe("PROCEED total=3/99 today=3/99");
  });

  it("falls back to the hard-coded 10/6 defaults when harness.yaml has no autopilot caps", () => {
    const r = run({ GH_BIN: ghStub("1"), HARNESS_YAML: fixtureYaml("sandbox:\n  name: x\n") });
    expect(r.status).toBe(0);
    expect(r.lastStdoutLine).toBe("PROCEED total=1/10 today=1/6");
  });
});
