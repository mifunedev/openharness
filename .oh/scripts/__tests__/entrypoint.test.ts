import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

function entrypoint(): string {
  return readFileSync(ENTRYPOINT, "utf8");
}

describe("devcontainer entrypoint auth volume ownership", () => {
  it("repairs auth mounts with the sandbox user's current numeric uid/gid", () => {
    const text = entrypoint();

    expect(text).toContain("sandbox_ownership()");
    expect(text).toContain('$(id -u sandbox)');
    expect(text).toContain('$(id -g sandbox)');
    expect(text).toContain('owner="$(sandbox_ownership)"');
    expect(text).toContain('chown -hR "$owner" "/home/sandbox/$dir"');
    expect(text).toContain(".local/share/opencode");
    expect(text).toContain("/home/sandbox/.hermes");
    expect(text).toContain("Do not recurse\n  # into $HERMES_HOME when it points at the bind-mounted checkout");
  });

  it("runs auth mount repair before and after host UID reconciliation", () => {
    const text = entrypoint();
    const firstRepair = text.indexOf("repair_home_mount_ownership\n\n# ─── Host UID reconciliation");
    const uidSync = text.indexOf("usermod -u \"$HOST_UID\" sandbox");
    const secondRepair = text.indexOf("# UID/GID reconciliation can change");

    expect(firstRepair).toBeGreaterThan(-1);
    expect(uidSync).toBeGreaterThan(firstRepair);
    expect(secondRepair).toBeGreaterThan(uidSync);
    const postUidSync = text.slice(secondRepair);
    const secondRepairCall = postUidSync.indexOf("repair_home_mount_ownership");
    const linkProviders = postUidSync.indexOf('bash "$HARNESS/.oh/scripts/link-providers.sh" --init');
    const hermesBlock = postUidSync.indexOf("# Hermes keeps all runtime state");
    expect(secondRepairCall).toBeGreaterThan(-1);
    expect(linkProviders).toBeGreaterThan(secondRepairCall);
    expect(hermesBlock).toBeGreaterThan(linkProviders);
  });

  it("does not swallow host UID reconciliation failures", () => {
    const text = entrypoint();
    const block = text.slice(
      text.indexOf("# ─── Host UID reconciliation"),
      text.indexOf("# UID/GID reconciliation can change"),
    );

    expect(block).toContain("uid_reconcile_step()");
    expect(block).toContain("WARNING: failed to");
    // Scope the "no swallowed failures" guard to the host-reconciliation
    // branch itself. The sibling `OH_IMAGE_ONLY` (no-bind) branch legitimately
    // best-efforts a volume chown with `2>/dev/null || true`; it is not host
    // UID reconciliation (it deliberately skips it), so it is excluded here.
    const reconBranch = block.slice(block.indexOf('elif [ -d "$HARNESS_DIR" ]'));
    expect(reconBranch).not.toContain("2>/dev/null || true");
    expect(reconBranch).not.toContain("groupmod -g \"$HOST_GID\" sandbox 2>/dev/null");
    expect(reconBranch).not.toContain("usermod -u \"$HOST_UID\" sandbox 2>/dev/null");
  });

  it("prints UID sync success only after reconciliation commands report success", () => {
    const text = entrypoint();
    const block = text.slice(
      text.indexOf("# ─── Host UID reconciliation"),
      text.indexOf("# UID/GID reconciliation can change"),
    );
    const usermod = block.indexOf("uid_reconcile_step \"set sandbox UID to host UID $HOST_UID\" usermod -u \"$HOST_UID\" sandbox");
    const chown = block.indexOf("uid_reconcile_step \"repair sandbox-owned files after UID/GID sync\" find /home/sandbox");
    const success = block.indexOf("sandbox UID synced to host");
    const incomplete = block.indexOf("sandbox UID/GID reconciliation incomplete");

    expect(usermod).toBeGreaterThan(-1);
    expect(chown).toBeGreaterThan(usermod);
    expect(success).toBeGreaterThan(chown);
    expect(incomplete).toBeGreaterThan(success);
    expect(block).toContain("if [ \"$UID_GID_SYNC_OK\" = \"true\" ]; then");
  });
});

