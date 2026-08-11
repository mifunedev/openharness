#!/usr/bin/env bash
# Install the exact reviewed bridge git artifact, then exercise its built dist
# through the real extension session_start/session_shutdown lifecycle.
set -euo pipefail

PIN="github:ryaneggz/pi-messenger-bridge#81d8ed92b88cb9dfc71db0a9db084d1169fec36d"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/slack-bridge-artifact.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM HUP

mkdir -p "$TMP/home" "$TMP/install"
npm install --prefix "$TMP/install" --no-fund --no-audit "$PIN" >/dev/null

ENTRY="$TMP/install/node_modules/pi-messenger-bridge/dist/index.js"
CONTROL="$TMP/install/node_modules/pi-messenger-bridge/dist/compact-control.js"
[ -f "$ENTRY" ] || { echo "installed bridge entry missing: $ENTRY" >&2; exit 1; }
[ -f "$CONTROL" ] || { echo "installed compact controller missing: $CONTROL" >&2; exit 1; }
grep -Fq '81d8ed92b88cb9dfc71db0a9db084d1169fec36d' "$TMP/install/package-lock.json" \
  || { echo "installed bridge lock is not bound to the reviewed commit" >&2; exit 1; }

env -u PI_SLACK_APP_TOKEN -u PI_SLACK_BOT_TOKEN \
  -u PI_TELEGRAM_TOKEN -u PI_WHATSAPP_AUTH_PATH -u PI_DISCORD_TOKEN \
  -u PI_MATRIX_HOMESERVER -u PI_MATRIX_ACCESS_TOKEN \
  HOME="$TMP/home" PI_OFFLINE=1 node --input-type=module - "$ENTRY" <<'NODE'
import { pathToFileURL } from "node:url";

const entry = process.argv[2];
const extension = (await import(pathToFileURL(entry).href)).default;
if (typeof extension !== "function") throw new Error("installed bridge has no extension factory");

const handlers = new Map();
let commandRegistered = false;
const pi = {
  on(name, handler) {
    const list = handlers.get(name) ?? [];
    list.push(handler);
    handlers.set(name, list);
  },
  registerCommand(name) {
    if (name === "msg-bridge") commandRegistered = true;
  },
  sendUserMessage() {
    throw new Error("empty-config lifecycle unexpectedly entered an agent turn");
  },
};
extension(pi);

const context = {
  cwd: process.cwd(),
  compact() {},
  isIdle: () => true,
  ui: { notify() {}, setWidget() {} },
};
for (const handler of handlers.get("session_start") ?? []) {
  await handler({ reason: "startup" }, context);
}
await new Promise((resolve) => setTimeout(resolve, 0));
for (const handler of handlers.get("session_shutdown") ?? []) {
  await handler({ reason: "quit" }, context);
}

if (!commandRegistered) throw new Error("installed bridge did not register /msg-bridge");
if (!(handlers.get("agent_settled")?.length > 0)) {
  throw new Error("installed bridge did not register agent_settled control");
}
NODE

echo "PASS: exact installed bridge artifact built and completed extension lifecycle" >&2
