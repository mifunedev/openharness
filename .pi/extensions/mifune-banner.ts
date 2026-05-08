import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

const WORDMARK = "MIFUNE";
const SUBTITLE = "agent harness · github.com/ryaneggz/mifune";

export function buildHeader(theme: Theme): string[] {
  return [
    `${theme.fg("accent", WORDMARK)}`,
    `-------------------------------`,
    `${theme.fg("muted", SUBTITLE)}`,
  ];
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader((_tui, theme) => ({
      render: () => buildHeader(theme),
      invalidate: () => {},
    }));
  });

  pi.registerCommand("builtin-header", {
    description: "Restore the built-in pi header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