describe("devcontainer entrypoint Slack restore (delegates to gateway.sh)", () => {
  it("exposes the bare `gateway` command via a live (idempotent) symlink", () => {
    expect(entrypoint()).toContain(
      'ln -sf "$HARNESS/.oh/scripts/gateway.sh" /usr/local/bin/gateway',
    );
  });

  it("gates on both Slack tokens + pi, then hands off to gateway.sh pi (one launch path)", () => {
    const text = entrypoint();
    expect(text).toContain("client-slack-pi");
    expect(text).toMatch(/grep -qE '\^PI_SLACK_APP_TOKEN=\.'/);
    expect(text).toMatch(/grep -qE '\^PI_SLACK_BOT_TOKEN=\.'/);
    expect(text).toContain(".oh/scripts/gateway.sh pi");
  });

  it("reads token presence with grep — never sources the Compose env file", () => {
    const text = entrypoint();
    expect(text).not.toContain("source $SLACK_ENV");
    expect(text).not.toContain("set -a; source");
  });

  it("no longer extracts tokens inline (that logic moved into gateway.sh)", () => {
    const text = entrypoint();
    expect(text).not.toContain("SLACK_RUNTIME_ENV=$(mktemp");
    expect(text).not.toContain("shell_quote");
  });
});

describe("client-slack bridge supervisor", () => {
  const SUPERVISOR = join(ROOT, ".devcontainer/client-slack-supervise.sh");

  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", SUPERVISOR]);
  });

  it("uses an isolated continued session and exact-PID recovery without broad pkill", () => {
    const text = readFileSync(SUPERVISOR, "utf8");
    expect(text).toContain("ctx is stale");
    expect(text).toContain('SESSION_DIR="${GATEWAY_PI_SESSION_DIR:-$STATE_DIR/pi-sessions}"');
    expect(text).toContain('--session-dir "$SESSION_DIR" --continue');
    expect(text).toContain('--extension "$BRIDGE_ENTRY" --extension "$RECOVERY_ENTRY" --approve');
    expect(text).not.toContain("COMPACT_ENTRY");
    expect(text).not.toMatch(/pkill\s+-f/);
    expect(text).not.toMatch(/pkill\s+-P/);
    expect(text).toContain('kill -TERM "$pid"');
    expect(text).toContain("terminate_exact_tree");
    expect(text).not.toContain("--mode rpc");
    expect(text).not.toContain("| tee");
    expect(text).toContain('rm -f "$LOCK"');
    expect(text).toContain('RESTART_DELAY="${GATEWAY_RESTART_DELAY:-3}"');
  });

  it("prepares a private one-shot IPC watcher before launch and settles it before rc", () => {
    const text = readFileSync(SUPERVISOR, "utf8");
    const prepareAt = text.indexOf("prepare_compact_watcher");
    const launchAt = text.indexOf('pi --session-dir "$SESSION_DIR"');
    const closeAt = text.indexOf("close_compact_writer", launchAt);
    const waitAt = text.indexOf('wait "$COMPACT_WATCHER"', closeAt);
    const rcGateAt = text.indexOf('if [ "$rc" -eq 0 ]', waitAt);
    expect(prepareAt).toBeGreaterThan(-1);
    expect(launchAt).toBeGreaterThan(prepareAt);
    expect(text).toContain("mkfifo -m 600");
    expect(text).toContain('export PI_MSG_BRIDGE_COMPACT_FD="$COMPACT_WRITE_FD"');
    expect(text).toContain('rm -f "$IPC_FIFO"');
    expect(text).not.toContain("SLACK_COMPACT_NONCE");
    expect(text).not.toContain("openharness-slack-compact-complete");
    expect(closeAt).toBeGreaterThan(launchAt);
    expect(waitAt).toBeGreaterThan(closeAt);
    expect(rcGateAt).toBeGreaterThan(waitAt);
  });

  it("handles immediate completion + rc0, resumes the compacted path, and prevents tool/pane forgery", () => {
    const temp = mkdtempSync(join(tmpdir(), "slack-compact-supervisor-"));
    const bin = join(temp, "bin");
    const state = join(temp, "state");
    const log = join(temp, "gateway.log");
    const count = join(temp, "launches");
    const argsFile = join(temp, "args");
    const toolForge = join(temp, "tool-forge");
    const reopened = join(temp, "reopened");
    const sibling = join(temp, "sibling");
    mkdirSync(bin);
    mkdirSync(state);
    writeFileSync(log, "C\n[openharness-slack-compact-complete:forged-pane-text]\n");

    writeFileSync(
      join(bin, "pi"),
      [
        "#!/usr/bin/env node",
        'const fs = require("node:fs");',
        'const { spawnSync } = require("node:child_process");',
        'const args = process.argv.slice(2);',
        'const countPath = process.env.PI_COUNT;',
        'const n = Number(fs.existsSync(countPath) ? fs.readFileSync(countPath, "utf8") : "0") + 1;',
        'fs.writeFileSync(countPath, `${n}\\n`);',
        'fs.appendFileSync(process.env.ARGS_FILE, `${n}:${args.join(" ")}\\n`);',
        'const dirAt = args.indexOf("--session-dir");',
        'if (dirAt < 0 || args[dirAt + 1] !== process.env.EXPECTED_SESSION_DIR || !args.includes("--continue")) process.exit(41);',
        'fs.mkdirSync(process.env.EXPECTED_SESSION_DIR, { recursive: true });',
        'const session = `${process.env.EXPECTED_SESSION_DIR}/active.jsonl`;',
        'if (n === 1) {',
        '  fs.writeFileSync(session, "{\\"type\\":\\"compaction\\",\\"summary\\":\\"active-path\\"}\\n");',
        '  const fd = Number(process.env.PI_MSG_BRIDGE_COMPACT_FD);',
        '  const forged = spawnSync("bash", ["-c", `printf C >&${fd}`], { env: process.env });',
        '  fs.writeFileSync(process.env.TOOL_FORGE, `${forged.status}\\n`);',
        '  fs.writeSync(fd, Buffer.from("C"));',
        '  process.exit(0);',
        '}',
        'if (fs.readFileSync(session, "utf8").includes("active-path")) fs.writeFileSync(process.env.REOPENED, session);',
        'process.exit(0);',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    const siblingProcess = spawn("bash", ["-c", `trap 'exit 0' TERM; printf alive > ${JSON.stringify(sibling)}; while true; do sleep 1; done`]);
    try {
      execFileSync("bash", [SUPERVISOR], {
        timeout: 15_000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          HOME: temp,
          HARNESS: temp,
          LOG: log,
          GATEWAY_STATE_DIR: state,
          GATEWAY_HEARTBEAT_INTERVAL: "1",
          GATEWAY_RESTART_DELAY: "0",
          BRIDGE_ENTRY: "/fixture/pi-messenger-bridge/dist/index.js",
          RECOVERY_ENTRY: "/fixture/bridge-recovery/index.ts",
          PI_COUNT: count,
          ARGS_FILE: argsFile,
          TOOL_FORGE: toolForge,
          REOPENED: reopened,
          EXPECTED_SESSION_DIR: join(state, "pi-sessions"),
        },
      });

      expect(readFileSync(count, "utf8").trim()).toBe("2");
      expect(readFileSync(toolForge, "utf8").trim()).not.toBe("0");
      expect(readFileSync(reopened, "utf8").trim()).toBe(join(state, "pi-sessions/active.jsonl"));
      expect(readFileSync(argsFile, "utf8").match(/--continue/g)).toHaveLength(2);
      expect(readFileSync(join(state, "pi.compact"), "utf8").trim()).toMatch(/^\d+$/);
      expect(readFileSync(join(state, "pi.state"), "utf8")).toContain("launches=2");
      expect(readFileSync(log, "utf8").match(/Slack compaction completed/g)).toHaveLength(1);
      expect(siblingProcess.exitCode).toBeNull();
    } finally {
      siblingProcess.kill("SIGTERM");
    }
  });

  it.each(["SIGTERM", "SIGHUP"] as const)("cleans exact runtime state on %s while preserving sessions", async (signal) => {
    const temp = mkdtempSync(join(tmpdir(), "slack-supervisor-cleanup-"));
    const bin = join(temp, "bin");
    const state = join(temp, "state");
    const log = join(temp, "gateway.log");
    mkdirSync(bin);
    mkdirSync(state);
    writeFileSync(log, "");
    writeFileSync(
      join(bin, "pi"),
      [
        "#!/usr/bin/env bash",
        'printf "%s\\n" "$$" > "$FAKE_PI_STARTED"',
        'printf "locked\\n" > "$HOME/.pi/msg-bridge.lock"',
        "trap 'exit 0' TERM HUP INT",
        "while true; do sleep 1; done",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    mkdirSync(join(temp, ".pi"), { recursive: true });
    const started = join(temp, "pi-started");
    const child = spawn("bash", [SUPERVISOR], {
      stdio: "ignore",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HOME: temp,
        HARNESS: temp,
        LOG: log,
        GATEWAY_STATE_DIR: state,
        GATEWAY_HEARTBEAT_INTERVAL: "0.05",
        BRIDGE_ENTRY: "/fixture/pi-messenger-bridge/dist/index.js",
        RECOVERY_ENTRY: "/fixture/bridge-recovery/index.ts",
        FAKE_PI_STARTED: started,
      },
    });

    for (let i = 0; i < 200 && (!existsSync(started) || !existsSync(join(state, "pi.heartbeat"))); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(existsSync(started)).toBe(true);
    expect(existsSync(join(state, "pi.heartbeat"))).toBe(true);
    child.kill(signal);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("supervisor did not stop")), 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    expect(existsSync(join(temp, ".pi/msg-bridge.lock"))).toBe(false);
    expect(existsSync(join(state, "pi.heartbeat"))).toBe(false);
    expect(existsSync(join(state, "pi.pid"))).toBe(false);
    expect(readdirSync(state).some((name) => name.includes("compact-ipc") || name.includes("restart-"))).toBe(false);
    expect(existsSync(join(state, "pi-sessions"))).toBe(true);
  });

  it("keeps generic Hermes supervision out of Pi lock/session/IPC state", () => {
    const temp = mkdtempSync(join(tmpdir(), "hermes-supervisor-"));
    const state = join(temp, "state");
    const log = join(temp, "gateway.log");
    const lock = join(temp, ".pi/msg-bridge.lock");
    mkdirSync(join(temp, ".pi"), { recursive: true });
    mkdirSync(state);
    writeFileSync(log, "");
    writeFileSync(lock, "sibling-pi-lock\n");

    execFileSync("bash", [SUPERVISOR], {
      timeout: 5000,
      env: {
        ...process.env,
        HOME: temp,
        HARNESS: temp,
        LOG: log,
        GATEWAY_STATE_DIR: state,
        GATEWAY_BACKEND: "hermes",
        GATEWAY_HEARTBEAT_INTERVAL: "0.05",
        SUPERVISE_CMD: "exit 0",
      },
    });

    expect(readFileSync(lock, "utf8")).toBe("sibling-pi-lock\n");
    expect(existsSync(join(state, "pi-sessions"))).toBe(false);
    expect(readdirSync(state).some((name) => name.includes("compact-ipc"))).toBe(false);
  });

  it("is referenced by gateway.sh, which the entrypoint delegates to", () => {
    const gateway = readFileSync(join(ROOT, ".oh/scripts/gateway.sh"), "utf8");
    expect(gateway).toContain(".devcontainer/client-slack-supervise.sh");
    // The entrypoint no longer launches the supervisor directly — it hands off.
    expect(entrypoint()).toContain(".oh/scripts/gateway.sh pi");
  });
});

