import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

function realPiInstallation(): { cli: string; module: string } | undefined {
  const located = spawnSync("bash", ["-lc", "command -v pi"], { encoding: "utf8" });
  const command = located.status === 0 ? located.stdout.trim() : "";
  if (!command || !existsSync(command)) return undefined;
  const cli = realpathSync(command);
  const module = join(dirname(cli), "index.js");
  return existsSync(module) ? { cli: command, module } : undefined;
}

const REAL_PI = realPiInstallation();

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
    expect(text).toContain('setsid pi --session-dir "$SESSION_DIR"');
    expect(text).toContain('kill -TERM -- "-$pgid"');
    expect(text).toContain('kill -KILL -- "-$pgid"');
    expect(text).toContain("terminate_exact_group");
    expect(text).not.toContain("--mode rpc");
    expect(text).not.toContain("| tee");
    expect(text).toContain('rm -f "$LOCK"');
    expect(text).toContain('RESTART_DELAY="${GATEWAY_RESTART_DELAY:-3}"');
  });

  it.skipIf(!REAL_PI)(
    "uses real Pi CLI/SessionManager continuation across launches and caller cwd variance",
    async () => {
      const temp = mkdtempSync(join(tmpdir(), "real-pi-continuation-"));
      const harness = join(temp, "harness");
      const sessionDir = join(temp, "sessions");
      const firstCaller = join(temp, "caller-one");
      const secondCaller = join(temp, "caller-two");
      const probe = join(temp, "session-probe.ts");
      const observed = join(temp, "observed.jsonl");
      mkdirSync(harness);
      mkdirSync(firstCaller);
      mkdirSync(secondCaller);
      writeFileSync(
        probe,
        [
          'import { appendFileSync } from "node:fs";',
          "export default function (pi) {",
          '  pi.on("session_start", (_event, ctx) => {',
          "    appendFileSync(process.env.PI_SESSION_PROBE_OUT, `${JSON.stringify({ cwd: ctx.cwd, file: ctx.sessionManager.getSessionFile() })}\\n`);",
          "    ctx.shutdown();",
          "  });",
          "}",
          "",
        ].join("\n"),
      );

      const launch = (caller: string) =>
        spawnSync(
          "bash",
          [
            "-c",
            'cd "$1" && exec "$2" --mode rpc --session-dir "$3" --continue --extension "$4" --approve',
            "_",
            harness,
            REAL_PI!.cli,
            sessionDir,
            probe,
          ],
          {
            cwd: caller,
            encoding: "utf8",
            timeout: 10_000,
            env: { ...process.env, PI_SESSION_PROBE_OUT: observed, PI_OFFLINE: "1" },
          },
        );

      const { SessionManager } = (await import(pathToFileURL(REAL_PI!.module).href)) as any;
      const seeded = SessionManager.create(harness, sessionDir);
      const kept = seeded.appendMessage({ role: "user", content: "gateway request", timestamp: Date.now() });
      seeded.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: "gateway response" }],
        api: "test",
        provider: "test",
        model: "test",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      });
      const seededFile = seeded.getSessionFile();
      expect(seededFile).toBeTruthy();

      const first = launch(firstCaller);
      expect(first.status, first.stderr).toBe(0);
      const firstObservation = JSON.parse(readFileSync(observed, "utf8").trim());
      expect(firstObservation).toEqual({ cwd: harness, file: seededFile });

      const firstManager = SessionManager.open(firstObservation.file, sessionDir);
      firstManager.appendCompaction("real compacted gateway state", kept, 42);

      const second = launch(secondCaller);
      expect(second.status, second.stderr).toBe(0);
      const observations = readFileSync(observed, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(observations).toHaveLength(2);
      expect(observations[1]).toEqual({ cwd: harness, file: firstObservation.file });

      const continued = SessionManager.open(observations[1].file, sessionDir);
      expect(
        continued.getEntries().some(
          (entry: any) => entry.type === "compaction" && entry.summary === "real compacted gateway state",
        ),
      ).toBe(true);
    },
    30_000,
  );

  it(
    "pins Pi to the harness cwd while preserving inherited TTY descriptors in its isolated group",
    () => {
    const temp = mkdtempSync(join(tmpdir(), "pi-supervisor-tty-"));
    const harness = join(temp, "harness");
    const caller = join(temp, "other-cwd");
    const bin = join(temp, "bin");
    const state = join(temp, "state");
    const observed = join(temp, "observed");
    const log = join(temp, "gateway.log");
    mkdirSync(harness);
    mkdirSync(caller);
    mkdirSync(bin);
    mkdirSync(state);
    writeFileSync(log, "");
    writeFileSync(
      join(bin, "pi"),
      [
        "#!/usr/bin/env bash",
        'stdin_tty=no; stdout_tty=no; [ -t 0 ] && stdin_tty=yes; [ -t 1 ] && stdout_tty=yes',
        'printf "cwd=%s\\nstdin_tty=%s\\nstdout_tty=%s\\npid=%s\\npgid=%s\\n" "$PWD" "$stdin_tty" "$stdout_tty" "$$" "$(ps -o pgid= -p $$ | tr -d " ")" > "$OBSERVED"',
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    execFileSync("script", ["-qefc", `bash ${JSON.stringify(SUPERVISOR)}`, "/dev/null"], {
      cwd: caller,
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HOME: temp,
        HARNESS: harness,
        LOG: log,
        GATEWAY_STATE_DIR: state,
        GATEWAY_HEARTBEAT_INTERVAL: "1",
        BRIDGE_ENTRY: "/fixture/pi-messenger-bridge/dist/index.js",
        RECOVERY_ENTRY: "/fixture/bridge-recovery/index.ts",
        OBSERVED: observed,
      },
    });

    const values = Object.fromEntries(
      readFileSync(observed, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=", 2)),
    );
    expect(values.cwd).toBe(harness);
    expect(values.stdin_tty).toBe("yes");
    expect(values.stdout_tty).toBe("yes");
    expect(values.pgid).toBe(values.pid);
    },
    40_000,
  );

  it("prepares an exact-peer one-shot socket before launch and settles it before rc", () => {
    const text = readFileSync(SUPERVISOR, "utf8");
    const prepareAt = text.indexOf("prepare_compact_watcher");
    const readyAt = text.indexOf('wait_for_file "$IPC_READY"', prepareAt);
    const launchAt = text.indexOf('setsid pi --session-dir "$SESSION_DIR"');
    const waitAt = text.indexOf('wait "$COMPACT_WATCHER"', launchAt);
    const rcGateAt = text.indexOf('if [ "$rc" -eq 0 ]', waitAt);
    expect(prepareAt).toBeGreaterThan(-1);
    expect(readyAt).toBeGreaterThan(prepareAt);
    expect(launchAt).toBeGreaterThan(readyAt);
    expect(text).toContain("socket.SO_PEERCRED");
    expect(text).toContain("os.chmod(socket_path, 0o600)");
    expect(text).toContain('export PI_MSG_BRIDGE_COMPACT_SOCKET="$IPC_SOCKET"');
    expect(text).toContain("peer_ppid != supervisor_pid");
    expect(text).toContain("peer_pgid != peer_pid");
    expect(text).toContain("peer_sid != peer_pid");
    expect(text).not.toContain("PI_MSG_BRIDGE_COMPACT_FD");
    expect(text).not.toContain("SLACK_COMPACT_NONCE");
    expect(text).not.toContain("openharness-slack-compact-complete");
    expect(waitAt).toBeGreaterThan(launchAt);
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
    const descendantPidFile = join(temp, "descendant-pid");
    const forgeChild = join(temp, "forge-child.js");
    const piSibling = join(temp, "pi-sibling");
    const hermesSibling = join(temp, "hermes-sibling");
    mkdirSync(bin);
    mkdirSync(state);
    writeFileSync(log, "C\n[openharness-slack-compact-complete:forged-pane-text]\n");
    writeFileSync(
      forgeChild,
      [
        'const fs = require("node:fs");',
        'const net = require("node:net");',
        'const parentEnv = fs.readFileSync(`/proc/${process.ppid}/environ`, "utf8").split("\\0");',
        'const entry = parentEnv.find((value) => value.startsWith("PI_MSG_BRIDGE_COMPACT_SOCKET="));',
        'const socketPath = entry?.slice("PI_MSG_BRIDGE_COMPACT_SOCKET=".length);',
        'let procWrite = false;',
        'for (const fd of fs.readdirSync(`/proc/${process.ppid}/fd`)) {',
        '  try {',
        '    if (!fs.readlinkSync(`/proc/${process.ppid}/fd/${fd}`).startsWith("socket:")) continue;',
        '    const handle = fs.openSync(`/proc/${process.ppid}/fd/${fd}`, "w");',
        '    fs.writeSync(handle, Buffer.from("C"));',
        '    fs.closeSync(handle);',
        '    procWrite = true;',
        '  } catch {}',
        '}',
        'let socketAttempt = false;',
        'let finished = false;',
        'const finish = () => {',
        '  if (finished) return;',
        '  finished = true;',
        '  fs.writeFileSync(process.env.TOOL_FORGE, JSON.stringify({ discovered: Boolean(socketPath), procWrite, socketAttempt }));',
        '};',
        'if (!socketPath) { finish(); process.exit(2); }',
        'const client = net.createConnection({ path: socketPath });',
        'client.once("connect", () => { socketAttempt = true; client.end("C"); });',
        'client.once("error", finish);',
        'client.once("close", finish);',
        'setTimeout(() => { client.destroy(); finish(); }, 1000).unref();',
        '',
      ].join("\n"),
    );

    writeFileSync(
      join(bin, "pi"),
      [
        "#!/usr/bin/env node",
        'const fs = require("node:fs");',
        'const { spawn, spawnSync } = require("node:child_process");',
        'const net = require("node:net");',
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
        '  const socketPath = process.env.PI_MSG_BRIDGE_COMPACT_SOCKET;',
        '  if ((fs.statSync(socketPath).mode & 0o777) !== 0o600) process.exit(42);',
        '  const forged = spawnSync(process.execPath, [process.env.FORGE_CHILD], { env: { TOOL_FORGE: process.env.TOOL_FORGE } });',
        '  if (forged.status !== 0) process.exit(43);',
        '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);',
        '  const forgedTrigger = fs.existsSync(process.env.EXPECTED_RESTART_TRIGGER);',
        '  const forgeResult = JSON.parse(fs.readFileSync(process.env.TOOL_FORGE, "utf8"));',
        '  fs.writeFileSync(process.env.TOOL_FORGE, JSON.stringify({ ...forgeResult, forgedTrigger }));',
        '  const descendant = spawn("bash", ["-c", "trap \\\'\\\' TERM; while true; do sleep 1; done"], { stdio: "ignore" });',
        '  descendant.unref();',
        '  fs.writeFileSync(process.env.DESCENDANT_PID_FILE, `${descendant.pid}\\n`);',
        '  const client = net.createConnection({ path: socketPath });',
        '  client.once("connect", () => client.write("C"));',
        '  client.once("data", (reply) => process.exit(reply.toString() === "A" ? 0 : 45));',
        '  client.once("error", () => process.exit(44));',
        '} else {',
        '  if (fs.readFileSync(session, "utf8").includes("active-path")) fs.writeFileSync(process.env.REOPENED, session);',
        '  process.exit(0);',
        '}',
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    const piSiblingProcess = spawn("bash", [
      "-c",
      `exec -a pi bash -c 'trap "exit 0" TERM; printf alive > ${JSON.stringify(piSibling)}; while true; do sleep 1; done'`,
    ]);
    const hermesSiblingProcess = spawn("bash", [
      "-c",
      `exec -a hermes bash -c 'trap "exit 0" TERM; printf alive > ${JSON.stringify(hermesSibling)}; while true; do sleep 1; done'`,
    ]);
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
          FORGE_CHILD: forgeChild,
          EXPECTED_RESTART_TRIGGER: join(state, "pi.restart-trigger"),
          REOPENED: reopened,
          DESCENDANT_PID_FILE: descendantPidFile,
          EXPECTED_SESSION_DIR: join(state, "pi-sessions"),
        },
      });

      expect(readFileSync(count, "utf8").trim()).toBe("2");
      expect(JSON.parse(readFileSync(toolForge, "utf8"))).toEqual({
        discovered: true,
        procWrite: false,
        socketAttempt: true,
        forgedTrigger: false,
      });
      expect(readFileSync(reopened, "utf8").trim()).toBe(join(state, "pi-sessions/active.jsonl"));
      expect(readFileSync(argsFile, "utf8").match(/--continue/g)).toHaveLength(2);
      expect(existsSync(join(state, "pi.compact"))).toBe(false);
      expect(existsSync(join(state, "pi.state"))).toBe(false);
      expect(readFileSync(log, "utf8").match(/Slack compaction completed/g)).toHaveLength(1);
      const descendantPid = readFileSync(descendantPidFile, "utf8").trim();
      const descendantStat = `/proc/${descendantPid}/stat`;
      if (existsSync(descendantStat)) {
        expect(readFileSync(descendantStat, "utf8").split(" ")[2]).toBe("Z");
      }
      expect(piSiblingProcess.exitCode).toBeNull();
      expect(hermesSiblingProcess.exitCode).toBeNull();
      expect(readFileSync(piSibling, "utf8")).toBe("alive");
      expect(readFileSync(hermesSibling, "utf8")).toBe("alive");
    } finally {
      piSiblingProcess.kill("SIGTERM");
      hermesSiblingProcess.kill("SIGTERM");
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
    expect(existsSync(join(state, "pi.state"))).toBe(false);
    expect(existsSync(join(state, "pi.heartbeat"))).toBe(false);
    expect(existsSync(join(state, "pi.pid"))).toBe(false);
    expect(readdirSync(state).some((name) => name.includes("compact-ipc") || name.includes("restart-"))).toBe(false);
    expect(existsSync(join(state, "pi-sessions"))).toBe(true);
  });

  it(
    "kills the authenticated group on signal after its leader exits while preserving a sibling",
    async () => {
      const temp = mkdtempSync(join(tmpdir(), "slack-supervisor-leader-gone-"));
      const bin = join(temp, "bin");
      const state = join(temp, "state");
      const log = join(temp, "gateway.log");
      const leaderFile = join(temp, "leader-pid");
      const descendantFile = join(temp, "descendant-pid");
      const siblingReady = join(temp, "sibling-ready");
      mkdirSync(bin);
      mkdirSync(state);
      mkdirSync(join(temp, ".pi"), { recursive: true });
      writeFileSync(log, "");
      writeFileSync(
        join(bin, "pi"),
        [
          "#!/usr/bin/env bash",
          'printf "locked\\n" > "$HOME/.pi/msg-bridge.lock"',
          "bash -c 'trap \"\" TERM HUP INT; while true; do sleep 1; done' </dev/null >/dev/null 2>&1 &",
          'printf "%s\\n" "$!" > "$DESCENDANT_PID_FILE"',
          'printf "%s\\n" "$$" > "$LEADER_PID_FILE"',
          'attempts=200; while [ ! -s "$EXPECTED_PGID_FILE" ] && [ "$attempts" -gt 0 ]; do attempts=$((attempts - 1)); sleep 0.01; done',
          "exit 0",
          "",
        ].join("\n"),
        { mode: 0o755 },
      );

      const sibling = spawn("bash", [
        "-c",
        `trap 'exit 0' TERM; printf alive > ${JSON.stringify(siblingReady)}; while true; do sleep 1; done`,
      ]);
      const supervisor = spawn("bash", [SUPERVISOR], {
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
          LEADER_PID_FILE: leaderFile,
          DESCENDANT_PID_FILE: descendantFile,
          EXPECTED_PGID_FILE: join(state, "pi.pgid"),
        },
      });

      let descendantPid = "";
      const processState = (pid: string): string | undefined => {
        if (!/^\d+$/.test(pid)) return undefined;
        const statPath = `/proc/${pid}/stat`;
        if (!existsSync(statPath)) return undefined;
        const stat = readFileSync(statPath, "utf8");
        return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
      };
      try {
        for (
          let i = 0;
          i < 300 &&
          (!existsSync(leaderFile) ||
            !existsSync(descendantFile) ||
            !existsSync(join(state, "pi.heartbeat")) ||
            !existsSync(siblingReady));
          i += 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(existsSync(leaderFile)).toBe(true);
        expect(existsSync(descendantFile)).toBe(true);
        const leaderPid = readFileSync(leaderFile, "utf8").trim();
        descendantPid = readFileSync(descendantFile, "utf8").trim();

        for (let i = 0; i < 200 && ![undefined, "Z"].includes(processState(leaderPid)); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect([undefined, "Z"]).toContain(processState(leaderPid));
        expect(processState(descendantPid)).not.toBeUndefined();
        expect(processState(descendantPid)).not.toBe("Z");
        expect(supervisor.exitCode).toBeNull();

        // Preempt the normal post-wait group close while only the stubborn
        // descendant remains. Signal cleanup must trust the recorded PGID,
        // rather than returning early because leader validation now fails.
        supervisor.kill("SIGTERM");
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("supervisor did not stop")), 5000);
          supervisor.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        const descendantState = processState(descendantPid);
        expect([undefined, "Z"]).toContain(descendantState);
        expect(sibling.exitCode).toBeNull();
        expect(readFileSync(siblingReady, "utf8")).toBe("alive");
        expect(existsSync(join(temp, ".pi/msg-bridge.lock"))).toBe(false);
        for (const name of [
          "pi.state",
          "pi.heartbeat",
          "pi.pid",
          "pi.pgid",
          "pi.stale",
          "pi.compact",
          "pi.restart-trigger",
        ]) {
          expect(existsSync(join(state, name)), name).toBe(false);
        }
        expect(
          readdirSync(state).some(
            (name) => name.includes("compact-ipc") || name.includes("restart-claim"),
          ),
        ).toBe(false);
      } finally {
        if (supervisor.exitCode === null) supervisor.kill("SIGKILL");
        if (descendantPid && ![undefined, "Z"].includes(processState(descendantPid))) {
          process.kill(Number(descendantPid), "SIGKILL");
        }
        sibling.kill("SIGTERM");
      }
    },
    15_000,
  );

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
