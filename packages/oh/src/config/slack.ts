import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvInto, upsertEnvFile } from "../lib/env.js";
import {
  ok, warn, fail, info, header, step, link, bold,
  ask, askSecret, askChoice, confirm,
  redact,
} from "../lib/prompt.js";
import {
  hasSession, killSession, newSession, capturePane, isInstalled as tmuxAvailable,
} from "../lib/tmux.js";

const CLIENT_SLACK_SESSION = "client-slack";
const CONNECTED_MARKER = "connected and listening";
const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 15;

interface SlackConfig {
  appToken: string;
  botToken: string;
  allowUsers?: string;
  allowChannels?: string;
}

function findHarnessRoot(): string {
  // Walk up from cwd looking for .devcontainer/. Common case: cwd is /home/sandbox/harness.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(`${dir}/.devcontainer`)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume /home/sandbox/harness (the canonical sandbox path)
  return "/home/sandbox/harness";
}

function validateAppToken(t: string): string | null {
  if (!t.startsWith("xapp-")) return "App Token must start with 'xapp-' (you may have pasted the Bot Token by mistake)";
  if (t.length < 20) return "App Token looks too short";
  return null;
}

function validateBotToken(t: string): string | null {
  if (!t.startsWith("xoxb-")) return "Bot Token must start with 'xoxb-' (you may have pasted the App Token by mistake)";
  if (t.length < 20) return "Bot Token looks too short";
  return null;
}

function validateIds(ids: string, prefix: "U" | "C"): string | null {
  const list = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return "Provide at least one ID";
  for (const id of list) {
    if (!id.startsWith(prefix)) return `ID "${id}" must start with "${prefix}" (Slack ${prefix === "U" ? "user" : "channel"} IDs)`;
    if (id.length < 9) return `ID "${id}" looks too short`;
  }
  return null;
}

function normalizeIds(ids: string): string {
  return ids.split(",").map((s) => s.trim()).filter(Boolean).join(",");
}

async function promptTokens(env: Record<string, string | undefined>): Promise<{ appToken: string; botToken: string }> {
  let appToken = env.SLACK_APP_TOKEN ?? "";
  let botToken = env.SLACK_BOT_TOKEN ?? "";

  if (appToken && botToken) {
    info(`Existing tokens detected: App=${redact(appToken)}, Bot=${redact(botToken)}`);
    if (!(await confirm("Replace them?", false))) {
      return { appToken, botToken };
    }
  }

  step(1, 4, "Slack App Token (xapp-…)");
  info(`  Where: ${link("https://api.slack.com/apps", "api.slack.com/apps")} → Basic Information → App-Level Tokens`);
  while (true) {
    appToken = await askSecret("Token:");
    const e = validateAppToken(appToken);
    if (!e) { ok("valid prefix"); break; }
    fail(e);
  }

  step(2, 4, "Slack Bot Token (xoxb-…)");
  info(`  Where: ${link("https://api.slack.com/apps", "api.slack.com/apps")} → OAuth & Permissions → Bot User OAuth Token`);
  while (true) {
    botToken = await askSecret("Token:");
    const e = validateBotToken(botToken);
    if (!e) { ok("valid prefix"); break; }
    fail(e);
  }
  return { appToken, botToken };
}

async function promptAllowlist(env: Record<string, string | undefined>): Promise<{ users?: string; channels?: string }> {
  const existingUsers = env.SLACK_ALLOW_USERS;
  const existingChannels = env.SLACK_ALLOW_CHANNELS;
  if (existingUsers || existingChannels) {
    info(`Existing allowlist detected: users=${existingUsers ?? "(none)"}, channels=${existingChannels ?? "(none)"}`);
    if (!(await confirm("Replace it?", false))) {
      return {
        users: existingUsers,
        channels: existingChannels,
      };
    }
  }

  step(3, 4, "Allowlist mode");
  const mode = await askChoice("Pick (deny-default — at least one is required):", [
    { label: "Users only — only listed users can talk to the bot", value: "users" },
    { label: "Channels only — only in listed channels", value: "channels" },
    { label: "Both — message must match user AND channel", value: "both" },
  ]);

  step(4, 4, "Allowed IDs");
  const result: { users?: string; channels?: string } = {};
  if (mode === "users" || mode === "both") {
    info(`  Users:    Slack profile → ⋯ menu → Copy member ID`);
    while (true) {
      const ids = await ask("User IDs (comma-separated, U…):");
      const e = validateIds(ids, "U");
      if (!e) {
        result.users = normalizeIds(ids);
        ok(`${result.users.split(",").length} user(s) accepted`);
        break;
      }
      fail(e);
    }
  }
  if (mode === "channels" || mode === "both") {
    info(`  Channels: channel header → About → bottom of panel`);
    while (true) {
      const ids = await ask("Channel IDs (comma-separated, C…):");
      const e = validateIds(ids, "C");
      if (!e) {
        result.channels = normalizeIds(ids);
        ok(`${result.channels.split(",").length} channel(s) accepted`);
        break;
      }
      fail(e);
    }
  }
  return result;
}

