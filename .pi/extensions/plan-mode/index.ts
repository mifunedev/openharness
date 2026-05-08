import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  extractPlanItems,
  formatPlanItems,
  isMutatingTool,
  isReadOnlyTool,
  isSafeReadOnlyCommand,
  markCompletedSteps,
  normalizeToolNames,
  pickPlanTools,
  type PlanItem,
} from "./utils";

type AssistantTextMessage = {
  role: "assistant";
  content: Array<{ type: string; text?: string }>;
};

type PlanModeEntry = {
  type: string;
  customType?: string;
  data?: {
    planning?: boolean;
    executing?: boolean;
    items?: PlanItem[];
    previousTools?: string[];
  };
};

const STATE_ENTRY = "plan-mode-state";
const SHORTCUT = "ctrl+alt+p";

function isAssistantTextMessage(message: unknown): message is AssistantTextMessage {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { role?: unknown }).role === "assistant" &&
    Array.isArray((message as { content?: unknown }).content)
  );
}

function getAssistantText(message: AssistantTextMessage): string {
  return message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI === false) return;
  ctx.ui.notify(message, level);
}

export default function planModeExtension(pi: ExtensionAPI): void {
  let planning = false;
  let executing = false;
  let items: PlanItem[] = [];
  let previousTools: string[] | undefined;

  pi.registerFlag("plan", {
    description: "Start in Claude Code-style plan mode (read-only until approval)",
    type: "boolean",
    default: false,
  });

  function persistState(): void {
    pi.appendEntry(STATE_ENTRY, {
      planning,
      executing,
      items,
      previousTools,
    });
  }

  function updateUi(ctx: ExtensionContext): void {
    if (ctx.hasUI === false) return;

    if (planning) {
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "plan"));
    } else if (executing && items.length > 0) {
      const done = items.filter((item) => item.completed).length;
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `plan ${done}/${items.length}`));
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }

    if (executing && items.length > 0) {
      ctx.ui.setWidget(
        "plan-mode-items",
        items.map((item) => {
          if (item.completed) {
            return `${ctx.ui.theme.fg("success", "☑")} ${ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))}`;
          }
          return `${ctx.ui.theme.fg("muted", "☐")} ${item.text}`;
        }),
      );
    } else {
      ctx.ui.setWidget("plan-mode-items", undefined);
    }
  }

  function restoreTools(): void {
    const restored = previousTools?.length ? previousTools : normalizeToolNames(pi.getAllTools());
    if (restored.length > 0) pi.setActiveTools(restored);
    previousTools = undefined;
  }

  function enablePlanMode(ctx: ExtensionContext): void {
    if (!previousTools) previousTools = normalizeToolNames(pi.getActiveTools());
    planning = true;
    executing = false;
    items = [];

    pi.setActiveTools(pickPlanTools(pi.getAllTools()));
    updateUi(ctx);
    persistState();
    notify(ctx, "Plan mode enabled. Pi is read-only until you approve a plan.", "info");
  }

  function disablePlanMode(ctx: ExtensionContext): void {
    planning = false;
    executing = false;
    items = [];
    restoreTools();
    updateUi(ctx);
    persistState();
    notify(ctx, "Plan mode disabled. Tool access restored.", "info");
  }

  function approvePlan(ctx: ExtensionContext): void {
    planning = false;
    executing = items.length > 0;
    restoreTools();
    updateUi(ctx);
    persistState();

    const kickoff =
      items.length > 0
        ? `Plan approved. Implement it now, one step at a time. Mark each completed step with [DONE:n].\n\n${formatPlanItems(items)}`
        : "Plan approved. Implement the plan now.";
    pi.sendUserMessage(kickoff);
  }

  pi.registerCommand("plan", {
    description: "Toggle/approve Claude Code-style plan mode: /plan, /plan on, /plan off, /plan approve",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on" || action === "start") return enablePlanMode(ctx);
      if (action === "off" || action === "stop" || action === "cancel") return disablePlanMode(ctx);
      if (action === "approve" || action === "accept" || action === "execute") return approvePlan(ctx);
      if (action === "status") {
        const status = planning ? "planning" : executing ? "executing" : "off";
        notify(ctx, items.length > 0 ? `Plan mode: ${status}\n${formatPlanItems(items)}` : `Plan mode: ${status}`, "info");
        return;
      }

      if (planning || executing) return disablePlanMode(ctx);
      return enablePlanMode(ctx);
    },
  });

  pi.registerCommand("todos", {
    description: "Show current plan-mode progress",
    handler: async (_args, ctx) => {
      if (items.length === 0) {
        notify(ctx, "No plan steps captured yet.", "info");
        return;
      }
      notify(ctx, formatPlanItems(items), "info");
    },
  });

  pi.registerShortcut(SHORTCUT, {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (planning || executing) disablePlanMode(ctx);
      else enablePlanMode(ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!planning) return;

    if (isMutatingTool(event.toolName) || !isReadOnlyTool(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode is read-only. Approve the plan or run /plan off before using ${event.toolName}.`,
      };
    }

    if (event.toolName === "bash") {
      const command = (event.input as { command?: unknown } | undefined)?.command;
      if (typeof command !== "string" || !isSafeReadOnlyCommand(command)) {
        return {
          block: true,
          reason: `Plan mode blocked a non-read-only bash command. Approve the plan or run /plan off first.`,
        };
      }
    }
  });

  pi.on("context", async (event) => {
    if (planning || executing) return;
    return {
      messages: event.messages.filter((message: unknown) => {
        const customType = (message as { customType?: unknown } | undefined)?.customType;
        return customType !== "plan-mode-context" && customType !== "plan-execution-context";
      }),
    };
  });

  pi.on("before_agent_start", async (event) => {
    if (planning) {
      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE]
You are in Claude Code-style plan mode.

Rules:
- Explore and reason only. Do not modify files, run mutating shell commands, install packages, commit, or push.
- Use read/search/list tools and read-only bash commands to understand the request.
- Ask clarifying questions if the requested change is ambiguous.
- End with a concise numbered plan under a "Plan:" heading.
- Do not implement until the user approves the plan.`,
          display: false,
        },
        systemPrompt: `${event.systemPrompt}\n\nPlan mode is active: produce a plan only; do not implement until approval.`,
      };
    }

    if (executing && items.length > 0) {
      const remaining = items.filter((item) => !item.completed);
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING APPROVED PLAN]
Remaining steps:
${formatPlanItems(remaining)}

Execute steps in order. After completing step n, include [DONE:n] in your response.`,
          display: false,
        },
      };
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!executing || items.length === 0 || !isAssistantTextMessage(event.message)) return;
    if (markCompletedSteps(getAssistantText(event.message), items) > 0) {
      updateUi(ctx);
      persistState();
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    if (executing && items.length > 0 && items.every((item) => item.completed)) {
      pi.sendMessage(
        {
          customType: "plan-mode-complete",
          content: `Plan complete.\n\n${formatPlanItems(items)}`,
          display: true,
        },
        { triggerTurn: false },
      );
      executing = false;
      items = [];
      updateUi(ctx);
      persistState();
      return;
    }

    if (!planning) return;

    const lastAssistant = [...event.messages].reverse().find(isAssistantTextMessage);
    if (lastAssistant) {
      const extracted = extractPlanItems(getAssistantText(lastAssistant));
      if (extracted.length > 0) items = extracted;
    }

    if (items.length > 0) {
      pi.sendMessage(
        {
          customType: "plan-mode-plan",
          content: `Plan captured.\n\n${formatPlanItems(items)}`,
          display: true,
        },
        { triggerTurn: false },
      );
      persistState();
    }

    if (ctx.hasUI === false) return;

    const choice = await ctx.ui.select("Plan mode", [
      items.length > 0 ? "Approve plan and implement" : "Approve and implement",
      "Stay in plan mode",
      "Refine plan",
      "Cancel plan mode",
    ]);

    if (choice?.startsWith("Approve")) {
      approvePlan(ctx);
    } else if (choice === "Refine plan") {
      const refinement = await ctx.ui.editor("Refine the plan", "");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
    } else if (choice === "Cancel plan mode") {
      disablePlanMode(ctx);
    } else {
      updateUi(ctx);
      persistState();
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    planning = pi.getFlag("plan") === true;

    const state = ctx.sessionManager
      .getEntries()
      .filter((entry: PlanModeEntry) => entry.type === "custom" && entry.customType === STATE_ENTRY)
      .pop() as PlanModeEntry | undefined;

    if (state?.data) {
      planning = state.data.planning ?? planning;
      executing = state.data.executing ?? executing;
      items = state.data.items ?? items;
      previousTools = state.data.previousTools ?? previousTools;
    }

    if (planning) pi.setActiveTools(pickPlanTools(pi.getAllTools()));
    if (!planning && !executing) previousTools = undefined;
    updateUi(ctx);
  });
}
