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

  it("matches session names EXACTLY (no client-slack-hermes prefix collision)", () => {
    // grep -Fxq guards against `has-session -t client-slack` prefix-matching the
    // sibling client-slack-hermes session.
    expect(gateway()).toContain("grep -Fxq");
    // No actual `tmux has-session` CALL (a comment may explain why we avoid it).
    expect(gateway()).not.toMatch(/^\s*tmux has-session/m);
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

    // Malicious tokens: a command-injection attempt + an embedded single quote.
    writeFileSync(
      join(harness, ".devcontainer", ".env"),
      ["PI_SLACK_APP_TOKEN=xapp token; touch $PWNED", "PI_SLACK_BOT_TOKEN=xoxb'quoted"].join("\n"),
    );
    // Versioned, non-secret bridge config gateway.sh seeds into ~/.pi.
    writeFileSync(
      join(harness, ".pi", "msg-bridge.json"),
      JSON.stringify({ autoConnect: true, auth: { trustedUsers: [] } }),
    );
    // gateway.sh invokes the real seed-msg-bridge.sh; copy it in.
    cpSync(
      join(ROOT, ".devcontainer/seed-msg-bridge.sh"),
      join(harness, ".devcontainer/seed-msg-bridge.sh"),
    );
    // Stub tmux: ls reports no sessions (so start proceeds); new-session captures
    // the launch command; pipe-pane/kill-session/has-session are no-ops.
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
    // pi stub: records the PI_SLACK_* values it actually received in its env.
    writeFileSync(
      join(bin, "pi"),
      `#!/usr/bin/env bash\nprintf 'PI_SLACK_APP_TOKEN=%s\nPI_SLACK_BOT_TOKEN=%s\n' "$PI_SLACK_APP_TOKEN" "$PI_SLACK_BOT_TOKEN" > "$PI_ENV_FILE"\n`,
      { mode: 0o755 },
    );
    // npm stub: gateway.sh npm-installs the bridge when missing; no-op here.
    writeFileSync(join(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    // Stub supervisor: the real one runs a restart loop (covered separately);
    // here it just exec's the pi stub once so we can inspect the env it got.
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

    // The captured tmux launch command must not carry raw token text in argv.
    const tmuxLines = readFileSync(tmuxArgs, "utf8").trim().split("\n");
    const tmuxCommand = tmuxLines[tmuxLines.length - 1] ?? "";
    expect(tmuxCommand).toContain("bash -c");
    expect(tmuxCommand).toContain("client-slack-supervise.sh");
    expect(tmuxCommand).not.toContain("xapp token; touch $PWNED");
    expect(tmuxCommand).not.toContain("xoxb'quoted");

    // Run that launch command: it sources the mode-600 env file, deletes it,
    // and exec's the supervisor → pi stub, which records the env it received.
    execFileSync("bash", ["-c", tmuxCommand], {
      env: {
        ...env,
        HOME: harness,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        PI_ENV_FILE: piEnv,
        PWNED: pwned,
      },
    });

    // Tokens round-trip to pi verbatim as data, and the injection never fired.
    expect(readFileSync(piEnv, "utf8")).toBe(
      ["PI_SLACK_APP_TOKEN=xapp token; touch $PWNED", "PI_SLACK_BOT_TOKEN=xoxb'quoted", ""].join("\n"),
    );
    expect(existsSync(pwned)).toBe(false);

    // The non-secret config was seeded into ~/.pi (tokens stay out of it).
    const seeded = join(home, ".pi/msg-bridge.json");
    expect(existsSync(seeded)).toBe(true);
    expect(readFileSync(seeded, "utf8")).toContain("autoConnect");
  });
});