async function relaunchClientSlack(envPath: string): Promise<void> {
  if (!tmuxAvailable()) {
    warn("tmux not found in PATH — skipping client-slack restart. Restart it manually after this exits.");
    return;
  }
  const wasRunning = hasSession(CLIENT_SLACK_SESSION);
  if (wasRunning) {
    info(`Killing existing tmux session "${CLIENT_SLACK_SESSION}"…`);
    killSession(CLIENT_SLACK_SESSION);
  }
  info(`Starting tmux session "${CLIENT_SLACK_SESSION}"…`);
  // The session sources .env via `set -a` so child pi inherits the new vars.
  const cmd = `bash -c 'set -a; source ${envPath}; set +a; pi 2>&1 | tee /tmp/client-slack.log'`;
  newSession(CLIENT_SLACK_SESSION, cmd);

  info("Validating Slack connection (up to 15s)…");
  for (let i = 0; i < MAX_POLLS; i++) {
    const out = capturePane(CLIENT_SLACK_SESSION);
    if (out.includes(CONNECTED_MARKER)) {
      ok("Slack extension connected.");
      return;
    }
    if (/Run error|Missing env/.test(out)) {
      fail("Slack extension reported an error. Check `tmux attach -t client-slack`.");
      return;
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  warn("Did not see 'connected and listening' within 15s. Check `tmux attach -t client-slack`.");
}

export async function runSlack(): Promise<number> {
  header("oh config slack — Slack integration setup");

  const harnessRoot = findHarnessRoot();
  const envPath = resolve(harnessRoot, ".devcontainer/.env");
  info(`Target: ${envPath}`);
  info(`Guide:  ${link("https://github.com/mifunedev/openharness/blob/development/docs/integrations/slack.md", "docs/integrations/slack.md")}`);

  // Ensure .devcontainer/ exists so we can write to it
  const devcontainerDir = dirname(envPath);
  if (!existsSync(devcontainerDir)) {
    mkdirSync(devcontainerDir, { recursive: true });
  }

  // Load existing keys (don't overwrite caller-provided process.env)
  const env: Record<string, string | undefined> = { ...process.env };
  loadEnvInto(envPath, env);

  const { appToken, botToken } = await promptTokens(env);
  const allowlist = await promptAllowlist(env);

  const config: SlackConfig = {
    appToken,
    botToken,
    allowUsers: allowlist.users,
    allowChannels: allowlist.channels,
  };

  // Build the keys to upsert
  const vars: Record<string, string> = {
    SLACK_APP_TOKEN: config.appToken,
    SLACK_BOT_TOKEN: config.botToken,
  };
  if (config.allowUsers !== undefined) vars.SLACK_ALLOW_USERS = config.allowUsers;
  if (config.allowChannels !== undefined) vars.SLACK_ALLOW_CHANNELS = config.allowChannels;

  info("");
  info(bold(`Ready to write to ${envPath}:`));
  for (const [k, v] of Object.entries(vars)) {
    if (k.endsWith("_TOKEN")) info(`  ${k}=${redact(v)}`);
    else                       info(`  ${k}=${v}`);
  }
  if (!(await confirm("Proceed?", true))) {
    warn("Aborted. Nothing written.");
    return 0;
  }

  try {
    upsertEnvFile(envPath, vars);
    ok(`Wrote ${Object.keys(vars).length} keys to ${envPath}`);
  } catch (err) {
    fail(`Failed to write ${envPath}: ${(err as Error).message}`);
    return 1;
  }

  info("Next step: start the Slack bridge by (re)launching the client-slack tmux session.");
  info("This kills any existing client-slack session, then starts pi with the new tokens;");
  info("pi loads the slack extension on boot and opens the Socket Mode connection.");

  if (await confirm("Start the Slack bridge now?")) {
    await relaunchClientSlack(envPath);
    info("");
    info("Slack bridge is live. Test it: DM your bot or @mention it in an allow-listed channel.");
    info("Tail the live log: tmux attach -t client-slack   (detach: Ctrl-b d)");
  } else {
    info("Skipped. Start the bridge manually when ready:");
    info("  tmux kill-session -t client-slack 2>/dev/null; \\");
    info(`  set -a; source ${envPath}; set +a; \\`);
    info("  tmux new-session -d -s client-slack 'pi 2>&1 | tee /tmp/client-slack.log'");
  }

  return 0;
}
