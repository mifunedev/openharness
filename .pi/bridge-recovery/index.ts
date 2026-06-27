import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Standalone Codex retry-recovery for the pi-messenger-bridge Slack session.
//
// The npm bridge (pi-messenger-bridge) chains Codex turns through the
// openai-codex Responses provider's connection-scoped `previous_response_id`.
// When that id goes stale the provider returns HTTP 400
// `previous_response_not_found`, clears its own cached continuation, and
// re-throws WITHOUT retrying — so a real Slack turn dies with `willRetry:false`
// and the user gets no reply. The npm package has no recovery hook (the custom
// extension's recovery from harness PR #283 was dropped in the npm swap).
//
// This extension is co-loaded ALONGSIDE the bridge (a 2nd `--extension` in
// .oh/devcontainer/client-slack-supervise.sh) — it does NOT patch node_modules. It
// owns the `agent_end` event (the bridge does not hook it, so no collision): on
// a recoverable provider-state error whose failed turn was Slack-originated, it
// re-injects that user text ONCE. The failed request already cleared the stale
// id, so the retry starts a fresh chain and succeeds; the bridge's
// `pendingRemoteChat` survives the errored turn, so the recovered reply is still
// delivered to Slack. See issue #282 / PR #482.
//
// It lives OUTSIDE .pi/extensions/ so pi's one-level `./extensions` auto-discovery
// never loads it implicitly (which would double-register the agent_end handler).

// Inbound Slack turns are stamped by the bridge as
//   `[📱 @<user> via <transport>]: <text>`  (pi-messenger-bridge dist/index.js)
// The legacy custom extension used `[Slack #<channel>] <user>: <text>`.
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

// The most recent user message — but only if THIS bridge originated it (carries
// the Slack prefix). Returns undefined for non-Slack turns so we never re-inject
// a message the bridge did not send.
function lastSlackUserText(messages: AnyMsg[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = textOf(messages[i]);
    if (t) return SLACK_PREFIX_RE.test(t) ? t : undefined;
  }
  return undefined;
}

// Tolerant across event shapes: the recoverable error may surface on the last
// assistant message (extension AgentEndEvent) or at the event top level.
function isRecoverable(event: any, messages: AnyMsg[]): boolean {
  if (RECOVERABLE_RE.test(String(event?.errorMessage ?? ""))) return true;
  return messages.some(
    (m) => m?.role === "assistant" && m?.stopReason === "error" && RECOVERABLE_RE.test(String(m?.errorMessage ?? "")),
  );
}

export default function (pi: ExtensionAPI): void {
  // One-retry-per-episode guard, keyed on the failed text: if our re-injected
  // turn hits the same recoverable error, we stop (don't loop forever).
  let lastRetriedText: string | undefined;

  const reset = () => {
    lastRetriedText = undefined;
  };
  pi.on("session_start", async () => reset());
  pi.on("session_shutdown", async () => reset());

  pi.on("agent_end", async (event: any) => {
    const messages: AnyMsg[] = Array.isArray(event?.messages) ? event.messages : [];

    if (!isRecoverable(event, messages)) {
      lastRetriedText = undefined; // clean / non-recoverable turn — reset guard
      return;
    }

    const failedText = lastSlackUserText(messages);
    if (!failedText) {
      lastRetriedText = undefined; // not bridge-originated — leave it alone
      return;
    }

    if (lastRetriedText === failedText) {
      // Our retry hit the same error — recovery exhausted, stop here.
      lastRetriedText = undefined;
      console.error("[slack-recovery] previous_response_not_found recovery exhausted; giving up on this turn");
      return;
    }

    lastRetriedText = failedText;
    console.error("[slack-recovery] stale previous_response_id — re-injecting the failed Slack turn once");
    try {
      // followUp queues it as the next user message (matches how the bridge
      // itself delivers inbound Slack messages), starting a fresh Codex chain.
      pi.sendUserMessage(failedText, { deliverAs: "followUp" });
    } catch (err) {
      console.error("[slack-recovery] re-inject failed:", err);
    }
  });
}
