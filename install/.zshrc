# Completion (zsh native)
autoload -Uz compinit && compinit

# Git info in RPROMPT: [sandbox] (branch @short-hash) — empty outside a repo.
#   sandbox — cyan, only shown when $SANDBOX_NAME is set (inside a sandbox)
#   branch  — yellow
#   @hash   — dim (first 7 chars of HEAD)
#   action  — red during rebase/merge/cherry-pick
autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' get-revision true
zstyle ':vcs_info:git:*' formats       '(%F{yellow}%b%f %F{244}@%i%f)'
zstyle ':vcs_info:git:*' actionformats '(%F{yellow}%b%f|%F{red}%a%f %F{244}@%i%f)'

# Abbreviate SHA to 7 chars
+vi-shorten-rev() { hook_com[revision]=${hook_com[revision][1,7]} }
zstyle ':vcs_info:git+set-message:*' hooks shorten-rev

precmd() { vcs_info }

# Bash-like left prompt (Ubuntu default: green user@host, blue path).
# Sandbox + branch live in RPROMPT.
setopt PROMPT_SUBST
PROMPT='%B%F{green}%n@%m%f%b:%B%F{blue}%~%f%b$ '
# $SANDBOX_NAME is exported by docker-compose inside the sandbox; empty on the host.
if [[ -n "$SANDBOX_NAME" ]]; then
  _sandbox_prompt="%F{cyan}[$SANDBOX_NAME]%f "
else
  _sandbox_prompt=""
fi
RPROMPT='${_sandbox_prompt}${vcs_info_msg_0_}'

# History — dedup + share across sessions
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt HIST_IGNORE_DUPS SHARE_HISTORY

# Keybindings — emacs mode (matches bash default)
bindkey -e

# Aliases (mirror .bashrc)
alias claude='claude --dangerously-skip-permissions'
alias codex='codex --dangerously-bypass-approvals-and-sandbox'

cd ~/harness 2>/dev/null
