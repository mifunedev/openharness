import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const GATEWAY = join(ROOT, ".oh/scripts/gateway.sh");
const BRIDGE_ARTIFACT_SMOKE = join(ROOT, ".oh/scripts/smoke-slack-bridge-artifact.sh");

function gateway(): string {
  return readFileSync(GATEWAY, "utf8");
}

describe("gateway client-session launcher", () => {
  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", GATEWAY]);
  });

  it("runs Pi under the self-healing supervisor with package-owned compact control", () => {
    expect(gateway()).toContain(".devcontainer/client-slack-supervise.sh");
    expect(gateway()).toContain('tmux new-session -d -c "$HARNESS" -s "$session"');
    expect(gateway()).toContain('cd \\"$HARNESS\\" || exit 1');
    expect(gateway()).not.toContain(".pi/slack-compact/index.ts");
    expect(gateway()).not.toContain("COMPACT_ENTRY");
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
    // grep -Fxq guards against `has-session -t client-slack` prefix-matching the
    // sibling client-slack-hermes session.
    expect(gateway()).toContain("grep -Fxq");
    // No actual `tmux has-session` CALL (a comment may explain why we avoid it).
    expect(gateway()).not.toMatch(/^\s*tmux has-session/m);
  });

  it("exposes a msg-bridge configuration entrypoint", () => {
    expect(gateway()).toContain("gateway msg-bridge");
    expect(gateway()).toContain("/msg-bridge");
  });

  it("reconciles the installed bridge when the reviewed fork pin changes", () => {
    expect(gateway()).toContain("a445513961af60b11f00d0ef9f55a58e5e14fabd");
    expect(gateway()).toContain(".openharness-pin");
    expect(gateway()).toContain('installed_pin" != "$FORK_PIN');
    expect(gateway()).toContain('printf \'%s\\n\' "$FORK_PIN" >"$bridge_pin_file"');
  });

  it(
    "installs the exact bridge artifact and runs its real extension lifecycle",
    async () => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn("bash", [BRIDGE_ARTIFACT_SMOKE], { stdio: "pipe" });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(`artifact smoke exited ${code ?? signal}: ${stderr}`));
        });
      });
    },
    310_000,
  );

  it("reports a recent compaction reconnect without exposing recovery nonce data", () => {
    const temp = mkdtempSync(join(tmpdir(), "gateway-status-"));
    const bin = join(temp, "bin");
    const state = join(temp, "state");
    mkdirSync(bin);
    mkdirSync(state);
    writeFileSync(
      join(bin, "tmux"),
      '#!/usr/bin/env bash\n[ "$1" = ls ] && printf "client-slack-pi\\n"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(state, "pi.state"),
      "backend=pi\nsession=client-slack-pi\nbridge_token=present\nlaunches=2\n",
    );
    const now = Math.floor(Date.now() / 1000).toString();
    writeFileSync(join(state, "pi.heartbeat"), `${now}\n`);
    writeFileSync(join(state, "pi.compact"), `${now}\n`);

    const output = execFileSync("bash", [GATEWAY, "status"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        GATEWAY_STATE_DIR: state,
      },
    });
    expect(output).toContain("client-slack-pi  healthy");
    expect(output).toContain("compaction reconnected");
    expect(output).not.toMatch(/[a-f0-9]{48}/);
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
    mkdirSync(join(harness, ".pi/bridge-recovery"), { recursive: true });
    writeFileSync(join(harness, ".pi/bridge-recovery/index.ts"), "// recovery fixture\n");
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
    // pi stub: records token values and package/recovery extension order.
    writeFileSync(
      join(bin, "pi"),
      [
        "#!/usr/bin/env bash",
        "printf 'PI_SLACK_APP_TOKEN=%s\\nPI_SLACK_BOT_TOKEN=%s\\nARGS=%s\\n' \\",
        "  \"$PI_SLACK_APP_TOKEN\" \"$PI_SLACK_BOT_TOKEN\" \"$*\" > \"$PI_ENV_FILE\"",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    // npm stub: gateway.sh npm-installs the bridge when missing; no-op here.
    writeFileSync(join(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    // Stub supervisor: the real one runs a restart loop (covered separately);
    // here it just exec's the pi stub once so we can inspect the env it got.
    writeFileSync(
      join(harness, ".devcontainer", "client-slack-supervise.sh"),
      [
        "#!/usr/bin/env bash",
        'exec pi --session-dir "${GATEWAY_STATE_DIR:-$HOME/.pi/gateway}/pi-sessions" --continue --extension "${BRIDGE_ENTRY:-x}" --extension "${RECOVERY_ENTRY:-y}" --approve',
        "",
      ].join("\n"),
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
    const recorded = readFileSync(piEnv, "utf8");
    expect(recorded).toContain("PI_SLACK_APP_TOKEN=xapp token; touch $PWNED\n");
    expect(recorded).toContain("PI_SLACK_BOT_TOKEN=xoxb'quoted\n");
    expect(recorded).toContain(
      `ARGS=--session-dir ${join(harness, ".pi/gateway/pi-sessions")} --continue --extension ${join(harness, ".pi/bridge/node_modules/pi-messenger-bridge/dist/index.js")} --extension ${join(harness, ".pi/bridge-recovery/index.ts")} --approve`,
    );
    expect(recorded).not.toContain("slack-compact");
    expect(recorded).not.toContain("NONCE");
    expect(existsSync(pwned)).toBe(false);

    // The non-secret config was seeded into ~/.pi (tokens stay out of it).
    const seeded = join(home, ".pi/msg-bridge.json");
    expect(existsSync(seeded)).toBe(true);
    expect(readFileSync(seeded, "utf8")).toContain("autoConnect");
  });
});
