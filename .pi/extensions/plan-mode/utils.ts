export interface PlanItem {
  step: number;
  text: string;
  completed: boolean;
}

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(^|[^<])>(?!&|>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish|update)/i,
  /\bpip\s+(install|uninstall)/i,
  /\buv\s+(add|remove|pip\s+install)/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|switch|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_START_PATTERNS: RegExp[] = [
  /^\s*(cat|head|tail|less|more)\b/,
  /^\s*(grep|rg|find|fd|ag)\b/,
  /^\s*(ls|pwd|tree|eza|bat)\b/,
  /^\s*(echo|printf|wc|sort|uniq|diff|file|stat|du|df)\b/,
  /^\s*(which|whereis|type|env|printenv)\b/,
  /^\s*(uname|whoami|id|date|cal|uptime|ps|top|htop|free)\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-files|ls-tree|grep)\b/i,
  /^\s*(npm|pnpm|yarn)\s+(list|ls|view|info|search|outdated|audit|why)\b/i,
  /^\s*(node|python|python3|ruby|go|rustc|cargo|deno|bun)\s+(--version|-v|version)\b/i,
  /^\s*curl\s+/,
  /^\s*wget\s+-O\s*-/,
  /^\s*(jq|sed\s+-n|awk)\b/,
];

const READ_ONLY_TOOL_NAMES = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "question",
  "questionnaire",
  "ask_question",
]);

const MUTATING_TOOL_NAMES = new Set(["edit", "write"]);

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(toolName);
}

export function isMutatingTool(toolName: string): boolean {
  return MUTATING_TOOL_NAMES.has(toolName);
}

export function isSafeReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  return SAFE_START_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function normalizeToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];

  return tools.flatMap((tool) => {
    if (typeof tool === "string") return [tool];
    if (tool && typeof tool === "object" && "name" in tool) {
      const name = (tool as { name?: unknown }).name;
      return typeof name === "string" ? [name] : [];
    }
    return [];
  });
}

export function pickPlanTools(allTools: unknown, fallback = ["read", "bash", "grep", "find", "ls"]): string[] {
  const names = normalizeToolNames(allTools);
  const available = names.filter(isReadOnlyTool);
  return available.length > 0 ? available : fallback;
}

function cleanPlanText(text: string): string {
  let cleaned = text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned.replace(/^[\[({]\s*/, "").replace(/\s*[\])}]$/, "").trim();
  if (cleaned.length > 140) cleaned = `${cleaned.slice(0, 137)}...`;
  return cleaned;
}

export function extractPlanItems(message: string): PlanItem[] {
  const lines = message.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\s*(#{1,6}\s*)?(implementation\s+)?plan\s*:?\s*$/i.test(line));
  if (headerIndex === -1) return [];

  const items: PlanItem[] = [];
  let started = false;

  for (const line of lines.slice(headerIndex + 1)) {
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (!numbered) {
      if (started && line.trim() !== "") break;
      continue;
    }

    started = true;
    const cleaned = cleanPlanText(numbered[2] ?? "");
    if (cleaned.length < 4) continue;
    items.push({ step: items.length + 1, text: cleaned, completed: false });
  }

  return items;
}

export function extractDoneSteps(message: string): number[] {
  const steps: number[] = [];
  for (const match of message.matchAll(/\[DONE:(\d+)]/gi)) {
    const step = Number(match[1]);
    if (Number.isInteger(step) && step > 0) steps.push(step);
  }
  return steps;
}

export function markCompletedSteps(message: string, items: PlanItem[]): number {
  let changed = 0;
  for (const step of extractDoneSteps(message)) {
    const item = items.find((candidate) => candidate.step === step);
    if (item && !item.completed) {
      item.completed = true;
      changed += 1;
    }
  }
  return changed;
}

export function formatPlanItems(items: PlanItem[]): string {
  return items.map((item) => `${item.step}. ${item.completed ? "✓" : "☐"} ${item.text}`).join("\n");
}
