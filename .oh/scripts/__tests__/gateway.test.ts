import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const GATEWAY = join(ROOT, ".oh/scripts/gateway.sh");

function gateway(): string {
  return readFileSync(GATEWAY, "utf8");
}

describe("gateway client-session launcher", () => {
  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", GATEWAY]);
  });

  it("runs the pi backend under the self-healing supervisor", () => {
    expect(gateway()).toContain(".devcontainer/client-slack-supervise.sh");
  });

  it("runs the hermes backend via `hermes gateway run`", () => {
    expect(gateway()).toContain("hermes gateway run");
  });

  it("pins the hermes backend to the harness runtime home and cwd", () => {
    expect(gateway()).toContain("HERMES_GATEWAY_HOME:-$HARNESS/.hermes");
    expect(gateway()).toContain("HERMES_GATEWAY_CWD:-$HARNESS");
    expect(gateway()).toContain("/usr/local/bin/hermes");
    expect(gateway()).toContain("ensure_hermes_gateway_cwd");
  });

  it("self-heals Hermes Teams gateway dependencies when Teams is configured", () => {
    expect(gateway()).toContain("microsoft-teams-apps==2.0.13.4");
    expect(gateway()).toContain("sync_hermes_teams_env_aliases");
  });

  it("matches session names EXACTLY (no client-slack-hermes prefix collision)", () => {
    expect(gateway()).toContain("grep -Fxq");
    expect(gateway()).not.toMatch(/^\s*tmux has-session/m);
  });

  it("exposes a msg-bridge configuration entrypoint", () => {
    expect(gateway()).toContain("gateway msg-bridge");
    expect(gateway()).toContain("/msg-bridge");
  });

  it("reconciles the installed bridge when the reviewed fork pin changes", () => {
    expect(gateway()).toContain("c8b96e9d0fb69611c4e67ae298d1d10d83792a26");
    expect(gateway()).toContain(".openharness-pin");
    expect(gateway()).toContain('installed_pin" != "$FORK_PIN');
    expect(gateway()).toContain('printf \'%s\\n\' "$FORK_PIN" >"$bridge_pin_file"');
  });
});

describe("gateway pi: launches client-slack-pi handling tokens as data", () => {
  it("hands the PI_SLACK_* tokens to the supervisor as data — never evaluates them", () => {
    const temp = mkdtempSync(join(tmpdir(), "gateway-pi-"));
    const harness = join(temp, "harness");
    const home = join(temp, "home");
    const bin = join(temp, "bin");
    const tmuxArgs = join(temp, "tmux-args.txt");
    const piEnv = join(temp, "pi-env.txt");
    const pwned = join(temp, "pwned");
    mkdirSync(join(harness, ".devcontainer"), { recursive: true });
    mkdirSync(join(harness, ".pi"), { recursive: true });
    mkdirSync(home, { recursive: true });
    mkdirSync(bin);

    writeFileSync(
      join(harness, ".devcontainer", ".env"),
      ["PI_SLACK_APP_TOKEN=xapp token; touch $PWNED", "PI_SLACK_BOT_TOKEN=xoxb'quoted"].join("\n"),
    );
    writeFileSync(
      join(harness, ".pi", "msg-bridge.json"),
      JSON.stringify({ autoConnect: true, auth: { trustedUsers: [] } }),
    );
    cpSync(
      join(ROOT, ".devcontainer/seed-msg-bridge.sh"),
      join(harness, ".devcontainer/seed-msg-bridge.sh"),
    );
    writeFileSync(
      join(bin, "tmux"),
      [
        "#!/usr/bin/env bash",
        'case "$1" in',
        "  ls) exit 0 ;;",
        "  has-session) exit 1 ;;",
        "  pipe-pane) exit 0 ;;",
        "  kill-session) exit 0 ;;",
        "esac",
        "printf '%s\\n' \"$@\" > \"$TMUX_ARGS_FILE\"",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "pi"),
      `#!/usr/bin/env bash\nprintf 'PI_SLACK_APP_TOKEN=%s\nPI_SLACK_BOT_TOKEN=%s\n' "$PI_SLACK_APP_TOKEN" "$PI_SLACK_BOT_TOKEN" > "$PI_ENV_FILE"\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    writeFileSync(
      join(harness, ".devcontainer", "client-slack-supervise.sh"),
      '#!/usr/bin/env bash\nexec pi --extension "${BRIDGE_ENTRY:-x}" --extension "${RECOVERY_ENTRY:-y}" --approve\n',
      { mode: 0o755 },
    );

    const env = { ...process.env };
    delete env.PI_SLACK_APP_TOKEN;
    delete env.PI_SLACK_BOT_TOKEN;

    execFileSync("bash", [GATEWAY, "pi"], {
      env: {
        ...env,
        HOME: home,
        HARNESS: harness,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        TMUX_ARGS_FILE: tmuxArgs,
        PI_ENV_FILE: piEnv,
        PWNED: pwned,
      },
    });

    const tmuxLines = readFileSync(tmuxArgs, "utf8").trim().split("\n");
    const tmuxCommand = tmuxLines[tmuxLines.length - 1] ?? "";
    expect(tmuxCommand).toContain("bash -c");
    expect(tmuxCommand).toContain("client-slack-supervise.sh");
    expect(tmuxCommand).not.toContain("xapp token; touch $PWNED");
    expect(tmuxCommand).not.toContain("xoxb'quoted");

    execFileSync("bash", ["-c", tmuxCommand], {
      env: {
        ...env,
        HOME: harness,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        PI_ENV_FILE: piEnv,
        PWNED: pwned,
      },
    });

    expect(readFileSync(piEnv, "utf8")).toBe(
      ["PI_SLACK_APP_TOKEN=xapp token; touch $PWNED", "PI_SLACK_BOT_TOKEN=xoxb'quoted", ""].join("\n"),
    );
    expect(existsSync(pwned)).toBe(false);

    const seeded = join(home, ".pi/msg-bridge.json");
    expect(existsSync(seeded)).toBe(true);
    expect(readFileSync(seeded, "utf8")).toContain("autoConnect");
  });
});
