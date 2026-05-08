declare const process: { env: Record<string, string | undefined> };

const DIVIDER = " > ";
const ELLIPSIS = "...";

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const ANSI_AT_START_PATTERN = new RegExp(`^${ANSI_PATTERN.source}`);

type Model = {
  provider?: string;
  id: string;
  reasoning?: boolean;
  contextWindow?: number;
};

type Theme = {
  fg(role: string, text: string): string;
};

type FooterRuntimeState = {
  model: Model | undefined;
  thinkingLevel: string;
};

type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

type AssistantMessage = {
  role: "assistant";
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
  };
};

type SessionEntry = {
  type?: string;
  message?: AssistantMessage | { role?: string; usage?: AssistantMessage["usage"] };
};

type ExtensionContext = {
  hasUI: boolean;
  cwd: string;
  model: Model | undefined;
  sessionManager: {
    getEntries(): SessionEntry[];
    getSessionName(): string | undefined;
  };
  getContextUsage(): { percent: number | null; contextWindow?: number } | undefined;
  ui: {
    setFooter(factory: (tui: { requestRender(): void }, theme: Theme, footerData: FooterData) => FooterComponent): void;
  };
};

type ModelSelectEvent = { model: Model };
type ThinkingLevelSelectEvent = { level: string };

type ExtensionAPI = {
  getThinkingLevel(): string;
  on(event: "model_select", handler: (event: ModelSelectEvent) => void): void;
  on(event: "thinking_level_select", handler: (event: ThinkingLevelSelectEvent) => void): void;
  on(event: "agent_end", handler: () => void): void;
  on(event: "session_shutdown", handler: () => void): void;
  on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => void | Promise<void>): void;
};

export type FooterData = {
  getGitBranch(): string | null;
  getExtensionStatuses(): ReadonlyMap<string, string>;
  getAvailableProviderCount(): number;
  onBranchChange(callback: () => void): () => void;
};

type FooterComponent = {
  dispose(): void;
  invalidate(): void;
  render(width: number): string[];
};

type Segment = {
  text: string;
  priority: number;
};

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function truncateToWidth(text: string, width: number, ellipsis = ""): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;

  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = Math.max(0, width - ellipsisWidth);
  let result = "";
  let used = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ansiMatch = ANSI_AT_START_PATTERN.exec(text.slice(i));
    if (ansiMatch) {
      result += ansiMatch[0];
      i += ansiMatch[0].length - 1;
      continue;
    }

    if (used >= targetWidth) break;
    result += text[i];
    used += 1;
  }

  return `${result}${ellipsis}`;
}

export function sanitizeSegment(text: string): string {
  return stripAnsi(text)
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/ +/g, " ")
    .trim();
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1000) return Math.round(count).toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCwd(cwd: string, branch: string | null): string {
  let display = sanitizeSegment(cwd);
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && display.startsWith(home)) display = `~${display.slice(home.length)}`;
  const cleanBranch = branch ? sanitizeSegment(branch) : "";
  if (cleanBranch) display = `${display} (${cleanBranch})`;
  return display;
}

export function collectUsage(ctx: ExtensionContext): Usage {
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  for (const entry of ctx.sessionManager.getEntries()) {
    const message = entry.type === "message" ? entry.message : undefined;
    if (message?.role !== "assistant") continue;
    usage.input += safeNumber(message.usage?.input);
    usage.output += safeNumber(message.usage?.output);
    usage.cacheRead += safeNumber(message.usage?.cacheRead);
    usage.cacheWrite += safeNumber(message.usage?.cacheWrite);
    usage.cost += safeNumber(message.usage?.cost?.total);
  }

  return usage;
}

