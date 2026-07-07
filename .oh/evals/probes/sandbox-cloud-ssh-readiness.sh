#!/usr/bin/env bash
# tier: A
# source: issue #341 (cloud SSH readiness) 2026-07-07
# desc: SANDBOX_CLOUD must wire cloud auth + persisted SSH host keys while SANDBOX_SSH remains opt-in and pubkey-first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"
DOC="$ROOT/.oh/docs/integrations/sshd.md"

if [[ ! -f "$ENTRYPOINT" || ! -f "$DOC" ]]; then
  echo "SKIPPED: entrypoint or sshd docs missing" >&2
  exit 2
fi

fails=()

has_entrypoint() {
  local needle="$1"
  local label="$2"
  grep -Fq -- "$needle" "$ENTRYPOINT" || fails+=("entrypoint missing: $label")
}

has_docs() {
  local needle="$1"
  local label="$2"
  grep -Fq -- "$needle" "$DOC" || fails+=("docs missing: $label")
}

has_entrypoint 'if [ "${SANDBOX_CLOUD:-false}" = "true" ]; then' 'SANDBOX_CLOUD=true guard'
has_entrypoint 'configure_cloud_agent_auth' 'cloud agent-auth setup function/call'
has_entrypoint 'configure_cloud_ssh_host_keys' 'cloud host-key setup function/call'
has_entrypoint 'local auth_root="/mnt/agent-auth"' '/mnt/agent-auth auth root'
has_entrypoint 'gosu sandbox mkdir -p "$target_path" "$parent"' 'auth targets created as sandbox user'
has_entrypoint 'gosu sandbox ln -s "$target_path" "$home_path"' 'home credential symlinks created as sandbox user'
has_entrypoint 'local key_dir="$OH_PROJECT_ROOT/.oh/.ssh-hostkeys"' 'workspace-persisted SSH host-key directory'
has_entrypoint 'ln -s "$store_path" "$etc_path"' 'host keys symlinked into /etc/ssh'
has_entrypoint 'ssh-keygen -q -t ed25519 -N "" -f "$store_path"' 'cloud first-boot host-key generation writes to the persisted directory'
has_entrypoint 'ssh-keygen -A >/dev/null 2>&1 || true' 'non-cloud sshd host-key generation remains present'
has_entrypoint 'if [ "${SANDBOX_SSH:-false}" = "true" ] && [ -x /usr/sbin/sshd ]; then' 'sshd remains gated only by SANDBOX_SSH'
has_entrypoint '_pw_auth=no' 'password auth default remains disabled'
has_entrypoint 'SANDBOX_SSH_AUTHORIZED_KEYS' 'authorized_keys env seeding remains present'
has_entrypoint '_ssh_real_dir="$(readlink -f "$_ssh_dir"' 'authorized_keys chown follows the cloud .ssh symlink target'
has_entrypoint 'chown -R "$(sandbox_ownership)" "$_ssh_real_dir"' 'authorized_keys ownership repaired on the resolved .ssh directory'
has_entrypoint 'PasswordAuthentication ${_pw_auth}' 'sshd drop-in still uses explicit password-auth switch'

for spec in '.claude:claude' '.codex:codex' '.pi:pi' '.config/gh:gh' '.ssh:ssh'; do
  has_entrypoint "$spec" "agent-auth mapping $spec"
done

has_docs 'SANDBOX_CLOUD=true' 'cloud env flag documented'
has_docs '/mnt/agent-auth' 'agent-auth access point documented'
has_docs '/home/sandbox/harness/.oh/.ssh-hostkeys/' 'persisted host-key path documented'
has_docs 'SANDBOX_SSH_PASSWORD_AUTH' 'password-auth guidance documented'

# Regression floor: cloud mode must not be an alternate sshd enablement path.
if grep -Eq 'SANDBOX_SSH:-false.*SANDBOX_CLOUD|SANDBOX_CLOUD.*SANDBOX_SSH:-false' "$ENTRYPOINT"; then
  fails+=("SANDBOX_CLOUD must not be folded into the SANDBOX_SSH sshd gate")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: cloud SSH readiness contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: SANDBOX_CLOUD wires agent-auth symlinks + persisted host keys, while SANDBOX_SSH stays opt-in with pubkey-first defaults" >&2
exit 0
