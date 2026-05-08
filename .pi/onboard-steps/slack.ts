/**
 * Slack onboard step — Pi extension.
 * Adapted from mifune/onboard-steps/slack.ts.
 *
 * Responsibilities, top to bottom:
 *   1. Load Slack tokens from host `~/harness/.devcontainer/.env` into
 *      deps.env if missing.
 *   2. If tokens missing, prompt + collect, persist to
 *      `~/harness/.devcontainer/.env`.
 *      Required env vars:
 *        SLACK_APP_TOKEN  — App-Level Token (xapp-...)
 *        SLACK_BOT_TOKEN  — Bot Token (xoxb-...)
 *      Optional env vars:
 *        SLACK_ALLOW_CHANNELS — comma-separated channel IDs to restrict intake
 *        SLACK_ALLOW_USERS    — comma-separated Slack user IDs to restrict intake
 *   3. Bootstrap `~/.openharness/agent/{settings,auth}.json` symlinks from
 *      `~/.pi/agent/…` (best-effort, Pi-aware).
 *   4. Ensure the Slack extension has LLM auth via `~/.pi/slack/auth.json`
 *      symlink (shared with Pi agent key store).
 *   5. Detect an already-running tmux `slack` session → done.
 *   6. Otherwise (re)start tmux session, poll up to 15 s for
 *      "connected and listening" (done) or an error (failed).
 *
 * NOTE: The Slack extension now lives inside Pi — the user starts Pi normally
 * (`pi` or `claude`). There is no separate `mom`/`pi-mom` binary. The tmux
 * session launched here runs the extension entrypoint directly.
 */

import { loadEnvInto, upsertEnvFile } from "../env.js";
import type { Deps, Step, StepResult, StepStatus } from "../types.js";

const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 1000;
const CONNECTED_MARKER = "connected and listening";
const ERROR_MARKERS = [/Run error/, /Error/, /Missing env/];

export const slackStep: Step = {
  id: "slack",
  label: "Slack Extension — Pi",
  async run(deps): Promise<StepResult> {
    const { io, fs, home, env } = deps;
    const hostEnvPath = `${home}/harness/.devcontainer/.env`;

    if (!env.SLACK_APP_TOKEN) {
      loadEnvInto(fs, hostEnvPath, env);
    }

    let appToken = env.SLACK_APP_TOKEN ?? "";
    let botToken = env.SLACK_BOT_TOKEN ?? "";
    let promptedSkip = false;

    if (appToken && botToken) {
      io.ok("Slack tokens detected from environment");
    } else {
      const setup = await io.ask("Set up Slack extension for Pi? [y/N]:");
      if (!/^[Yy]$/.test(setup)) {
        io.skip("Skipped — re-run onboard with --force later to set up Slack");
        promptedSkip = true;
      } else {
        printSlackAppInstructions(deps);
        appToken = (await io.ask("App Token (xapp-...):")).trim();
        botToken = (await io.ask("Bot Token (xoxb-...):")).trim();

        if (appToken && botToken) {
          env.SLACK_APP_TOKEN = appToken;
          env.SLACK_BOT_TOKEN = botToken;
          io.ok("Tokens set for this session");
          persistTokens(deps, hostEnvPath, appToken, botToken);
        } else {
          io.warn("Tokens not provided");
          appToken = "";
          botToken = "";
        }
      }
    }

    // Best-effort: create ~/.openharness/agent symlinks pointing at ~/.pi/agent/
    bootstrapOpenharnessAgent(deps);

    if (promptedSkip) {
      return { id: "slack", status: "skipped" };
    }
    if (!appToken || !botToken) {
      return { id: "slack", status: "skipped" };
    }

    ensureSlackLlmAuth(deps);

    const alreadyRunning = isSlackConnected(deps);
    if (alreadyRunning) {
      io.ok("Slack extension already running and connected");
      return { id: "slack", status: "done" };
    }

    // TODO: adapt for Pi — the extension entrypoint path below is a
    // placeholder. Replace with the actual built entrypoint once the
    // extensions/slack package is scaffolded (T7+).
    return await startAndValidateSlack(deps);
  },
};

function printSlackAppInstructions(deps: Deps): void {
  const { io } = deps;
  io.raw("\n  \x1b[1mCreate a Slack app:\x1b[0m\n");
  io.raw("    1. Go to \x1b[0;36mhttps://api.slack.com/apps\x1b[0m\n");
  io.raw("    2. Click \x1b[1mCreate New App\x1b[0m → \x1b[1mFrom a manifest\x1b[0m\n");
  io.raw("    3. Select your workspace, then paste this manifest:\n");
  io.raw("\n       \x1b[0;36m~/.pi/install/slack-manifest.json\x1b[0m\n");
  io.raw(
    "\n       (or copy from: \x1b[0;36mhttps://github.com/ryaneggz/open-harness/blob/main/.pi/install/slack-manifest.json\x1b[0m)\n",
  );
  io.raw("\n    4. Click \x1b[1mCreate\x1b[0m, then:\n");
  io.raw(
    "       - \x1b[1mBasic Information\x1b[0m → \x1b[1mApp-Level Tokens\x1b[0m → Generate (scope: \x1b[0;36mconnections:write\x1b[0m)\n",
  );
  io.raw("         This is your \x1b[1mApp Token\x1b[0m (starts with \x1b[0;36mxapp-\x1b[0m)\n");
  io.raw("       - \x1b[1mOAuth & Permissions\x1b[0m → \x1b[1mInstall to Workspace\x1b[0m\n");
  io.raw("         This is your \x1b[1mBot Token\x1b[0m (starts with \x1b[0;36mxoxb-\x1b[0m)\n\n");
  io.raw("    Optional restrictions (add to .devcontainer/.env):\n");
  io.raw("      SLACK_ALLOW_CHANNELS=C01234,C05678   # restrict by channel ID\n");
  io.raw("      SLACK_ALLOW_USERS=U01234,U05678       # restrict by user ID\n\n");
}

