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

// Destructive-bash guarding is now owned by cc-safety-net (the pinned pi
// extension from the `npm:cc-safety-net` package): it deterministically parses
// and denies `rm -rf`, `git reset --hard`, `git push --force`, block-device
// redirection, and related destructive intent across every mode, including
// headless. This extension therefore no longer inspects bash commands — it
// guards sensitive-path writes/edits only.

// Tool names confirmed lowercase from pi source:
// packages/coding-agent/src/core/tools/index.ts:
//   export type ToolName = "read" | "bash" | "edit" | "write" | "grep" | "find" | "ls";
const MUTATING_TOOLS = new Set(["write", "edit"]);

// Canonical input key for write and edit is `path` (verified from pi source):
//   write.ts: const writeSchema = Type.Object({ path: Type.String(...), content: ... });
//   edit.ts:  const editSchema = Type.Object({ path: Type.String(...), edits: ... });
// Fallbacks retained for forward-compatibility with any future schema changes.
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
    // Fix #1: Guard against headless/RPC mode where ctx.ui is unavailable.
    // Mirrors the pattern in mifune-banner.ts.
    if (!ctx.hasUI) return;

    // Fix #4: Defensive toLowerCase normalization on toolName. Pi uses
    // lowercase names (confirmed from index.ts ToolName union), but this
    // costs nothing and protects against future renames.
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
