import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Recover non-Slack Pi turns that fail because the Codex Responses provider
// reused stale WebSocket continuation state (`previous_response_id`).
//
// Installed pi-ai@0.79.9 clears that stale continuation after the failed
// request, but the failed user turn is lost because the agent-level retry
// classifier does not treat `previous_response_not_found` as retryable. This
// project-local extension re-queues the same user text once, so the next request
// is sent with a fresh/full context. Slack-originated messages are deliberately
// skipped: the dedicated `.pi/bridge-recovery/` extension owns those because it
// is co-loaded with pi-messenger-bridge and preserves Slack reply delivery state.

const SLACK_PREFIX_RE = /^\[(📱 |Slack #)/;
const RECOVERABLE_RE = /previous_response_not_found|previous response .*not found/i;

type AnyMsg = { role?: string; stopReason?: string; errorMessage?: string; content?: unknown };

function textOf(m: AnyMsg | undefined): string {
  if (!m || m.role !== "user") return "";
  const c = m.content as unknown;
  if (typeof c === "string") return c.trim();
  if (!Array.isArray(c)) return "";
  return c
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
}

function lastNonSlackUserText(messages: AnyMsg[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = textOf(messages[i]);
    if (!t) continue;
    return SLACK_PREFIX_RE.test(t) ? undefined : t;
  }
  return undefined;
}

function isRecoverable(event: any, messages: AnyMsg[]): boolean {
  if (RECOVERABLE_RE.test(String(event?.errorMessage ?? ""))) return true;
  return messages.some(
    (m) => m?.role === "assistant" && m?.stopReason === "error" && RECOVERABLE_RE.test(String(m?.errorMessage ?? "")),
  );
}

export default function (pi: ExtensionAPI): void {
  let lastRetriedText: string | undefined;

  const reset = () => {
    lastRetriedText = undefined;
  };

  pi.on("session_start", async () => reset());
  pi.on("session_shutdown", async () => reset());

  pi.on("agent_end", async (event: any) => {
    const messages: AnyMsg[] = Array.isArray(event?.messages) ? event.messages : [];

    if (!isRecoverable(event, messages)) {
      lastRetriedText = undefined;
      return;
    }

    const failedText = lastNonSlackUserText(messages);
    if (!failedText) {
      lastRetriedText = undefined;
      return;
    }

    if (lastRetriedText === failedText) {
      lastRetriedText = undefined;
      console.error("[codex-stale-response-retry] previous_response_not_found recovery exhausted; giving up");
      return;
    }

    lastRetriedText = failedText;
    console.error("[codex-stale-response-retry] stale previous_response_id — re-injecting failed turn once");
    try {
      pi.sendUserMessage(failedText, { deliverAs: "followUp" });
    } catch (err) {
      console.error("[codex-stale-response-retry] re-inject failed:", err);
    }
  });
}