function buildUsageSegment(usage: Usage): string | undefined {
  const parts: string[] = [];
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(3)}`);
  return parts.length ? parts.join(" ") : undefined;
}

function buildContextSegment(ctx: ExtensionContext, state: FooterRuntimeState, theme: Theme): string | undefined {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? state.model?.contextWindow;
  if (!contextWindow || !usage || usage.percent === null) return undefined;

  const display = `ctx ${usage.percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
  if (usage.percent > 90) return theme.fg("error", display);
  if (usage.percent > 70) return theme.fg("warning", display);
  return display;
}

function buildModelSegment(state: FooterRuntimeState, footerData: FooterData): string {
  const model = state.model;
  if (!model) return "no-model";

  const modelName = footerData.getAvailableProviderCount() > 1 && model.provider ? `${model.provider}/${model.id}` : model.id;
  if (!model.reasoning) return modelName;
  return state.thinkingLevel === "off" ? `${modelName} thinking off` : `${modelName} ${state.thinkingLevel}`;
}

function joinSegments(segments: Segment[], theme: Theme): string {
  return segments.map((segment) => segment.text).join(theme.fg("dim", DIVIDER));
}

function fits(segments: Segment[], theme: Theme, width: number): boolean {
  return visibleWidth(joinSegments(segments, theme)) <= width;
}

function fitSegments(segments: Segment[], theme: Theme, width?: number): string {
  if (!width || width <= 0) return joinSegments(segments, theme);
  if (fits(segments, theme, width)) return joinSegments(segments, theme);

  const kept = [...segments];
  while (kept.length > 1 && !fits(kept, theme, width)) {
    let dropIndex = 1;
    for (let i = 1; i < kept.length; i += 1) {
      if (kept[i]!.priority < kept[dropIndex]!.priority) dropIndex = i;
    }
    kept.splice(dropIndex, 1);
  }

  return truncateToWidth(joinSegments(kept, theme), width, theme.fg("dim", ELLIPSIS));
}

export function buildFooterLine(
  ctx: ExtensionContext,
  state: FooterRuntimeState,
  theme: Theme,
  footerData: FooterData,
  width?: number,
): string {
  const sessionName = sanitizeSegment(ctx.sessionManager.getSessionName() ?? "");
  const statuses = Array.from(footerData.getExtensionStatuses().entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => sanitizeSegment(text))
    .filter(Boolean);

  const segments: Segment[] = [
    { text: formatCwd(ctx.cwd, footerData.getGitBranch()), priority: 100 },
    { text: buildContextSegment(ctx, state, theme) ?? "", priority: 90 },
    { text: buildModelSegment(state, footerData), priority: 80 },
    ...statuses.map((text) => ({ text, priority: 70 })),
    { text: buildUsageSegment(collectUsage(ctx)) ?? "", priority: 60 },
    { text: sessionName, priority: 50 },
  ].filter((segment) => segment.text.length > 0);

  return fitSegments(segments, theme, width);
}

export default function singleLineFooter(pi: ExtensionAPI): void {
  let requestRender: (() => void) | undefined;
  let runtimeState: FooterRuntimeState = {
    model: undefined,
    thinkingLevel: "off",
  };

  pi.on("model_select", (event: ModelSelectEvent) => {
    runtimeState = { ...runtimeState, model: event.model };
    requestRender?.();
  });

  pi.on("thinking_level_select", (event: ThinkingLevelSelectEvent) => {
    runtimeState = { ...runtimeState, thinkingLevel: event.level };
    requestRender?.();
  });

  pi.on("agent_end", () => {
    requestRender?.();
  });

  pi.on("session_shutdown", () => {
    requestRender = undefined;
  });

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;

    runtimeState = {
      model: ctx.model,
      thinkingLevel: pi.getThinkingLevel(),
    };

    ctx.ui.setFooter((tui: { requestRender(): void }, theme: Theme, footerData: FooterData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);

      return {
        dispose() {
          unsubscribe();
          if (requestRender) requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          return [buildFooterLine(ctx, runtimeState, theme, footerData, width)];
        },
      };
    });
  });
}
