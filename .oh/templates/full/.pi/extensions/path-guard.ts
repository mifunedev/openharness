import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SENSITIVE_PATHS: RegExp[] = [
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)secrets?\//,
  /(^|\/)credentials?\.(json|ya?ml)$/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/,
];

export function isSensitivePath(p: string): boolean {
  return SENSITIVE_PATHS.some((re) => re.test(p));
}

const RISKY_BASH = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /(^|\s)>\s*\/dev\/(sd[a-z]|nvme\d*|hd[a-z]|disk\d+)\b/i,
];

const MUTATING_TOOLS = new Set(["write", "edit"]);

function pickPath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  for (const key of ["path", "file_path", "target", "filename"]) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!ctx.hasUI) return;

    const toolName = event.toolName?.toLowerCase() ?? "";

    if (MUTATING_TOOLS.has(toolName)) {
      const path = pickPath(event.input as Record<string, unknown>);
      if (path && isSensitivePath(path)) {
        const ok = await ctx.ui.confirm(
          "Sensitive path",
          `Allow ${toolName} on ${path}?`,
        );
        if (!ok) return { block: true, reason: `Path ${path} is protected` };
      }
      return;
    }

    if (toolName === "bash") {
      if (ctx.mode === "tui") return;

      const cmd = (event.input as { command?: string } | undefined)?.command ?? "";
      if (RISKY_BASH.some((re) => re.test(cmd))) {
        const ok = await ctx.ui.confirm(
          "Risky command",
          `Allow:\n${cmd.length > 200 ? cmd.slice(0, 200) + "..." : cmd}`,
        );
        if (!ok) return { block: true, reason: "User declined risky command" };
      }
    }
  });

  pi.registerCommand("guard", {
    description: "Show what path-guard is protecting",
    handler: async (_args, ctx) => {
      const lines = [
        "path-guard is active.",
        "",
        "Sensitive paths (write/edit prompt):",
        ...SENSITIVE_PATHS.map((re) => `  ${re.source}`),
        "",
        "Risky bash patterns (prompt before run outside interactive TUI sessions):",
        ...RISKY_BASH.map((re) => `  ${re.source}`),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
