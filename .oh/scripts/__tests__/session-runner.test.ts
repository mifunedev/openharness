import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const LIB = path.join(REPO_ROOT, ".oh", "scripts", "lib", "session-runner.sh");
const LIB_SOURCE = readFileSync(LIB, "utf-8");

const BASH = (() => {
  const r = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf-8" });
  return (r.stdout ?? "").trim() || "/usr/bin/bash";
})();

const PASSTHROUGH_TOOLS = [
  "bash",
  "sh",
  "cat",
  "date",
  "dirname",
  "env",
  "grep",
  "head",
  "hostname",
  "jq",
  "kill",
  "ls",
  "mkdir",
  "mktemp",
  "printf",
  "rm",
  "rmdir",
  "sed",
  "sleep",
  "tail",
  "tee",
  "touch",
  "uname",
];

const scratch: string[] = [];

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  while (scratch.length) {
    rmSync(scratch.pop() as string, { recursive: true, force: true });
  }
});


const HERDR_STUB = `#!/usr/bin/env bash
printf '%s\\n' "herdr $*" >> "\${STUB_CALLS:-/dev/null}"
sub="\${1:-}"; shift || true
case "$sub" in
  status)
    if [ "\${STUB_HERDR_SERVER:-running}" != "running" ]; then
      printf 'client:\\n  version: 0.7.4\\n\\nserver:\\n  status: unavailable\\n  compatible: unknown\\n'
      exit 1
    fi
    printf 'client:\\n  version: 0.7.4\\n  channel: stable\\n  protocol: 16\\n\\nserver:\\n  status: running\\n  version: 0.7.4\\n  protocol: 16\\n  compatible: yes\\n  socket: /tmp/herdr.sock\\n\\nupdate:\\n  restart_needed: no\\n'
    ;;
  agent)
    verb="\${1:-}"; shift || true
    case "$verb" in
      start)
        if [ "\${STUB_HERDR_START_FAIL:-0}" = "1" ]; then
          printf '{"error":{"type":"start_failed"}}\\n'; exit 1
        fi
        # Shape observed live 2026-08-12 (agent_started payload).
        printf '{"id":"cli:agent:start","result":{"agent":{"cwd":"%s","foreground_cwd":"%s","pane_id":"%s"}},"type":"agent_started"}\\n' \\
          "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_PANE_ID:-w7:p3}"
        ;;
      get)
        if [ "\${STUB_HERDR_AGENT_LIVE:-1}" = "1" ]; then
          printf '{"result":{"agent":{"pane_id":"%s"}},"type":"agent_info"}\\n' "\${STUB_HERDR_PANE_ID:-w7:p3}"
          exit 0
        fi
        printf '{"error":{"type":"agent_not_found"}}\\n' >&2; exit 1
        ;;
      *) exit 64 ;;
    esac
    ;;
  wait)
    exit "\${STUB_HERDR_WAIT_RC:-0}"
    ;;
  pane)
    verb="\${1:-}"; shift || true
    case "$verb" in
      read)
        # Model herdr's real pane lifetime. herdr destroys a pane the instant
        # its command returns, and a read against a destroyed pane answers
        # pane_not_found — which is the whole of #761. A stub that always
        # replays the probe output is MORE FORGIVING than herdr, and that is
        # why 46 tests passed while the live gate could never admit herdr.
        # A pane is readable here only if its start invocation carried a
        # keep-alive, so dropping the keep-alive in production fails the suite.
        if [ "\${STUB_HERDR_PANE_MODEL:-lifetime}" = "lifetime" ] &&
          ! grep -q '^herdr agent start .*sleep' "\${STUB_CALLS:-/dev/null}" 2>/dev/null; then
          printf '{"code":"pane_not_found","message":"pane not found"}\\n' >&2
          exit 1
        fi
        printf '%s\\n' "\${STUB_HERDR_PROBE_OUT:-}"
        ;;
      list)
        printf '{"id":"cli:pane:list","result":{"panes":[{"pane_id":"%s","foreground_cwd":"%s","cwd":"%s"}],"type":"pane_list"}}\\n' \\
          "\${STUB_HERDR_PANE_ID:-w7:p3}" "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_FG_CWD:-/w}"
        ;;
      close) printf '{"result":{"type":"ok"}}\\n' ;;
      *) exit 64 ;;
    esac
    ;;
  *) exit 64 ;;
esac
`;

