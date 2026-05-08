type Theme = {
  fg(role: string, text: string): string;
};

type HeaderComponent = {
  render(): string[];
  invalidate(): void;
};

type HeaderFactory = (tui: unknown, theme: Theme) => HeaderComponent;

type ExtensionContext = {
  hasUI: boolean;
  ui: {
    setHeader(factory?: HeaderFactory): void;
    notify(message: string, level: string): void;
  };
};

type CommandDefinition = {
  description: string;
  handler(args: unknown, ctx: ExtensionContext): void | Promise<void>;
};

type ExtensionAPI = {
  on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>): void;
  registerCommand(name: string, definition: CommandDefinition): void;
};

const WORDMARK_LINES: string[] = [
  "███╗   ███╗██╗███████╗██╗   ██╗███╗   ██╗███████╗",
  "████╗ ████║██║██╔════╝██║   ██║████╗  ██║██╔════╝",
  "██╔████╔██║██║█████╗  ██║   ██║██╔██╗ ██║█████╗  ",
  "██║╚██╔╝██║██║██╔══╝  ██║   ██║██║╚██╗██║██╔══╝  ",
  "██║ ╚═╝ ██║██║██║     ╚██████╔╝██║ ╚████║███████╗",
  "╚═╝     ╚═╝╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚══════╝",
];
const TAGLINE = "  agent harness · https://x.com/mifunedev";
const SOURCE  = "  https://github.com/ryaneggz/mifune";

export function buildHeader(theme: Theme): string[] {
  return [
    ...WORDMARK_LINES.map((line) => theme.fg("accent", line)),
    theme.fg("muted", TAGLINE),
    theme.fg("muted", SOURCE),
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
