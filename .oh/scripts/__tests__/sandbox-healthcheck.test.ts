import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "sandbox-healthcheck.sh");
const COMPOSE = join(ROOT, ".devcontainer", "docker-compose.yml");

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-healthcheck-"));
  const bin = join(dir, "bin");
  const harness = join(dir, "harness");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(harness, ".oh", "scripts"), { recursive: true });
  writeFileSync(join(harness, ".oh", "scripts", "cron-runtime.ts"), "// fixture\n");

  const systemctl = join(bin, "systemctl");
  writeFileSync(
    systemctl,
    `#!/usr/bin/env bash
if [ "$1" = "is-active" ]; then
  unit="\${*: -1}"
  case ",\${HEALTHCHECK_ACTIVE_UNITS:-},"  in
    *,"$unit",*) exit 0 ;;
    *) exit 1 ;;
  esac
fi
exit 1
`,
  );
  chmodSync(systemctl, 0o755);

  const tmux = join(bin, "tmux");
  writeFileSync(
    tmux,
    `#!/usr/bin/env bash
if [ "$1" = "has-session" ] && [ "$2" = "-t" ]; then
  target="\${3#=}"
  case ",\${HEALTHCHECK_TMUX_SESSIONS:-}," in
    *,"$target",*) exit 0 ;;
    *) exit 1 ;;
  esac
fi
exit 1
`,
  );
  chmodSync(tmux, 0o755);

  return { dir, bin, harness, tmux, systemctl };
}

const ALL_UNITS = "openharness-bootstrap.service,openharness-cron.service";

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

describe("sandbox healthcheck", () => {
  it("passes when both Open Harness systemd units are active", () => {
    const { harness, tmux, systemctl } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      SYSTEMCTL_BIN: systemctl,
      HEALTHCHECK_ACTIVE_UNITS: ALL_UNITS,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sandbox healthcheck ok");
  });

  it("fails when the cron service is not active", () => {
    const { harness, tmux, systemctl } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      SYSTEMCTL_BIN: systemctl,
      HEALTHCHECK_ACTIVE_UNITS: "openharness-bootstrap.service",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("systemd unit not active: openharness-cron.service");
  });

  it("fails when the bootstrap oneshot is not active", () => {
    const { harness, tmux, systemctl } = fixture();

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      SYSTEMCTL_BIN: systemctl,
      HEALTHCHECK_ACTIVE_UNITS: "openharness-cron.service",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("systemd unit not active: openharness-bootstrap.service");
  });

  it("no longer requires any cron tmux session", () => {
    const script = readFileSync(SCRIPT, "utf8");

    for (const retired of ["cron-watchdog", "cron-system", "system-cron"]) {
      expect(script).not.toContain(retired);
    }
  });

  it("checks optional Hermes dashboard only when enabled in oh.json and installed", () => {
    const { bin, harness, tmux, systemctl } = fixture();
    const hermes = join(bin, "hermes");
    writeFileSync(hermes, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(hermes, 0o755);
    writeFileSync(
      join(harness, "oh.json"),
      `${JSON.stringify({ version: 1, name: "demo", hermesDashboard: { enabled: true } })}\n`,
    );

    const result = runHealthcheck({
      HARNESS: harness,
      TMUX_BIN: tmux,
      HERMES_BIN: hermes,
      SYSTEMCTL_BIN: systemctl,
      HEALTHCHECK_ACTIVE_UNITS: ALL_UNITS,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required tmux session: app-hermes-dashboard");
  });

  it("checks Slack session when Slack credentials are configured", () => {
    const { bin, harness, tmux, systemctl } = fixture();
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
      SYSTEMCTL_BIN: systemctl,
      HEALTHCHECK_ACTIVE_UNITS: ALL_UNITS,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing required tmux session: client-slack-pi");
  });

  it("is wired into the devcontainer compose healthcheck", () => {
    const compose = readFileSync(COMPOSE, "utf8");

    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("/home/sandbox/harness/.oh/scripts/sandbox-healthcheck.sh");
    const startPeriod = /start_period: (\d+)s/.exec(compose);
    expect(startPeriod, "compose declares no healthcheck start_period").not.toBeNull();
    expect(Number(startPeriod![1])).toBeGreaterThanOrEqual(600);
  });

  it("delegates tmux checks to the sandbox user when Docker invokes as root", () => {
    const script = readFileSync(SCRIPT, "utf8");

    expect(script).toContain('gosu sandbox "$TMUX_BIN" "$@"');
    expect(script).toContain('id sandbox >/dev/null');
    expect(script).toContain('has-session -t "=$1"');
  });
});