const TMUX_STUB = `#!/usr/bin/env bash
printf '%s\\n' "tmux $*" >> "\${STUB_CALLS:-/dev/null}"
case "\${1:-}" in
  has-session) exit "\${STUB_TMUX_HAS_SESSION:-0}" ;;
  new-session) exit "\${STUB_TMUX_NEW_SESSION_RC:-0}" ;;
  kill-session) exit 0 ;;
  *) exit 0 ;;
esac
`;

interface BinOpts {
  herdr?: boolean;
  tmux?: boolean;
  isolated?: boolean;
}

function makeBin(opts: BinOpts): { dir: string; pathEnv: string } {
  const dir = tmpDir("sr-bin-");
  if (opts.herdr) {
    const p = path.join(dir, "herdr");
    writeFileSync(p, HERDR_STUB);
    chmodSync(p, 0o755);
  }
  if (opts.tmux) {
    const p = path.join(dir, "tmux");
    writeFileSync(p, TMUX_STUB);
    chmodSync(p, 0o755);
  }
  if (opts.isolated) {
    for (const tool of PASSTHROUGH_TOOLS) {
      const r = spawnSync(BASH, ["-c", `command -v ${tool}`], {
        encoding: "utf-8",
      });
      const real = (r.stdout ?? "").trim();
      if (!real || !real.startsWith("/")) continue;
      try {
        symlinkSync(real, path.join(dir, tool));
      } catch {
      }
    }
    return { dir, pathEnv: dir };
  }
  return { dir, pathEnv: `${dir}:${process.env.PATH ?? ""}` };
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
  signal: string | null;
  ms: number;
}