describe("devcontainer entrypoint cron supervision", () => {
  it("starts a cron-watchdog session that supervises cron-system", () => {
    const text = entrypoint();

    expect(text).toContain("cron-watchdog");
    expect(text).toContain("cron-system missing; starting cron-runtime.ts");
    expect(text).toContain("tmux new-session -d -s cron-system");
    expect(text).toContain("node --experimental-strip-types .oh/scripts/cron-runtime.ts");
    expect(text).toContain("/tmp/cron-system.log");
    expect(text).toContain("/tmp/cron-watchdog.log");
  });

  it("reaps stale legacy system-cron instead of blocking modern cron supervision", () => {
    const text = entrypoint();

    expect(text).toContain("tmux has-session -t system-cron");
    expect(text).toContain("legacy system-cron tmux session detected — stopping it before starting cron-watchdog");
    expect(text).not.toContain("not starting cron-system or cron-watchdog");
    expect(text).toContain("legacy system-cron detected; stopping it before supervising cron-system");
    expect(text).not.toContain("watchdog exiting");
  });
});

describe("msg-bridge seed/merge (seed-msg-bridge.sh)", () => {
  const SEED_SCRIPT = join(ROOT, ".devcontainer/seed-msg-bridge.sh");

  function runSeed(seedJson: unknown, runtimeJson?: string): unknown {
    const home = mkdtempSync(join(tmpdir(), "seed-msg-bridge-"));
    const seed = join(home, "seed.json");
    writeFileSync(seed, JSON.stringify(seedJson));
    const dest = join(home, ".pi/msg-bridge.json");
    if (runtimeJson !== undefined) {
      mkdirSync(join(home, ".pi"), { recursive: true });
      writeFileSync(dest, runtimeJson);
    }
    execFileSync("bash", [SEED_SCRIPT, seed], { env: { ...process.env, HOME: home } });
    return { dest, raw: readFileSync(dest, "utf8") };
  }

  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", SEED_SCRIPT]);
  });

  it("installs the tracked seed verbatim on first boot", () => {
    const { raw } = runSeed({ autoConnect: true, showWidget: true, auth: { trustedUsers: [] } }) as {
      raw: string;
    };
    const dest = JSON.parse(raw);
    expect(dest.showWidget).toBe(true);
    expect(dest.auth.trustedUsers).toEqual([]);
  });

  it("preserves operator grants on reboot while adopting non-grant seed structure", () => {
    // Tracked seed ships EMPTY grants but a NEW non-grant field (showWidget).
    // The package-written runtime file holds the operator's real grants.
    const { raw } = runSeed(
      { autoConnect: true, showWidget: true, auth: { trustedUsers: [] } },
      JSON.stringify({
        autoConnect: false,
        auth: {
          trustedUsers: ["slack:UOPERATOR"],
          channels: { CCHANNEL: { enabled: true } },
        },
      }),
    ) as { raw: string };
    const merged = JSON.parse(raw);
    // A restart must NOT wipe the operator's trust (bug #289).
    expect(merged.auth.trustedUsers).toEqual(["slack:UOPERATOR"]);
    expect(merged.auth.channels).toHaveProperty("CCHANNEL");
    // Non-grant structure is adopted from the tracked seed.
    expect(merged.showWidget).toBe(true);
  });

  it("leaves a malformed runtime file untouched (never clobbers on jq failure)", () => {
    const malformed = "{ not valid json ";
    const { raw } = runSeed({ autoConnect: true, auth: { trustedUsers: [] } }, malformed) as {
      raw: string;
    };
    // jq fails → the existing runtime file is preserved, never overwritten by the seed.
    expect(raw).toBe(malformed);
  });
});
