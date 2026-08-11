#!/usr/bin/env bash
# tier: A
# source: issue #739 / independent FAIL — authenticated package-owned Slack compaction must preserve session continuity and use private exact-PID recovery
# desc: Exact bridge pin owns turn-boundary correlation while supervisor owns isolated --continue session and exact-peer Unix IPC
# shellcheck disable=SC2016
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GATEWAY="$ROOT/.oh/scripts/gateway.sh"
SUPERVISOR="$ROOT/.devcontainer/client-slack-supervise.sh"
DOC="$ROOT/.oh/docs/integrations/slack.md"
ARTIFACT_SMOKE="$ROOT/.oh/scripts/smoke-slack-bridge-artifact.sh"
PIN="4056384d7e3901809019e006185a68987fcc8c0b"

fail() { echo "REGRESSION: $*" >&2; exit 1; }
need() {
  local file="$1" literal="$2" label="$3"
  grep -Fq -- "$literal" "$file" || fail "$label"
}
reject() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq -- "$pattern" "$file"; then fail "$label"; fi
}

# The reviewed package commit is the only compact implementation artifact.
need "$GATEWAY" "git+https://github.com/ryaneggz/pi-messenger-bridge.git#$PIN" "gateway is not pinned to reviewed compact-control commit"
[ ! -e "$ROOT/.pi/slack-compact" ] || fail "in-tree Slack compact implementation must not coexist with package control"
[ ! -e "$ROOT/.oh/templates/full/.pi/slack-compact" ] || fail "template vendors a duplicate Slack compact implementation"
reject "$GATEWAY" 'COMPACT_ENTRY|slack-compact/index\.ts' "gateway still loads removed local compact extension"
need "$ARTIFACT_SMOKE" "$PIN" "installed-artifact lifecycle smoke is not bound to reviewed bridge commit"
need "$ARTIFACT_SMOKE" 'session_start' "installed-artifact smoke does not execute the extension lifecycle"

# Launch two must reopen launch one's compacted active path.
need "$SUPERVISOR" 'SESSION_DIR="${GATEWAY_PI_SESSION_DIR:-$STATE_DIR/pi-sessions}"' "isolated persistent gateway session directory missing"
need "$SUPERVISOR" '--session-dir "$SESSION_DIR" --continue' "Pi does not explicitly continue the isolated gateway session"
need "$SUPERVISOR" 'chmod 700 "$SESSION_DIR"' "gateway session directory is not private"

# Private one-shot IPC: mode-0600 Unix listener is ready before launch, accepts
# only the exact direct-child Pi SID/PGID through Linux peer credentials, and the
# path is explicitly not treated as a secret.
need "$SUPERVISOR" 'socket.SO_PEERCRED' "Linux peer-credential authentication missing"
need "$SUPERVISOR" 'os.chmod(socket_path, 0o600)' "compact socket is not mode 0600"
need "$SUPERVISOR" 'wait_for_file "$IPC_READY"' "listener-ready synchronization missing"
need "$SUPERVISOR" 'export PI_MSG_BRIDGE_COMPACT_SOCKET="$IPC_SOCKET"' "compact socket path not passed to Pi"
need "$SUPERVISOR" 'peer_ppid != supervisor_pid' "peer is not bound to supervisor direct child"
need "$SUPERVISOR" 'peer_pgid != peer_pid' "peer is not bound to isolated Pi process group"
need "$SUPERVISOR" 'peer_sid != peer_pid' "peer is not bound to isolated Pi session"
need "$SUPERVISOR" 'connection.recv(2) == b"C"' "one-shot completion read missing"
need "$SUPERVISOR" 'connection.sendall(b"A")' "authenticated completion acknowledgement missing"
need "$SUPERVISOR" 'rendezvous metadata, not a secret' "socket path is falsely presented as a secret"
reject "$SUPERVISOR" 'PI_MSG_BRIDGE_COMPACT_FD|mkfifo|SLACK_COMPACT_NONCE|openharness-slack-compact-complete' "forgeable legacy IPC remains"

# Exact isolated group, bounded TERM→KILL, completion-vs-rc synchronization, and cleanup.
need "$SUPERVISOR" 'setsid pi --session-dir "$SESSION_DIR"' "Pi is not launched in an isolated session/process group"
need "$SUPERVISOR" 'kill -TERM -- "-$pgid"' "watcher does not TERM the recorded exact Pi process group"
need "$SUPERVISOR" 'kill -KILL -- "-$pgid"' "bounded escalation does not KILL stubborn descendants"
need "$SUPERVISOR" 'cd "$HARNESS"' "supervisor does not pin Pi continuation cwd to the harness"
reject "$SUPERVISOR" 'pkill[[:space:]]+-[fP]' "broad pkill remains in supervisor recovery"
need "$SUPERVISOR" 'wait "$COMPACT_WATCHER"' "main loop does not settle completion watcher before rc gate"
need "$SUPERVISOR" 'terminate_authenticated_group "$authenticated_pid"' "authenticated peer group is not restarted exactly"
need "$SUPERVISOR" 'trap on_signal INT TERM HUP' "signal cleanup trap missing"
need "$SUPERVISOR" 'trap cleanup_all EXIT' "EXIT cleanup trap missing"
need "$SUPERVISOR" 'terminate_authenticated_group "$PI_PGID"' "signal cleanup depends on the exited Pi leader instead of its authenticated PGID"
need "$SUPERVISOR" 'rm -f "$STATE" "$HEARTBEAT_FILE"' "supervisor state and heartbeat cleanup missing"
need "$SUPERVISOR" 'if [ "$BACKEND" = pi ]; then rm -f "$LOCK"' "Pi lock cleanup missing"
need "$SUPERVISOR" 'date -u +%s >"$COMPACT_FILE"' "compaction recovery status missing"

# Operator contract reflects direct delivery and package ownership without a
# false native Slack slash-command claim.
need "$DOC" 'posts the acknowledgement directly to' "direct acknowledgement undocumented"
need "$DOC" 'originating Slack chat/thread' "origin chat/thread correlation undocumented"
need "$DOC" 'Linux peer credentials' "exact-peer IPC contract undocumented"
need "$DOC" 'path is not a secret' "socket-path threat model undocumented"
need "$DOC" '`message_start`' "late remote destination activation undocumented"
need "$DOC" '`message_end`' "internal correlation marker removal undocumented"
need "$DOC" '--session-dir' "continued isolated session contract undocumented"
need "$DOC" 'register or claim a native Slack' "native slash caveat missing"
need "$DOC" '`/compact` slash command' "native slash command caveat missing"
if grep -Fq '"command": "/compact"' "$ROOT/.pi/install/slack-manifest.json"; then
  fail "Slack manifest falsely registers native /compact"
fi

echo "PASS: package-owned Slack compact is turn-correlated, continued, exact-peer IPC, and exact-group supervised" >&2