function sh(
  snippet: string,
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): RunResult {
  const started = Date.now();
  const result = spawnSync(BASH, ["-c", `source '${LIB}'\n${snippet}`], {
    encoding: "utf-8",
    env: { ...opts.env },
    timeout: opts.timeoutMs,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
    signal: result.signal ?? null,
    ms: Date.now() - started,
  };
}

function makeTask(slug: string, progress = "# progress\n") {
  const root = tmpDir("sr-task-");
  const taskDir = path.join(root, "tasks", slug);
  const worktree = path.join(root, "worktree");
  const runnerTmp = path.join(root, "tmp");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  mkdirSync(runnerTmp, { recursive: true });
  writeFileSync(path.join(taskDir, "progress.txt"), progress);
  return {
    root,
    taskDir,
    worktree,
    runnerTmp,
    progressFile: path.join(taskDir, "progress.txt"),
    lock: path.join(runnerTmp, `firstmate-${slug}.lock`),
    callsFile: path.join(root, "calls.txt"),
  };
}

function readCalls(t: ReturnType<typeof makeTask>): string {
  try {
    return readFileSync(t.callsFile, "utf-8");
  } catch {
    return "";
  }
}

function callerFingerprint(worktree: string): string {
  const r = spawnSync(
    BASH,
    ["-c", `source '${LIB}'\nrunner_local_fingerprint '${worktree}'`],
    { encoding: "utf-8" },
  );
  return (r.stdout ?? "").trim();
}


describe("resolve_timeout_ms", () => {
  const DEFAULT = "14400000";

  it("defaults to 14400000 (4h) when FIRSTMATE_TIMEOUT_MS is unset", () => {
    const t = makeTask("budget");
    const r = sh(`resolve_timeout_ms budget`, {
      env: { PATH: process.env.PATH, RUNNER_TMPDIR: t.runnerTmp },
    });
    expect(r.stdout.trim()).toBe(DEFAULT);
    expect(r.stderr).not.toContain("rejected");
  });

  it("honours a valid positive override", () => {
    const t = makeTask("budget");
    const r = sh(`resolve_timeout_ms budget`, {
      env: {
        PATH: process.env.PATH,
        RUNNER_TMPDIR: t.runnerTmp,
        FIRSTMATE_TIMEOUT_MS: "60000",
      },
    });
    expect(r.stdout.trim()).toBe("60000");
    expect(r.stderr).not.toContain("rejected");
  });

  for (const [label, value] of [
    ["zero", "0"],
    ["negative", "-1"],
    ["non-numeric", "abc"],
    ["empty", ""],
  ] as const) {
    it(`rejects a ${label} FIRSTMATE_TIMEOUT_MS, falls back to the default, and logs it`, () => {
      const t = makeTask("budget");
      const r = sh(`resolve_timeout_ms budget`, {
        env: {
          PATH: process.env.PATH,
          RUNNER_TMPDIR: t.runnerTmp,
          FIRSTMATE_TIMEOUT_MS: value,
        },
      });
      expect(r.stdout.trim()).toBe(DEFAULT);
      expect(r.stderr).toContain("rejected FIRSTMATE_TIMEOUT_MS");
      const log = readFileSync(
        path.join(t.runnerTmp, "firstmate-budget.log"),
        "utf-8",
      );
      expect(log).toContain("rejected FIRSTMATE_TIMEOUT_MS");
    });
  }
});


describe("runner_detect ladder", () => {
  function detectEnv(
    t: ReturnType<typeof makeTask>,
    bin: { pathEnv: string },
    extra: NodeJS.ProcessEnv = {},
  ): NodeJS.ProcessEnv {
    return {
      PATH: bin.pathEnv,
      HOME: t.root,
      RUNNER_TMPDIR: t.runnerTmp,
      STUB_CALLS: t.callsFile,
      ...extra,
    };
  }

  it("degrades to tmux when herdr is not installed", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(r.stderr).toContain("herdr is not installed");
  });

  it("degrades to tmux when the herdr binary is up but the server is down", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, { STUB_HERDR_SERVER: "down" }),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(r.stderr).toContain("status: running");
    expect(r.stderr).toContain("compatible: yes");
    expect(readFileSync(t.callsFile, "utf-8")).not.toContain("agent start");
  });

  it("degrades to foreground when neither herdr nor tmux is installed", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin),
    });
    expect(r.stdout.trim()).toBe("foreground");
    expect(r.stderr).toContain("tmux is not installed");
  });

  it("degrades to tmux when the probe pane's fingerprint does not match the caller's", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, {
        STUB_HERDR_PROBE_OUT:
          "FIRSTMATE-FINGERPRINT host=some-other-host docker=no worktree=no",
      }),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(r.stderr).toContain("fingerprint mismatch");
    expect(r.stderr).toMatch(/fingerprint mismatch on [a-z,]*host/);
    expect(r.stderr).toContain("host=some-other-host");
    const log = readFileSync(
      path.join(t.runnerTmp, "firstmate-ladder.log"),
      "utf-8",
    );
    expect(log).toContain("fingerprint mismatch");
  });

  it("closes its own probe pane on the mismatch path", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, {
        STUB_HERDR_PROBE_OUT:
          "FIRSTMATE-FINGERPRINT host=some-other-host docker=no worktree=no",
      }),
    });
    const calls = readFileSync(t.callsFile, "utf-8");
    expect(calls).toContain("agent start");
    expect(calls).toMatch(/herdr pane close w7:p3/);
  });

  it("selects herdr — and still closes the probe pane — when the fingerprints match", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, {
        STUB_HERDR_PROBE_OUT: `FIRSTMATE-FINGERPRINT ${callerFingerprint(t.worktree)}`,
      }),
    });
    expect(r.stdout.trim()).toBe("herdr");
    expect(readFileSync(t.callsFile, "utf-8")).toMatch(/herdr pane close w7:p3/);
  });


  it("keeps the probe pane alive across the read, and derives the budget from the one timeout source", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, {
        STUB_HERDR_PROBE_OUT: `FIRSTMATE-FINGERPRINT ${callerFingerprint(t.worktree)}`,
        RUNNER_PROBE_TIMEOUT_MS: "20000",
      }),
    });
    const start = readFileSync(t.callsFile, "utf-8")
      .split("\n")
      .find((l) => l.includes("agent start"));
    expect(start).toContain('sleep "${2:-30}"');
    expect(start).toMatch(/\s25$/);
  });

  it("reproduces #761: a probe pane that exits before the read is unreadable", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const forgiving = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, {
        STUB_HERDR_PROBE_OUT: `FIRSTMATE-FINGERPRINT ${callerFingerprint(t.worktree)}`,
        STUB_HERDR_PANE_MODEL: "none",
      }),
    });
    expect(forgiving.stdout.trim()).toBe("herdr");

    const t2 = makeTask("ladder");
    const faithful = sh(`runner_detect ladder '${t2.worktree}'`, {
      env: detectEnv(t2, bin, {
        STUB_HERDR_PROBE_OUT: `FIRSTMATE-FINGERPRINT ${callerFingerprint(t2.worktree)}`,
      }),
    });
    expect(faithful.stdout.trim()).toBe("herdr");
  });

  it("never puts the keep-alive on the LOCAL fingerprint path", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`printf '%s' "$RUNNER_PROBE_SCRIPT"`, {
      env: detectEnv(t, bin),
    });
    expect(r.stdout).not.toContain("sleep");
    expect(r.stdout).toContain("FIRSTMATE-FINGERPRINT");

    const started = Date.now();
    const local = sh(`runner_local_fingerprint '${t.worktree}'`, {
      env: detectEnv(t, bin),
    });
    expect(local.stdout).toContain("host=");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("degrades to tmux when the probe pane yields no fingerprint at all", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, { STUB_HERDR_PROBE_OUT: "" }),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(r.stderr).toContain("no probe fingerprint obtained");
  });

  it("nesting guard: HERDR_ENV=1 rules herdr out without launching a probe pane", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, { HERDR_ENV: "1" }),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(r.stderr).toContain("nesting guard");
    expect(r.stderr).toContain("allow_nested=false");
    const calls = readCalls(t);
    expect(calls).not.toContain("agent start");
    expect(calls.trim()).toBe("");
  });

  it("nesting guard: HERDR_PANE_ID alone also rules herdr out", () => {
    const t = makeTask("ladder");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ladder '${t.worktree}'`, {
      env: detectEnv(t, bin, { HERDR_PANE_ID: "w1:p1" }),
    });
    expect(r.stdout.trim()).toBe("tmux");
    expect(readCalls(t).trim()).toBe("");
  });
});


describe("runner_detect overrides", () => {
  it("rejects an unknown runner name", () => {
    const t = makeTask("ov");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}' bogus`, {
      env: { PATH: bin.pathEnv, RUNNER_TMPDIR: t.runnerTmp },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("unknown runner bogus");
  });

  it("hard-errors when herdr is requested but not installed", () => {
    const t = makeTask("ov");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}' herdr`, {
      env: { PATH: bin.pathEnv, RUNNER_TMPDIR: t.runnerTmp },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout.trim()).not.toBe("tmux");
    expect(r.stderr).toContain("herdr is not installed");
  });

  it("hard-errors — naming the fingerprint mismatch — when herdr is requested but out-of-environment", () => {
    const t = makeTask("ov");
    const bin = makeBin({ herdr: true, tmux: true, isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}' herdr`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_HERDR_PROBE_OUT:
          "FIRSTMATE-FINGERPRINT host=some-other-host docker=no worktree=no",
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stdout.trim()).not.toBe("tmux");
    expect(r.stderr).toContain("fingerprint mismatch");
    expect(r.stderr).toContain("Refusing to degrade silently");
  });

  it("honours OH_RUNNER as the override channel", () => {
    const t = makeTask("ov");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}'`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        OH_RUNNER: "herdr",
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("requested explicitly but is unavailable");
  });

  it("hard-errors when tmux is requested but not installed", () => {
    const t = makeTask("ov");
    const bin = makeBin({ isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}' tmux`, {
      env: { PATH: bin.pathEnv, RUNNER_TMPDIR: t.runnerTmp },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("tmux is not installed");
  });

  it("always honours an explicit foreground request", () => {
    const t = makeTask("ov");
    const bin = makeBin({ isolated: true });
    const r = sh(`runner_detect ov '${t.worktree}' foreground`, {
      env: { PATH: bin.pathEnv, RUNNER_TMPDIR: t.runnerTmp },
    });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("foreground");
  });
});


