import type { OhConfig } from "./oh-config.js";
import { isSecretKey } from "./secrets.js";

const RETIRED_KEYS = [
  "WORKTREES_DIR",
  "PROJECTS_DIR",
  "CRONS_DIR",
  "OH_PROJECT_ROOT",
  "INSTALL_DEEPAGENTS",
] as const;

export interface RenderedVar {
  key: string;
  value: string;
}

export function renderComposeVars(config: OhConfig): RenderedVar[] {
  const out: RenderedVar[] = [];
  const put = (key: string, value: string | number | boolean | undefined): void => {
    if (value === undefined) return;
    out.push({ key, value: String(value) });
  };

  put("SANDBOX_NAME", config.name);
  put("TZ", config.timezone);
  put("OH_HOME_MOUNT", config.storage?.homePath);

  put("GIT_USER_NAME", config.git?.userName);
  put("GIT_USER_EMAIL", config.git?.userEmail);

  put("INSTALL_OPENCODE", config.install?.opencode);
  put("INSTALL_GROK_BUILD", config.install?.grokBuild);
  put("INSTALL_HERMES", config.install?.hermes);
  put("INSTALL_AGENT_BROWSER", config.install?.agentBrowser);
  put("INSTALL_TAILSCALE", config.install?.tailscale);

  put("DOCKER_SOCKET", config.access?.dockerSocket);
  put("SANDBOX_SSH", config.access?.ssh);
  put("SANDBOX_SSH_PORT", config.access?.sshPort);
  put("SANDBOX_SSH_PASSWORD_AUTH", config.access?.sshPasswordAuth);
  put("SANDBOX_SSH_AUTHORIZED_KEYS", config.access?.sshAuthorizedKeys);

  put("HERMES_DASHBOARD", config.hermesDashboard?.enabled);
  put("HERMES_DASHBOARD_PORT", config.hermesDashboard?.port);

  put("CRON_AGENT_BIN", config.cron?.agentBin);
  if (config.build?.skipPnpmInstall !== undefined) {
    put("SKIP_PNPM_INSTALL", config.build.skipPnpmInstall ? "1" : "0");
  }

  put("LANGFUSE_BASE_URL", config.langfuse?.baseUrl);
  put("LANGFUSE_PRIVACY_PRESET", config.langfuse?.privacyPreset);

  put("OH_SANDBOX_IMAGE", config.image?.ref);
  put("OH_PULL_POLICY", config.image?.pullPolicy);

  for (const { key, value } of out) {
    if (isSecretKey(key)) {
      throw new Error(`refusing to render secret ${key} from oh.json`);
    }
    if (RETIRED_KEYS.includes(key as (typeof RETIRED_KEYS)[number])) {
      throw new Error(`refusing to render retired variable ${key}`);
    }
    if (/[\r\n]/.test(value)) {
      throw new Error(`oh.json value for ${key} must not contain a newline`);
    }
  }

  return out;
}

export function renderComposeEnv(config: OhConfig): string {
  const vars = renderComposeVars(config);
  return vars.length === 0 ? "" : `${vars.map(({ key, value }) => `${key}=${value}`).join("\n")}\n`;
}