function persistTokens(deps: Deps, hostEnvPath: string, appToken: string, botToken: string): void {
  const { io, fs, home } = deps;
  const devcontainerDir = `${home}/harness/.devcontainer`;
  if (!fs.exists(devcontainerDir)) {
    io.warn(`Cannot write to ${hostEnvPath} — tokens valid for this session only`);
    io.raw("    Add manually to .devcontainer/.env on the host:\n");
    io.raw(`      SLACK_APP_TOKEN=${appToken}\n`);
    io.raw(`      SLACK_BOT_TOKEN=${botToken}\n`);
    return;
  }
  try {
    upsertEnvFile(fs, hostEnvPath, {
      SLACK_APP_TOKEN: appToken,
      SLACK_BOT_TOKEN: botToken,
    });
    io.ok("Tokens saved to .devcontainer/.env (persist across rebuilds)");
  } catch {
    io.warn(`Cannot write to ${hostEnvPath} — tokens valid for this session only`);
    io.raw("    Add manually to .devcontainer/.env on the host:\n");
    io.raw(`      SLACK_APP_TOKEN=${appToken}\n`);
    io.raw(`      SLACK_BOT_TOKEN=${botToken}\n`);
  }
}

/**
 * Create `~/.openharness/agent/{settings,auth}.json` symlinks pointing at
 * `~/.pi/agent/…` equivalents. Best-effort — Pi does its own auth setup.
 */
function bootstrapOpenharnessAgent(deps: Deps): void {
  const { fs, home } = deps;
  const ohAgent = `${home}/.openharness/agent`;
  fs.mkdirp(ohAgent);

  for (const name of ["settings.json", "auth.json"]) {
    const link = `${ohAgent}/${name}`;
    const target = `${home}/.pi/agent/${name}`;
    if (!fs.exists(link) && fs.exists(target)) {
      try {
        fs.symlink(target, link);
      } catch {
        /* best-effort */
      }
    }
  }
}

function ensureSlackLlmAuth(deps: Deps): void {
  const { fs, io, home, env } = deps;
  const slackDir = `${home}/.pi/slack`;
  const slackAuth = `${slackDir}/auth.json`;
  if (fs.exists(slackAuth) || env.OPENAI_API_KEY) return;
  const piAuth = `${home}/.pi/agent/auth.json`;
  if (fs.exists(piAuth)) {
    fs.mkdirp(slackDir);
    try {
      fs.symlink(piAuth, slackAuth);
      io.ok("Linked Slack extension auth to Pi agent (shared key store)");
    } catch {
      /* ignore */
    }
  } else {
    io.warn("Slack extension needs LLM auth. Complete the Pi auth step first.");
  }
}

function isSlackConnected(deps: Deps): boolean {
  if (!deps.exec.runSafe(["tmux", "has-session", "-t", "slack"])) return false;
  const res = deps.exec.capture(["tmux", "capture-pane", "-t", "slack", "-p"]);
  return res.stdout.includes(CONNECTED_MARKER) || res.stderr.includes(CONNECTED_MARKER);
}

async function startAndValidateSlack(deps: Deps): Promise<StepResult> {
  const { exec, io, clock, env, home } = deps;

  // TODO: adapt for Pi — replace with the real extension entrypoint once
  // extensions/slack is built. Pi is started by the user normally; this
  // tmux session launches the Slack listener as a companion process.
  const slackDir = `${home}/harness/workspace/.slack`;
  const piExtensionEntry = `${home}/.pi/extensions/slack/dist/main.js`;

  exec.runSafe(["tmux", "kill-session", "-t", "slack"]);
  exec.run(
    ["tmux", "new-session", "-d", "-s", "slack", `node ${piExtensionEntry} --sandbox=host ${slackDir}`],
    {
      env: {
        SLACK_APP_TOKEN: env.SLACK_APP_TOKEN ?? "",
        SLACK_BOT_TOKEN: env.SLACK_BOT_TOKEN ?? "",
        SLACK_ALLOW_CHANNELS: env.SLACK_ALLOW_CHANNELS ?? "",
        SLACK_ALLOW_USERS: env.SLACK_ALLOW_USERS ?? "",
      },
    },
  );

  io.raw("\n  Validating Slack connection");
  let status: StepStatus = "failed";
  for (let i = 0; i < MAX_POLLS; i++) {
    io.raw(".");
    const output = deps.exec.capture(["tmux", "capture-pane", "-t", "slack", "-p"]);
    const combined = output.stdout + "\n" + output.stderr;
    if (combined.includes(CONNECTED_MARKER)) {
      status = "done";
      break;
    }
    if (ERROR_MARKERS.some((re) => re.test(combined))) {
      break;
    }
    await clock.sleep(POLL_INTERVAL_MS);
  }
  io.raw("\n");

  if (status === "done") {
    io.ok("Slack extension connected");
    return { id: "slack", status: "done" };
  }
  io.fail("Slack extension failed to connect — check logs: tmux attach -t slack");
  return { id: "slack", status: "failed" };
}