describe("runner_launch", () => {
  it("parses the pane id out of the agent_started payload and exposes it via runner_pane_id", () => {
    const t = makeTask("launch");
    const bin = makeBin({ herdr: true, isolated: true });
    const r = sh(
      `runner_launch herdr launch '${t.worktree}' 'echo hi' >/dev/null 2>&1\nrunner_pane_id`,
      {
        env: {
          PATH: bin.pathEnv,
          RUNNER_TMPDIR: t.runnerTmp,
          STUB_CALLS: t.callsFile,
          STUB_HERDR_PANE_ID: "w9:p42",
        },
      },
    );
    expect(r.stdout.trim()).toBe("w9:p42");
  });

  it("passes --no-focus and never pipes the launched herdr command", () => {
    const t = makeTask("launch");
    const bin = makeBin({ herdr: true, isolated: true });
    sh(`runner_launch herdr launch '${t.worktree}' 'echo hi' >/dev/null 2>&1`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
      },
    });
    const start = readFileSync(t.callsFile, "utf-8")
      .split("\n")
      .find((l) => l.includes("agent start"));
    expect(start).toBeDefined();
    expect(start).toContain("--no-focus");
    expect(start).toContain("firstmate-launch");
    expect(start).not.toContain("| tee");
    expect(start).not.toContain("2>&1");
    expect(start).toContain(`cd ${t.worktree} &&`);
  });

  it("logs tmux via pipe-pane, unpiped, under the agent- category session name", () => {
    const t = makeTask("launch");
    const bin = makeBin({ tmux: true, isolated: true });
    sh(`runner_launch tmux launch '${t.worktree}' 'echo hi' >/dev/null 2>&1`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
      },
    });
    const call = readFileSync(t.callsFile, "utf-8")
      .split("\n")
      .find((l) => l.includes("new-session"));
    expect(call).toBeDefined();
    expect(call).toContain("-s agent-firstmate-launch");
    expect(call).toContain(`-c ${t.worktree}`);
    expect(call).not.toContain("| tee");
    const pipePane = readFileSync(t.callsFile, "utf-8")
      .split("\n")
      .find((l) => l.includes("pipe-pane"));
    expect(pipePane).toBeDefined();
    expect(pipePane).toContain("-t agent-firstmate-launch");
    expect(pipePane).toContain(`${t.runnerTmp}/agent-firstmate-launch.log`);
  });

  it("lets the foreground child inherit stdio and writes no session log", () => {
    const t = makeTask("launch");
    const r = sh(
      `runner_launch foreground launch '${t.worktree}' 'echo hello-foreground' 2>/dev/null\nwait "$RUNNER_FG_PID"`,
      { env: { PATH: process.env.PATH, RUNNER_TMPDIR: t.runnerTmp } },
    );
    expect(r.stdout).toContain("hello-foreground");
    const narrative = existsSync(`${t.runnerTmp}/firstmate-launch.log`)
      ? readFileSync(`${t.runnerTmp}/firstmate-launch.log`, "utf-8")
      : "";
    expect(narrative).not.toContain("hello-foreground");
    expect(narrative).toContain("stdio inherited; no session log");
  });

  it("fails loudly when herdr agent start returns no pane id", () => {
    const t = makeTask("launch");
    const bin = makeBin({ herdr: true, isolated: true });
    const r = sh(`runner_launch herdr launch '${t.worktree}' 'echo hi'`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_HERDR_START_FAIL: "1",
      },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("returned no pane id");
  });
});


