autoload -Uz compinit && compinit

autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
zstyle ':vcs_info:git:*' get-revision true
zstyle ':vcs_info:git:*' formats       '(%F{yellow}%b%f %F{244}@%i%f)'
zstyle ':vcs_info:git:*' actionformats '(%F{yellow}%b%f|%F{red}%a%f %F{244}@%i%f)'

+vi-shorten-rev() { hook_com[revision]=${hook_com[revision][1,7]} }
zstyle ':vcs_info:git+set-message:*' hooks shorten-rev

precmd() { vcs_info }

setopt PROMPT_SUBST
PROMPT='%B%F{green}%n@%m%f%b:%B%F{blue}%~%f%b$ '
if [[ -n "$SANDBOX_NAME" ]]; then
  _sandbox_prompt="%F{cyan}[$SANDBOX_NAME]%f "
else
  _sandbox_prompt=""
fi
RPROMPT='${_sandbox_prompt}${vcs_info_msg_0_}'

HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt HIST_IGNORE_DUPS SHARE_HISTORY

bindkey -e

alias claude='claude --dangerously-skip-permissions'
alias codex='codex --dangerously-bypass-approvals-and-sandbox'

cd ~/harness 2>/dev/null

source "${OH_PROJECT_ROOT:-$HOME/harness}/.oh/install/banner.sh" 2>/dev/null
