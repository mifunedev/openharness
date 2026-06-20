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
    const bin = join(temp, "bin");
    const tmuxArgs = join(temp, "tmux-args.txt");
    const piEnv = join(temp, "pi-env.txt");
    const pwned = join(temp, "pwned");
    mkdirSync(join(harness, ".devcontainer"), { recursive: true });
    mkdirSync(bin);
    writeFileSync(
      join(harness, ".devcontainer", ".env"),
      [
        "PI_SLACK_APP_TOKEN=xapp token; touch $PWNED",
        "PI_SLACK_BOT_TOKEN=xoxb'quoted",
      ].join("\n"),
    );
    writeFileSync(
      join(bin, "tmux"),
      `#!/usr/bin/env bash\nif [ "$1" = "has-session" ]; then exit 1; fi\nprintf '%s\n' "$@" > "$TMUX_ARGS_FILE"\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "pi"),
      `#!/usr/bin/env bash\nprintf 'PI_SLACK_APP_TOKEN=%s\nPI_SLACK_BOT_TOKEN=%s\n' "$PI_SLACK_APP_TOKEN" "$PI_SLACK_BOT_TOKEN" > "$PI_ENV_FILE"\n`,
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
          HOME: harness,
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

    const bridgeFile = join(harness, ".pi/msg-bridge.json");
    expect(existsSync(bridgeFile)).toBe(true);
    expect(readFileSync(bridgeFile, "utf8")).toContain("autoConnect");
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