describe("pane id provenance", () => {
  it("feeds the SAME captured pane id to runner_verify_cwd, the watch, and teardown", () => {
    const t = makeTask("pane", "# progress\nSTATUS: COMPLETE\n");
    const bin = makeBin({ herdr: true, isolated: true });
    const r = sh(
      [
        `runner_launch herdr pane '${t.worktree}' 'echo hi' >/dev/null 2>&1`,
        `runner_verify_cwd herdr '${t.worktree}' && echo VERIFY_OK`,
        `runner_watch herdr pane '${t.taskDir}' >/dev/null 2>&1 && echo WATCH_OK`,
        `runner_teardown herdr pane >/dev/null 2>&1`,
      ].join("\n"),
      {
        env: {
          PATH: bin.pathEnv,
          RUNNER_TMPDIR: t.runnerTmp,
          STUB_CALLS: t.callsFile,
          STUB_HERDR_PANE_ID: "w9:p42",
          STUB_HERDR_FG_CWD: t.worktree,
        },
      },
    );
    expect(r.stdout).toContain("VERIFY_OK");
    expect(r.stdout).toContain("WATCH_OK");

    const calls = readFileSync(t.callsFile, "utf-8");
    expect(calls).toMatch(/herdr wait output w9:p42 --match \^STATUS: COMPLETE\$/);
    expect(calls).toContain("herdr pane close w9:p42");
  });

  it("rejects a pane that landed in a different cwd instead of loosening the check", () => {
    const t = makeTask("pane");
    const bin = makeBin({ herdr: true, isolated: true });
    const r = sh(
      `runner_launch herdr pane '${t.worktree}' 'echo hi' >/dev/null 2>&1\nrunner_verify_cwd herdr '${t.worktree}'`,
      {
        env: {
          PATH: bin.pathEnv,
          RUNNER_TMPDIR: t.runnerTmp,
          STUB_CALLS: t.callsFile,
          STUB_HERDR_FG_CWD: "/home/someone-else",
        },
      },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("executing in a different environment");
  });
});


describe("runner_alive", () => {
  it("uses `herdr agent get`'s exit code as the herdr-mode oracle", () => {
    const t = makeTask("alive");
    const bin = makeBin({ herdr: true, isolated: true });
    const env = {
      PATH: bin.pathEnv,
      RUNNER_TMPDIR: t.runnerTmp,
      STUB_CALLS: t.callsFile,
    };
    const live = sh(`runner_alive herdr alive && echo LIVE`, {
      env: { ...env, STUB_HERDR_AGENT_LIVE: "1" },
    });
    expect(live.stdout).toContain("LIVE");
    expect(readFileSync(t.callsFile, "utf-8")).toContain(
      "herdr agent get firstmate-alive",
    );

    const gone = sh(`runner_alive herdr alive || echo GONE`, {
      env: { ...env, STUB_HERDR_AGENT_LIVE: "0" },
    });
    expect(gone.stdout).toContain("GONE");
  });

  it("uses `tmux has-session` as the tmux-mode oracle", () => {
    const t = makeTask("alive");
    const bin = makeBin({ tmux: true, isolated: true });
    const env = {
      PATH: bin.pathEnv,
      RUNNER_TMPDIR: t.runnerTmp,
      STUB_CALLS: t.callsFile,
    };
    const live = sh(`runner_alive tmux alive && echo LIVE`, {
      env: { ...env, STUB_TMUX_HAS_SESSION: "0" },
    });
    expect(live.stdout).toContain("LIVE");
    expect(readFileSync(t.callsFile, "utf-8")).toContain(
      "tmux has-session -t agent-firstmate-alive",
    );

    const gone = sh(`runner_alive tmux alive || echo GONE`, {
      env: { ...env, STUB_TMUX_HAS_SESSION: "1" },
    });
    expect(gone.stdout).toContain("GONE");
  });
});


describe("runner_teardown", () => {
  it("closes the pane in herdr mode, recovering the id from the server when it has none", () => {
    const t = makeTask("down");
    const bin = makeBin({ herdr: true, isolated: true });
    sh(`runner_teardown herdr down >/dev/null 2>&1`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_HERDR_PANE_ID: "w3:p8",
      },
    });
    const calls = readFileSync(t.callsFile, "utf-8");
    expect(calls).toContain("herdr agent get firstmate-down");
    expect(calls).toContain("herdr pane close w3:p8");
    expect(calls).not.toContain("agent stop");
    expect(calls).not.toContain("agent kill");
  });

  it("kills the agent- session in tmux mode", () => {
    const t = makeTask("down");
    const bin = makeBin({ tmux: true, isolated: true });
    sh(`runner_teardown tmux down >/dev/null 2>&1`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
      },
    });
    expect(readFileSync(t.callsFile, "utf-8")).toContain(
      "tmux kill-session -t agent-firstmate-down",
    );
  });
});


