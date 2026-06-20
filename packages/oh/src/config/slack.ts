import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadEnvInto, upsertEnvFile } from "../lib/env.js";
import {
  ok, warn, fail, info, header, step, link, bold,
  ask, askSecret, confirm,
  redact,
} from "../lib/prompt.js";
import {
  hasSession, killSession, newSession, capturePane, isInstalled as tmuxAvailable,
} from "../lib/tmux.js";

// Bridge tmux session name — keep the `client-slack` name (not the legacy
// bare form) so the runtime, watchdog, and docs continue to find it.
// See context/rules/sandbox-processes.md.
const CLIENT_SLACK_SESSION = "client-slack";
// Connect marker emitted by pi-messenger-bridge's Slack transport once Socket
// Mode opens — the literal string we poll the pane for.
const CONNECTED_MARKER = "[Slack] Bot user ID:";
const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 18;

interface MsgBridgeConfig {
  slack: { botToken: string; appToken: string };
  auth?: { trustedUsers: string[]; adminUserId: string };
  autoConnect: boolean;
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

function validateUserId(id: string): string | null {
  if (!id.startsWith("U")) return `Slack user ID "${id}" must start with "U"`;
  if (id.length < 9) return `Slack user ID "${id}" looks too short`;
  return null;
}

async function promptTokens(env: Record<string, string | undefined>): Promise<{ appToken: string; botToken: string }> {
  let appToken = env.PI_SLACK_APP_TOKEN ?? "";
  let botToken = env.PI_SLACK_BOT_TOKEN ?? "";

  if (appToken && botToken) {
    info(`Existing tokens detected: App=${redact(appToken)}, Bot=${redact(botToken)}`);
    if (!(await confirm("Replace them?", false))) {
      return { appToken, botToken };
    }
  }

  step(1, 3, "Slack App Token (xapp-…)");
  info(`  Where: ${link("https://api.slack.com/apps", "api.slack.com/apps")} → Basic Information → App-Level Tokens`);
  while (true) {
    appToken = await askSecret("Token:");
    const e = validateAppToken(appToken);
    if (!e) { ok("valid prefix"); break; }
    fail(e);
  }

  step(2, 3, "Slack Bot Token (xoxb-…)");
  info(`  Where: ${link("https://api.slack.com/apps", "api.slack.com/apps")} → OAuth & Permissions → Bot User OAuth Token`);
  while (true) {
    botToken = await askSecret("Token:");
    const e = validateBotToken(botToken);
    if (!e) { ok("valid prefix"); break; }
    fail(e);
  }
  return { appToken, botToken };
}

// Optionally pre-authorize a Slack user ID as the bridge's trusted/admin user.
// Returns the user ID (U…) or null when the operator declines.
async function promptTrustedUser(): Promise<string | null> {
  step(3, 3, "Pre-authorize a trusted user (optional)");
  info("  Pre-authorizing your Slack user ID makes you the bridge's trusted/admin");
  info("  user and skips the first-message challenge — recommended for headless setups.");
  if (!(await confirm("Pre-authorize your Slack user ID to skip the first-message challenge?", false))) {
    info("  Skipped — the bot will challenge the first DM with a 6-digit code instead.");
    return null;
  }
  info(`  Where: Slack profile → ⋯ menu → Copy member ID`);
  while (true) {
    const id = await ask("Slack user ID (U…):");
    const e = validateUserId(id);
    if (!e) {
      ok(`Trusted user ${id} accepted`);
      return id;
    }
    fail(e);
  }
}

// Seed ~/.pi/msg-bridge.json (the pi-messenger-bridge config). Creates ~/.pi
// (mode 0o700) if absent and writes the file mode 0o600. When the file already
// exists, confirms before overwriting; declining leaves the prior config intact.
async function seedMsgBridgeJson(config: MsgBridgeConfig): Promise<void> {
  const piDir = join(homedir(), ".pi");
  const bridgePath = join(piDir, "msg-bridge.json");

  if (existsSync(bridgePath)) {
    info(`Existing ${bridgePath} detected.`);
    if (!(await confirm("Overwrite it with the new config?", false))) {
      warn(`Kept existing ${bridgePath}. Bridge config NOT updated.`);
      return;
    }
  }

  try {
    if (!existsSync(piDir)) {
      mkdirSync(piDir, { recursive: true, mode: 0o700 });
    }
    const json = JSON.stringify(config, null, 2) + "\n";
    writeFileSync(bridgePath, json, { mode: 0o600 });
    // writeFileSync's mode only applies on creation; enforce 0o600 on overwrite too.
    chmodSync(bridgePath, 0o600);
    ok(`Seeded ${bridgePath} (mode 0600)`);
  } catch (err) {
    fail(`Failed to write ${bridgePath}: ${(err as Error).message}`);
  }
}

async function relaunchClientSlack(envPath: string): Promise<void> {
  if (!tmuxAvailable()) {
    warn(`tmux not found in PATH — skipping ${CLIENT_SLACK_SESSION} restart. Restart it manually after this exits.`);
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

  info(`Validating Slack connection (up to ${MAX_POLLS}s)…`);
  for (let i = 0; i < MAX_POLLS; i++) {
    const out = capturePane(CLIENT_SLACK_SESSION);
    if (out.includes(CONNECTED_MARKER)) {
      process.stdout.write("\n");
      ok("Slack bridge connected.");
      return;
    }
    if (/Run error|Missing env/.test(out)) {
      process.stdout.write("\n");
      fail(`Slack bridge reported an error. Check \`tmux attach -t ${CLIENT_SLACK_SESSION}\`.`);
      return;
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  warn(`Did not see "${CONNECTED_MARKER}" within ${MAX_POLLS}s. Check \`tmux attach -t ${CLIENT_SLACK_SESSION}\`.`);
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
  const trustedUserId = await promptTrustedUser();

  // Build the keys to upsert into .devcontainer/.env
  const vars: Record<string, string> = {
    PI_SLACK_APP_TOKEN: appToken,
    PI_SLACK_BOT_TOKEN: botToken,
  };

  info("");
  info(bold(`Ready to write to ${envPath}:`));
  for (const [k, v] of Object.entries(vars)) {
    info(`  ${k}=${redact(v)}`);
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

  // Seed the pi-messenger-bridge config at ~/.pi/msg-bridge.json.
  const bridgeConfig: MsgBridgeConfig = trustedUserId
    ? {
        slack: { botToken, appToken },
        auth: {
          trustedUsers: [`slack:${trustedUserId}`],
          adminUserId: `slack:${trustedUserId}`,
        },
        autoConnect: true,
      }
    : {
        slack: { botToken, appToken },
        autoConnect: true,
      };
  await seedMsgBridgeJson(bridgeConfig);

  info("");
  info(bold("NOTE:"));
  info("If your `.devcontainer/.env` still has old `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN`");
  info("keys, remove them — they are no longer used.");
  if (!trustedUserId) {
    info("");
    info("First time you DM the bot, a 6-digit challenge code appears in");
    info(`\`tmux attach -t ${CLIENT_SLACK_SESSION}\` — reply with it in Slack to become trusted.`);
  }

  info("");
  info(`Next step: start the Slack bridge by (re)launching the ${CLIENT_SLACK_SESSION} tmux session.`);
  info(`This kills any existing ${CLIENT_SLACK_SESSION} session, then starts pi with the new tokens;`);
  info("pi-messenger-bridge auto-connects on boot using ~/.pi/msg-bridge.json.");

  if (await confirm("Start the Slack bridge now?")) {
    await relaunchClientSlack(envPath);
    info("");
    info("Slack bridge is live. Test it: DM your bot or @mention it in a shared channel.");
    info(`Tail the live log: tmux attach -t ${CLIENT_SLACK_SESSION}   (detach: Ctrl-b d)`);
  } else {
    info("Skipped. Start the bridge manually when ready:");
    info(`  tmux kill-session -t ${CLIENT_SLACK_SESSION} 2>/dev/null; \\`);
    info(`  set -a; source ${envPath}; set +a; \\`);
    info(`  tmux new-session -d -s ${CLIENT_SLACK_SESSION} 'pi 2>&1 | tee /tmp/client-slack.log'`);
  }

  return 0;
}
