import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SENSITIVE_PATHS: RegExp[] = [
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)secrets?\//,
  /(^|\/)credentials?\.(json|ya?ml)$/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/,
  /(^|\/)\.config(\/|$)/,
];

export function isSensitivePath(p: string): boolean {
  return SENSITIVE_PATHS.some((re) => re.test(p));
}


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
        "Bash destructive-command guarding is handled by cc-safety-net",
        "(the pi extension from the npm:cc-safety-net package).",
        "This extension now guards sensitive-path writes/edits only.",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