describe("runner_watch", () => {
  it("returns success as soon as the whole-line sentinel is in progress.txt", () => {
    const t = makeTask("watch", "# progress\nSTATUS: COMPLETE\n");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_watch tmux watch '${t.taskDir}' && echo DONE`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        RUNNER_POLL_INTERVAL_S: "0.2",
      },
    });
    expect(r.stdout).toContain("DONE");
  });

  it("on budget expiry: tears down, removes the lock, and appends FIRSTMATE-INCOMPLETE", () => {
    const t = makeTask("watch");
    const bin = makeBin({ tmux: true, isolated: true });
    mkdirSync(t.lock);
    const r = sh(
      `runner_watch tmux watch '${t.taskDir}'; echo "RC=$?"\n[ -d '${t.lock}' ] && echo LOCK_PRESENT || echo LOCK_GONE`,
      {
        env: {
          PATH: bin.pathEnv,
          RUNNER_TMPDIR: t.runnerTmp,
          STUB_CALLS: t.callsFile,
          STUB_TMUX_HAS_SESSION: "0",
          FIRSTMATE_TIMEOUT_MS: "1000",
          RUNNER_POLL_INTERVAL_S: "0.2",
        },
        timeoutMs: 30_000,
      },
    );
    expect(r.stdout).toContain("RC=1");
    expect(r.stdout).toContain("LOCK_GONE");
    expect(readFileSync(t.progressFile, "utf-8")).toContain(
      "FIRSTMATE-INCOMPLETE",
    );
    expect(readFileSync(t.progressFile, "utf-8")).toContain(
      "session budget of 1000ms expired",
    );
    expect(readFileSync(t.callsFile, "utf-8")).toContain(
      "tmux kill-session -t agent-firstmate-watch",
    );
  });

  it("treats death without the sentinel as FIRSTMATE-INCOMPLETE too", () => {
    const t = makeTask("watch");
    const bin = makeBin({ tmux: true, isolated: true });
    mkdirSync(t.lock);
    const r = sh(`runner_watch tmux watch '${t.taskDir}'; echo "RC=$?"`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_TMUX_HAS_SESSION: "1",
        RUNNER_POLL_INTERVAL_S: "0.2",
      },
      timeoutMs: 30_000,
    });
    expect(r.stdout).toContain("RC=1");
    expect(readFileSync(t.progressFile, "utf-8")).toContain(
      "session ended without STATUS: COMPLETE",
    );
  });

  it("bounds the tmux/foreground poll loop by the resolved budget", () => {
    const t = makeTask("watch");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_watch tmux watch '${t.taskDir}'; echo "RC=$?"`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_TMUX_HAS_SESSION: "0",
        FIRSTMATE_TIMEOUT_MS: "2000",
        RUNNER_POLL_INTERVAL_S: "0.2",
      },
      timeoutMs: 60_000,
    });
    expect(r.stdout).toContain("RC=1");
    expect(r.ms).toBeLessThan(30_000);
  });

  it("does not expire instantly when FIRSTMATE_TIMEOUT_MS=0 is rejected", () => {
    const t = makeTask("watch");
    const bin = makeBin({ tmux: true, isolated: true });
    const r = sh(`runner_watch tmux watch '${t.taskDir}'; echo "RC=$?"`, {
      env: {
        PATH: bin.pathEnv,
        RUNNER_TMPDIR: t.runnerTmp,
        STUB_CALLS: t.callsFile,
        STUB_TMUX_HAS_SESSION: "0",
        FIRSTMATE_TIMEOUT_MS: "0",
        RUNNER_POLL_INTERVAL_S: "0.2",
      },
      timeoutMs: 4_000,
    });
    expect(r.signal).not.toBeNull();
    expect(r.stdout).not.toContain("RC=");
    expect(readFileSync(t.progressFile, "utf-8")).not.toContain(
      "FIRSTMATE-INCOMPLETE",
    );
  });
});


