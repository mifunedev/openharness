# Root package audit — pi-messenger-bridge admin commands

## Scope

Audit target: the package that Open Harness installs for the Pi Slack gateway, `pi-messenger-bridge`.

The installed package metadata reports:

- package: `pi-messenger-bridge`
- version: `0.4.0`
- repository: `https://github.com/tintinweb/pi-messenger-bridge.git`
- harness install pin: `github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies`
- installed resolved commit observed in `.pi/bridge/package-lock.json`: `dca59db0482e97a9ef85e1a3a49da937e9b94bc5`

The source audit cloned `git@github.com:ryaneggz/pi-messenger-bridge.git` and checked out `dca59db0482e97a9ef85e1a3a49da937e9b94bc5` to inspect the package root README and TypeScript source, not just the generated harness docs.

## Commands run

```bash
# local installed package evidence
nl -ba .pi/bridge/node_modules/pi-messenger-bridge/README.md | sed -n '128,154p'
nl -ba .pi/bridge/node_modules/pi-messenger-bridge/dist/index.js | sed -n '210,250p'
nl -ba .pi/bridge/node_modules/pi-messenger-bridge/dist/transports/slack.js | sed -n '112,132p'
nl -ba .pi/bridge/node_modules/pi-messenger-bridge/dist/auth/challenge-auth.js | sed -n '145,215p'
git show 2acd2b76:.pi/install/slack-manifest.json | nl -ba | sed -n '37,52p'
jq '.features.slash_commands' .pi/install/slack-manifest.json
grep -n 'node_modules/pi-messenger-bridge' -A12 .pi/bridge/package-lock.json

# source package evidence
rm -rf /tmp/pi-messenger-bridge-audit
git clone --no-checkout git@github.com:ryaneggz/pi-messenger-bridge.git /tmp/pi-messenger-bridge-audit
cd /tmp/pi-messenger-bridge-audit
git checkout dca59db0482e97a9ef85e1a3a49da937e9b94bc5
nl -ba README.md | sed -n '128,154p'
nl -ba src/index.ts | sed -n '272,312p'
nl -ba src/transports/slack.ts | sed -n '144,165p'
nl -ba src/auth/challenge-auth.ts | sed -n '199,285p'
nl -ba src/auth/challenge-auth.ts | sed -n '370,389p'

# implemented package branch verification
git switch feat/slack-thread-replies-admin-commands
npm run typecheck
npm run test
npm run build
```

## Evidence

### 1. Package root README separates Pi commands from admin DM commands

The package README `## Commands` table lists only `/msg-bridge` forms as command entries:

```text
README.md:128 ## Commands
README.md:132 | `/msg-bridge` | Open interactive menu (configure, connect, widget, help) |
README.md:133 | `/msg-bridge status` | Show connection and user status |
README.md:139 | `/msg-bridge help` | Show command reference |
```

The same README then has a separate section:

```text
README.md:141 ### Admin commands (in DM with the bot)
README.md:143 Trusted users can DM the bot directly to manage state. Reply with `/help` for the full list:
README.md:147 | `/help` | Show admin command reference |
README.md:148 | `/trusted` | List trusted users |
README.md:150 | `/channels` | List enabled channels |
README.md:151 | `/enable <chatId> <all|mentions|trusted-only>` | Enable a channel |
```

Conclusion: the upstream/root package README does not define `/trusted` or `/channels` as Pi in-session commands; it defines them as DM messages after trust.

### 2. Package source registers only the Pi `/msg-bridge` command

`src/index.ts` registers one Pi command:

```text
src/index.ts:272 /**
src/index.ts:273  * /msg-bridge command - show status or manage connections
src/index.ts:275 pi.registerCommand("msg-bridge", {
src/index.ts:276   description: "Manage remote messenger connections (help|status|connect|disconnect|configure|widget)",
src/index.ts:293   case "help": {
src/index.ts:297   "/msg-bridge                   Open interactive menu",
src/index.ts:298   "/msg-bridge help              Show this help",
src/index.ts:299   "/msg-bridge status            Show connection and user status",
```

Conclusion: there is no Pi command registration for `trusted`, `channels`, `enable`, `disable`, `revoke`, or plain `help`.

### 3. Slack transport routes DM slash text to the auth handler

`src/transports/slack.ts` calls the auth command handler only for non-group Slack messages whose text begins with `/` or is a 6-digit challenge code:

```text
src/transports/slack.ts:144 const isAuthorized = await this.auth.checkAuthorization(...)
src/transports/slack.ts:154 // Handle admin commands and challenge codes in DM
src/transports/slack.ts:155 if (!isGroupChat && (text.startsWith("/") || text.match(/^\d{6}$/))) {
src/transports/slack.ts:156   const handled = await this.auth.handleAdminCommand(...)
src/transports/slack.ts:163   if (handled) {
src/transports/slack.ts:164     return;
```

Conclusion: admin commands are message-event text parsed by the bridge, not Slack app slash-command endpoints.

### 4. Auth handler gates admin commands on trust

`src/auth/challenge-auth.ts` returns early for non-trusted users unless the message is a valid active 6-digit challenge response:

```text
src/auth/challenge-auth.ts:209 // Non-admin users: check for challenge code entry
src/auth/challenge-auth.ts:210 if (!this.trustedUsers.has(namespacedUserId)) {
src/auth/challenge-auth.ts:211   const challenge = this.challenges.get(namespacedUserId);
src/auth/challenge-auth.ts:212   if (challenge && text.match(/^\d{6}$/)) {
src/auth/challenge-auth.ts:213     return await this.validateChallenge(namespacedUserId, text, sendMessage);
src/auth/challenge-auth.ts:215   return false;
```

Only after that gate does it switch on admin commands:

```text
src/auth/challenge-auth.ts:222 switch (cmd) {
src/auth/challenge-auth.ts:223   case "/help":
src/auth/challenge-auth.ts:227   case "/enable":
src/auth/challenge-auth.ts:241   case "/disable":
src/auth/challenge-auth.ts:252   case "/channels":
src/auth/challenge-auth.ts:260   case "/trusted":
src/auth/challenge-auth.ts:280   case "/revoke":
```

Conclusion: an untrusted Slack DM `/help` is not expected to show admin help; it participates in challenge auth. Admin help is expected only after the Slack user is trusted and the message reaches the bot.

### 5. Original manifest/package gap

Before the corrective implementation, the harness manifest had Socket Mode
message event subscriptions but no `features.slash_commands`, while the package
Slack transport had `app.message(...)` but no Bolt `app.command(...)` handlers.
That combination explained why the package README could document slash-prefixed
admin DM text while Slack did not advertise or route native slash commands.

A manifest-only change would be incomplete: Slack could emit command payloads,
but the bridge would have no command listener to acknowledge and dispatch them.

## Grounded RCA

The package root README documents `/trusted`, but specifically under "Admin commands (in DM with the bot)," while the actual Slack integration originally supplied neither manifest slash-command declarations nor Bolt command handlers. Open Harness docs then compounded that product gap by telling operators to run `/trusted` and `/channels` "inside the session." The complete RCA is therefore two-part: stale harness docs conflated Pi and Slack surfaces, and the `.pi` Slack app/package wiring did not implement the native Slack command surface implied by slash-prefixed names.

## Best approach

1. Keep Pi TUI/session commands under `/msg-bridge`.
2. Add the documented Slack admin commands to
   `.pi/install/slack-manifest.json` so Slack advertises/routes them.
3. Pair the manifest with package-owned Bolt `app.command(...)` handlers that
   acknowledge command payloads, enforce DM-only + challenge trust, and delegate
   to the existing `ChallengeAuth.handleAdminCommand` implementation.
4. Pin Open Harness to the reviewed bridge fork branch carrying those handlers
   until upstream publishes them.
5. Preserve reliable operator fallbacks:
   - `gateway status`
   - `tmux capture-pane -t client-slack-pi -p | grep -F '[Slack] Bot user ID:'`
   - `jq '.auth' ~/.pi/msg-bridge.json`
   - `.pi/msg-bridge.json` pre-seeding plus `gateway pi --restart`

Implemented package branch/PR:
https://github.com/ryaneggz/pi-messenger-bridge/pull/1, landed as exact commit
`c8b96e9d0fb69611c4e67ae298d1d10d83792a26` (source commits `aec340e`,
`86cbd50`). Clean-source package checks (`npm run clean` before test): typecheck PASS, 86 tests PASS (including trusted-DM dispatch, channel rejection, and untrusted challenge coverage), build PASS. A clean `npm install github:ryaneggz/pi-messenger-bridge#feat/slack-thread-replies-admin-commands` smoke test also produced `dist/transports/slack.js` containing `this.app.command(...)`.
