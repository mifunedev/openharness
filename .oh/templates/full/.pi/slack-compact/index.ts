import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Gateway-only Slack compaction for the dedicated client-slack-pi session.
//
// This file intentionally lives outside .pi/extensions/: it must never be
// auto-discovered by local TUI, cron, or other Pi sessions. gateway.sh passes it
// as the THIRD --extension, after pi-messenger-bridge and bridge-recovery.
//
// Trust boundary: pi-messenger-bridge authenticates the Slack user/channel
// before it calls sendUserMessage() with the [📱 ... via slack] stamp. This
// extension does not duplicate bridge authorization; it accepts only that exact
// extension-originated stamp and therefore depends on the bridge preserving its
// authorize-before-forward ordering.

export const MAX_CUSTOM_INSTRUCTIONS = 500;
export const ACKNOWLEDGEMENT =
  "Compaction requested. I’ll compact this session, then the Slack gateway will restart and reconnect.";
export const BUSY_ACKNOWLEDGEMENT = "A Slack session compaction is already in progress.";
export const INVALID_ACKNOWLEDGEMENT =
  `Compaction instructions must be ${MAX_CUSTOM_INSTRUCTIONS} characters or fewer and contain no control characters.`;

const ACK_PROMPT = `Reply with exactly this sentence and nothing else: ${ACKNOWLEDGEMENT} Do not call tools.`;
const BUSY_PROMPT = `Reply with exactly this sentence and nothing else: ${BUSY_ACKNOWLEDGEMENT} Do not call tools.`;
const INVALID_PROMPT = `Reply with exactly this sentence and nothing else: ${INVALID_ACKNOWLEDGEMENT} Do not call tools.`;
const UNAVAILABLE_PROMPT =
  "Reply with exactly this sentence and nothing else: Slack session compaction is unavailable because gateway recovery is not configured. Do not call tools.";

const SLACK_STAMP_RE = /^\[📱 @[^\]\r\n]{1,128} via slack\]: ([\s\S]*)$/;
const NATURAL_COMMAND_RE = /^(?:compact session|compact current session|compact the current session)$/i;
const SLASH_COMMAND_RE = /^\/compact(?: ([\s\S]*))?$/i;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
const NONCE_RE = /^[a-f0-9]{48}$/;
const MARKER_PREFIX = "[openharness-slack-compact-complete:";

export type CompactParseResult =
  | { kind: "none" }
  | { kind: "request"; customInstructions?: string }
  | { kind: "reject"; reason: "control-characters" | "instructions-too-long" };

export function parseSlackCompactRequest(text: string): CompactParseResult {
  const stamped = SLACK_STAMP_RE.exec(text);
  if (!stamped) return { kind: "none" };

  // Trim ordinary spaces only. Newlines/tabs remain visible to the strict
  // grammar and control-character rejection instead of being normalized away.
  const body = stamped[1].replace(/^ +| +$/g, "");
  if (NATURAL_COMMAND_RE.test(body)) return { kind: "request" };

  const slash = SLASH_COMMAND_RE.exec(body);
  if (!slash) return { kind: "none" };

  const instructions = slash[1]?.trim();
  if (!instructions) return { kind: "request" };
  if (CONTROL_RE.test(instructions)) return { kind: "reject", reason: "control-characters" };
  if (Array.from(instructions).length > MAX_CUSTOM_INSTRUCTIONS) {
    return { kind: "reject", reason: "instructions-too-long" };
  }
  return { kind: "request", customInstructions: instructions };
}

export function completionMarker(nonce: string): string {
  return `${MARKER_PREFIX}${nonce}]`;
}

type AssistantMessage = {
  role?: string;
  content?: unknown;
};

function assistantTurn(message: AssistantMessage | undefined): { text: string; hasToolCall: boolean } {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) {
    return { text: "", hasToolCall: false };
  }

  let hasToolCall = false;
  const text = message.content
    .filter((block: unknown) => {
      if (!block || typeof block !== "object") return false;
      const type = String((block as { type?: unknown }).type ?? "");
      if (type === "toolCall" || type === "tool_call") hasToolCall = true;
      return type === "text" && typeof (block as { text?: unknown }).text === "string";
    })
    .map((block: unknown) => (block as { text: string }).text)
    .join("\n")
    .trim();

  return { text, hasToolCall };
}

export default function slackCompact(pi: ExtensionAPI): void {
  type Phase = "idle" | "awaiting-ack" | "compacting";
  let phase: Phase = "idle";
  let customInstructions: string | undefined;
  const nonce = process.env.SLACK_COMPACT_NONCE ?? "";
  const recoveryReady = NONCE_RE.test(nonce);

  const reset = () => {
    phase = "idle";
    customInstructions = undefined;
  };

  pi.on("session_start", async () => reset());
  pi.on("session_shutdown", async () => reset());

  pi.on("input", async (event: { text: string; source?: string }) => {
    // sendUserMessage() marks bridge traffic as extension-originated. Requiring
    // both source and stamp prevents a local TUI paste of the stamp from acting
    // as a remote control command.
    if (event.source !== "extension") return { action: "continue" as const };

    const parsed = parseSlackCompactRequest(event.text);
    if (parsed.kind === "none") return { action: "continue" as const };
    if (parsed.kind === "reject") return { action: "transform" as const, text: INVALID_PROMPT };
    if (!recoveryReady) return { action: "transform" as const, text: UNAVAILABLE_PROMPT };
    if (phase !== "idle") return { action: "transform" as const, text: BUSY_PROMPT };

    phase = "awaiting-ack";
    customInstructions = parsed.customInstructions;
    return { action: "transform" as const, text: ACK_PROMPT };
  });

  pi.on("turn_end", async (event: { message?: AssistantMessage }, ctx) => {
    if (phase !== "awaiting-ack") return;

    const turn = assistantTurn(event.message);
    // The bridge's earlier turn_end handler posts non-empty text first. Tool or
    // empty turns leave pendingRemoteChat intact; wait for a later plain-text
    // assistant turn rather than compacting prematurely.
    if (!turn.text || turn.hasToolCall) return;

    const instructions = customInstructions;
    phase = "compacting";
    customInstructions = undefined;

    try {
      ctx.compact({
        customInstructions: instructions,
        onComplete: () => {
          // The supervisor exact-matches this launch's nonce from EOF. Do not
          // add prose, user data, or errors to this machine marker.
          console.error(completionMarker(nonce));
        },
        onError: () => {
          console.error("[slack-compact] compaction failed; gateway remains connected");
          reset();
        },
      });
    } catch {
      console.error("[slack-compact] compaction could not start; gateway remains connected");
      reset();
    }
  });
}