describe("runner_abort", () => {
  it("removes the lock even when the task folder is missing", () => {
    const t = makeTask("abort");
    const bin = makeBin({ tmux: true, isolated: true });
    mkdirSync(t.lock);
    const r = sh(
      `runner_abort tmux abort '/nonexistent/task' 'launch failure' >/dev/null 2>&1\n[ -d '${t.lock}' ] && echo LOCK_PRESENT || echo LOCK_GONE`,
      {
        env: {
          PATH: bin.pathEnv,
          RUNNER_TMPDIR: t.runnerTmp,
          STUB_CALLS: t.callsFile,
        },
      },
    );
    expect(r.stdout).toContain("LOCK_GONE");
  });
});


describe("sourcing is option-neutral", () => {
  for (const [label, prelude] of [
    ["a strict caller", "set -euo pipefail"],
    ["a non-strict caller", "set +e +u +o pipefail"],
  ] as const) {
    it(`leaves ${label}'s options untouched`, () => {
      const r = spawnSync(
        BASH,
        [
          "-c",
          [
            prelude,
            `before="$-|$(set +o | tr '\\n' ';')"`,
            `source '${LIB}'`,
            `after="$-|$(set +o | tr '\\n' ';')"`,
            `[ "$before" = "$after" ] && echo SAME || { echo "DIFFERENT"; echo "before=$before"; echo "after=$after"; }`,
          ].join("\n"),
        ],
        { encoding: "utf-8" },
      );
      expect(r.stdout).toContain("SAME");
      expect(r.status).toBe(0);
    });
  }
});


