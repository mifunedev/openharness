import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const SCRIPT = join(ROOT, "scripts", "sandbox-healthcheck.sh");
const COMPOSE = join(ROOT, ".devcontainer", "docker-compose.yml");

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-healthcheck-"));
  const bin = join(dir, "bin");
  const harness = join(dir, "harness");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(harness, "scripts"), { recursive: true });
  writeFileSync(join(harness, "scripts", "cron-runtime.ts"), "// fixture\n");

  const tmux = join(bin, "tmux");
  writeFileSync(
    tmux,
    `#!/usr/bin/env bash
if [ "$1" = "has-session" ] && [ "$2" = "-t" ]; then
  case ",\${HEALTHCHECK_TMUX_SESSIONS:-}," in
    *,"$3",*) exit 0 ;;
    *) exit 1 ;;
  esac
fi
exit 1
`,
  );
  chmodSync(tmux, 0o755);

  return { dir, bin, harness, tmux };
}

function runHealthcheck(env: Record<string, string>) {
  return spawnSync("bash", [SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

function addSlackReadyFixture(harness: string) {
  const bridgeEntry = join(harness, ".pi", "bridge", "node_modules", "pi-messenger-bridge", "dist", "index.js");
  const bridgeConfig = join(harness, ".pi", "msg-bridge.json");
  const bridgeLog = join(harness, "client-slack.log");
  mkdirSync(join(bridgeEntry, ".."), { recursive: true });
  mkdirSync(join(bridgeConfig, ".."), { recursive: true });
  writeFileSync(bridgeEntry, "// bridge fixture\n");
  writeFileSync(bridgeConfig, "{}\n");
  writeFileSync(bridgeLog, "[Slack] Bot user ID: U123\n");
  return { bridgeEntry, bridgeConfig, bridgeLog };
}

describe("sandbox healthcheck", () => {
  it("passes when required cron tmux sessions are present", () => {
    const { harness, tmux } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sandbox healthcheck ok");
  });

  it("fails when cron-system is missing", () => {
    const { harness, tmux } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required tmux session: cron-system");
  });

  it("fails when legacy system-cron is present", () => {
    const { harness, tmux } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system,system-cron",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("legacy tmux session present: system-cron");
  });

  it("checks optional Hermes dashboard only when enabled and installed", () => {
    const { bin, harness, tmux } = fixture();
    const hermes = join(bin, "hermes");
    writeFileSync(hermes, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(hermes, 0o755);

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      HERMES_BIN: hermes,
      HERMES_DASHBOARD: "true",
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required tmux session: app-hermes-dashboard");
  });

  it("checks Slack session when Slack credentials are configured", () => {
    const { bin, harness, tmux } = fixture();
    const pi = join(bin, "pi");
    writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(pi, 0o755);
    mkdirSync(join(harness, ".devcontainer"), { recursive: true });
    writeFileSync(
      join(harness, ".devcontainer", ".env"),
      [
        ["PI_SLACK_APP_TOKEN", "xapp-test"].join("="),
        ["PI_SLACK_BOT_TOKEN", "xoxb-test"].join("="),
        "",
      ].join("\n"),
    );

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      PI_BIN: pi,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required tmux session: client-slack");
  });

  it("passes Slack readiness when configured bridge artifacts, session, and connect marker exist", () => {
    const { bin, harness, tmux } = fixture();
    const pi = join(bin, "pi");
    writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(pi, 0o755);
    const { bridgeEntry, bridgeConfig, bridgeLog } = addSlackReadyFixture(harness);

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      PI_BIN: pi,
      PI_SLACK_APP_TOKEN: "xapp-test",
      PI_SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_BRIDGE_ENTRY: bridgeEntry,
      SLACK_BRIDGE_CONFIG: bridgeConfig,
      SLACK_BRIDGE_LOG: bridgeLog,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system,client-slack",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sandbox healthcheck ok");
  });

  it("fails Slack readiness when the configured bridge entrypoint is missing", () => {
    const { bin, harness, tmux } = fixture();
    const pi = join(bin, "pi");
    writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(pi, 0o755);
    const { bridgeEntry, bridgeConfig, bridgeLog } = addSlackReadyFixture(harness);

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      PI_BIN: pi,
      PI_SLACK_APP_TOKEN: "xapp-test",
      PI_SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_BRIDGE_ENTRY: `${bridgeEntry}.missing`,
      SLACK_BRIDGE_CONFIG: bridgeConfig,
      SLACK_BRIDGE_LOG: bridgeLog,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system,client-slack",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing Slack bridge entrypoint");
  });

  it("fails Slack readiness on configured bridge auth/runtime failure signals", () => {
    const { bin, harness, tmux } = fixture();
    const pi = join(bin, "pi");
    writeFileSync(pi, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(pi, 0o755);
    const { bridgeEntry, bridgeConfig, bridgeLog } = addSlackReadyFixture(harness);
    writeFileSync(bridgeLog, "[bridge-supervisor] pi exited rc=1 — restarting in 3s\ninvalid_auth\n");

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      PI_BIN: pi,
      PI_SLACK_APP_TOKEN: "xapp-test",
      PI_SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_BRIDGE_ENTRY: bridgeEntry,
      SLACK_BRIDGE_CONFIG: bridgeConfig,
      SLACK_BRIDGE_LOG: bridgeLog,
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system,client-slack",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Slack bridge log contains startup/auth/runtime failure signal");
    expect(result.stderr).toContain("bridge has not reported Socket Mode readiness");
  });

  it("fails clearly when Slack bridge credentials are only partially configured", () => {
    const { harness, tmux } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      PI_SLACK_APP_TOKEN: "xapp-test",
      HEALTHCHECK_TMUX_SESSIONS: "cron-watchdog,cron-system",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Slack bridge partially configured");
  });

  it("is wired into the devcontainer compose healthcheck", () => {
    const compose = readFileSync(COMPOSE, "utf8");

    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("/home/sandbox/harness/scripts/sandbox-healthcheck.sh");
    expect(compose).toContain("start_period: 300s");
  });

  it("delegates tmux checks to the sandbox user when Docker invokes as root", () => {
    const script = readFileSync(SCRIPT, "utf8");

    expect(script).toContain('gosu sandbox "$TMUX_BIN" "$@"');
    expect(script).toContain('id sandbox >/dev/null');
  });
});
