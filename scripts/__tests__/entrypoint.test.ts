import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

function entrypoint(): string {
  return readFileSync(ENTRYPOINT, "utf8");
}

function entrypointFunction(name: string): string {
  const match = entrypoint().match(new RegExp(`${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}`));
  if (!match) {
    throw new Error(`missing ${name} function`);
  }
  return match[0];
}

function slackRestoreBlock(): string {
  const match = entrypoint().match(/# ─── Restore client-slack session[\s\S]*?\n# ─── Optional: agent-browser/);
  if (!match) {
    throw new Error("missing Slack restore block");
  }
  return match[0].replace(/\n# ─── Optional: agent-browser$/, "");
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
    expect(text.slice(secondRepair)).toContain("repair_home_mount_ownership\n\n# Hermes keeps all runtime state");
  });
});

describe("devcontainer entrypoint Slack restore", () => {
  it("starts Slack without sourcing the Compose env file", () => {
    const text = entrypoint();

    expect(text).not.toContain("source $SLACK_ENV");
    expect(text).not.toContain("set -a; source");
    expect(text).toContain("SLACK_RUNTIME_ENV=$(mktemp /tmp/client-slack-env.XXXXXX)");
    expect(text).toContain('printf \'PI_SLACK_APP_TOKEN=%s\\n\' "$(shell_quote "$PI_SLACK_APP_TOKEN")"');
    expect(text).toContain('printf \'PI_SLACK_BOT_TOKEN=%s\\n\' "$(shell_quote "$PI_SLACK_BOT_TOKEN")"');
    expect(text).toContain("chmod 600 \"$SLACK_RUNTIME_ENV\"");
    expect(text).toContain("bash -c");
    expect(text).toContain("/tmp/client-slack.log");
  });

  it("shell-quotes non-shell-safe Slack token values", () => {
    const fn = entrypointFunction("shell_quote");
    const token = "alpha beta; echo hacked 'quote'";
    const quoted = execFileSync("bash", ["-c", `${fn}\nshell_quote "$TOKEN"`], {
      encoding: "utf8",
      env: { ...process.env, TOKEN: token },
    });
    const roundTrip = execFileSync("bash", ["-c", 'eval "value=$QUOTED"; printf \'%s\' "$value"'], {
      encoding: "utf8",
      env: { ...process.env, QUOTED: quoted },
    });

    expect(roundTrip).toBe(token);
  });

  it("assembles Slack env from fixture data without evaluating it", () => {
    const temp = mkdtempSync(join(tmpdir(), "entrypoint-slack-"));
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
      [
        "PI_SLACK_APP_TOKEN=xapp token; touch $PWNED",
        "PI_SLACK_BOT_TOKEN=xoxb'quoted",
      ].join("\n"),
    );
    // Versioned, non-secret bridge config the entrypoint copies into ~/.pi.
    writeFileSync(
      join(harness, ".pi", "msg-bridge.json"),
      JSON.stringify({ autoConnect: true, auth: { trustedUsers: [] } }),
    );
    writeFileSync(
      join(bin, "tmux"),
      `#!/usr/bin/env bash\nif [ "$1" = "has-session" ]; then exit 1; fi\nif [ "$1" = "pipe-pane" ]; then exit 0; fi\nprintf '%s\n' "$@" > "$TMUX_ARGS_FILE"\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "pi"),
      `#!/usr/bin/env bash\nprintf 'PI_SLACK_APP_TOKEN=%s\nPI_SLACK_BOT_TOKEN=%s\n' "$PI_SLACK_APP_TOKEN" "$PI_SLACK_BOT_TOKEN" > "$PI_ENV_FILE"\n`,
      { mode: 0o755 },
    );
    // npm stub: the real entrypoint npm-installs the bridge here; it must not
    // run during the unit test.
    writeFileSync(join(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    // Stub supervisor: the entrypoint now exec's
    // $HARNESS/.devcontainer/client-slack-supervise.sh. The real script runs a
    // restart loop with a stale-ctx watchdog; this test only verifies that the
    // entrypoint sources the PI_SLACK_* env as data and hands off, so the stub
    // just exec's the pi stub once (no loop, no watchdog, no /tmp writes). The
    // real supervisor's behavior is covered by a separate content/parse test.
    writeFileSync(
      join(harness, ".devcontainer", "client-slack-supervise.sh"),
      '#!/usr/bin/env bash\nexec pi --extension "${BRIDGE_ENTRY:-x}" --extension "${RECOVERY_ENTRY:-y}" --approve\n',
      { mode: 0o755 },
    );

    execFileSync(
      "bash",
      [
        "-c",
        [
          "set -euo pipefail",
          entrypointFunction("sandbox_ownership"),
          entrypointFunction("shell_quote"),
          'gosu() { local user="$1"; shift; "$@"; }',
          slackRestoreBlock(),
        ].join("\n"),
      ],
      {
        env: {
          ...process.env,
          HOME: home,
          HARNESS: harness,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          TMUX_ARGS_FILE: tmuxArgs,
          PI_ENV_FILE: piEnv,
          PWNED: pwned,
        },
      },
    );

    const tmuxLines = readFileSync(tmuxArgs, "utf8").trim().split("\n");
    const tmuxCommand = tmuxLines[tmuxLines.length - 1] ?? "";
    expect(tmuxCommand).toContain("bash -c");
    expect(tmuxCommand).toContain("/tmp/client-slack.log");
    expect(tmuxCommand).not.toContain("xapp token; touch $PWNED");
    expect(tmuxCommand).not.toContain("xoxb'quoted");

    execFileSync("bash", ["-c", tmuxCommand], {
      env: {
        ...process.env,
        HOME: harness,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        PI_ENV_FILE: piEnv,
        PWNED: pwned,
      },
    });

    expect(readFileSync(piEnv, "utf8")).toBe(
      [
        "PI_SLACK_APP_TOKEN=xapp token; touch $PWNED",
        "PI_SLACK_BOT_TOKEN=xoxb'quoted",
        "",
      ].join("\n"),
    );
    expect(existsSync(pwned)).toBe(false);

    // The versioned config was copied into ~/.pi (tokens stay out of it).
    const seeded = join(home, ".pi/msg-bridge.json");
    expect(existsSync(seeded)).toBe(true);
    expect(readFileSync(seeded, "utf8")).toContain("autoConnect");
  });
});

describe("client-slack bridge supervisor", () => {
  const SUPERVISOR = join(ROOT, ".devcontainer/client-slack-supervise.sh");

  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", SUPERVISOR]);
  });

  it("restarts pi on stale-ctx and crash, clears the lock, stops on a clean exit", () => {
    const text = readFileSync(SUPERVISOR, "utf8");
    // Detects the pi "extension ctx is stale" failure and kills the bridge pi
    // (matched by its unique --extension path) so the loop relaunches it fresh.
    expect(text).toContain("ctx is stale");
    expect(text).toContain("pkill -f 'pi-messenger-bridge/dist/index.js'");
    // pi runs interactive on the pane TTY: no `| tee` pipe and no --mode rpc, so
    // the loaded UI extensions render instead of flooding stdout with JSON. A 2nd
    // --extension co-loads the Codex retry-recovery extension. Assert on the pi
    // command line itself so comment wording can't satisfy the negatives.
    const piLine = text.split("\n").find((l) => /^\s*pi --extension/.test(l)) ?? "";
    expect(piLine).toContain("--approve");
    expect(piLine).toContain('--extension "$RECOVERY_ENTRY"');
    expect(piLine).not.toContain("--mode rpc");
    expect(piLine).not.toContain("tee");
    expect(piLine).toContain('2>>"$LOG"');
    expect(text).toContain("bridge-recovery");
    expect(text).toContain("rc=$?");
    // Clears the single-instance lock before each (re)launch.
    expect(text).toContain('rm -f "$LOCK"');
    // A clean pi exit (rc=0) breaks the loop; anything else restarts.
    expect(text).toMatch(/\$rc"?\s+-eq\s+0/);
    expect(text).toContain("break");
    expect(text).toContain("restarting in 3s");
  });

  it("is referenced by the entrypoint's client-slack launch", () => {
    expect(entrypoint()).toContain(".devcontainer/client-slack-supervise.sh");
  });
});

describe("devcontainer entrypoint cron supervision", () => {
  it("starts a cron-watchdog session that supervises cron-system", () => {
    const text = entrypoint();

    expect(text).toContain("cron-watchdog");
    expect(text).toContain("cron-system missing; starting cron-runtime.ts");
    expect(text).toContain("tmux new-session -d -s cron-system");
    expect(text).toContain("node --experimental-strip-types scripts/cron-runtime.ts");
    expect(text).toContain("/tmp/cron-system.log");
    expect(text).toContain("/tmp/cron-watchdog.log");
  });

  it("reaps stale legacy system-cron instead of blocking modern cron supervision", () => {
    const text = entrypoint();

    expect(text).toContain("tmux has-session -t system-cron");
    expect(text).toContain("legacy system-cron tmux session detected — stopping it before starting cron-watchdog");
    expect(text).toContain("tmux kill-session -t system-cron");
    expect(text).toContain("legacy system-cron detected; stopping it before supervising cron-system");
    expect(text).not.toContain("not starting cron-system or cron-watchdog");
    expect(text).not.toContain("watchdog exiting");
  });
});