describe("session-runner.sh static contract", () => {
  it("defines the five public ladder functions", () => {
    for (const fn of [
      "runner_detect",
      "runner_launch",
      "runner_verify_cwd",
      "runner_alive",
      "runner_teardown",
    ]) {
      expect(LIB_SOURCE).toMatch(new RegExp(`^${fn}\\(\\)`, "m"));
    }
  });

  it("sets no shell options at file scope", () => {
    const offenders = LIB_SOURCE.split("\n").filter((l) => /^set\s/.test(l));
    expect(offenders).toEqual([]);
  });

  it("carries the caller-owns-shell-options contract in its header", () => {
    expect(LIB_SOURCE).toContain(
      "THE CALLER OWNS SHELL OPTIONS; THIS LIBRARY MUST NOT MUTATE THEM",
    );
  });

  it("contains none of the forbidden herdr commands", () => {
    for (const forbidden of [
      "herdr server stop",
      "herdr update",
      "herdr channel set",
      "~/.config/herdr",
    ]) {
      expect(LIB_SOURCE).not.toContain(forbidden);
    }
  });

  it("uses `herdr agent get` (the liveness oracle) and `pane close` (the only teardown verb)", () => {
    expect(LIB_SOURCE).toContain("herdr agent get");
    expect(LIB_SOURCE).toContain("herdr pane close");
    expect(LIB_SOURCE).not.toMatch(/herdr agent (stop|kill)/);
  });

  it("pins the two literal herdr health fields and the 4h budget default", () => {
    expect(LIB_SOURCE).toContain("status: running");
    expect(LIB_SOURCE).toContain("compatible: yes");
    expect(LIB_SOURCE).toContain("RUNNER_DEFAULT_TIMEOUT_MS=14400000");
  });
});
