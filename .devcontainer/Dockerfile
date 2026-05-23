FROM debian:bookworm-slim

ENV TZ=America/Denver

# ─── System packages ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client build-essential ca-certificates curl wget sudo gosu git jq gnupg \
    lsb-release nano ripgrep tmux unzip bash-completion procps less \
    iproute2 zsh \
 && rm -rf /var/lib/apt/lists/*

# ─── Node.js 22.x ──────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# ─── GitHub CLI ─────────────────────────────────────────────────────
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# ─── Docker CLI + Compose ──────────────────────────────────────────
RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# ─── Cloudflared ───────────────────────────────────────────────────
RUN curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
      -o /usr/share/keyrings/cloudflare-main.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" \
      > /etc/apt/sources.list.d/cloudflared.list \
 && apt-get update && apt-get install -y --no-install-recommends cloudflared \
 && rm -rf /var/lib/apt/lists/*

# ─── Bun ────────────────────────────────────────────────────────────
RUN BUN_INSTALL=/usr/local curl -fsSL https://bun.sh/install | bash

# ─── uv ─────────────────────────────────────────────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh \
 && cp /root/.local/bin/uv /usr/local/bin/uv \
 && cp /root/.local/bin/uvx /usr/local/bin/uvx

# ─── DeepAgents CLI ────────────────────────────────────────────────
# Install via `uv tool install` into image-level locations so the
# `deepagents` executable is on PATH for the sandbox user. Avoid
# user-home installs that would land in /root/.local/bin only.
ENV UV_TOOL_DIR=/opt/uv/tools
ENV UV_TOOL_BIN_DIR=/usr/local/bin
RUN mkdir -p "$UV_TOOL_DIR" \
 && uv tool install deepagents-cli

# ─── pnpm (via corepack) ───────────────────────────────────────────
ENV PNPM_HOME="/usr/local/share/pnpm"
ENV NPM_USER_PREFIX="/home/sandbox/.local"
ENV PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@latest --activate \
 && pnpm setup --force 2>/dev/null || true

# ─── Agent CLIs ─────────────────────────────────────────────────────
# Use npm (not pnpm) for global CLI installs. Agent CLI packages require
# postinstall scripts to download platform-native binaries; npm executes these
# by default without extra configuration.
#
# AGENTS is a comma-separated list of agent CLI keys to install. The default
# is claude-code + codex + pi-coding-agent + opencode. pi-coding-agent is
# installed later under the sandbox user's npm prefix so `pi update` can
# self-update without sudo. The pi-coding-agent key resolves to
# @earendil-works/pi-coding-agent (the @mariozechner/... package is deprecated
# upstream as of late 2026). Downstream harness packs (e.g. @ryaneggz/mifune)
# install additional CLIs via their install-hook.sh.
SHELL ["/bin/bash", "-c"]

ARG AGENTS="claude-code,codex,pi-coding-agent,opencode"

RUN set -e; \
    declare -A PKG=( \
        [claude-code]=@anthropic-ai/claude-code \
        [codex]=@openai/codex \
        [pi-coding-agent]=@earendil-works/pi-coding-agent \
        [opencode]=opencode-ai \
    ); \
    IFS=',' read -ra agents <<< "$AGENTS"; \
    for a in "${agents[@]}"; do \
        if [ "$a" = "pi-coding-agent" ]; then continue; fi; \
        pkg="${PKG[$a]:-}"; \
        if [ -n "$pkg" ]; then npm install -g "$pkg"; \
        else echo "Unknown agent: $a"; exit 1; fi; \
    done

# ─── Open Harness `oh` CLI ──────────────────────────────────────────
# Build the in-tree `oh` CLI (apps/oh/) into a self-contained bundle,
# install onto $PATH. Source is COPY'd to /opt/oh (outside the
# bind-mount) so the bundled binary survives the bind-mount overlay.
# v1 ships `oh config slack` (Slack integration setup wizard).
COPY apps/oh/ /opt/oh/
RUN cd /opt/oh && npm install --no-audit --no-fund && npm run build \
 && chmod +x /opt/oh/dist/oh.js \
 && ln -sf /opt/oh/dist/oh.js /usr/local/bin/oh

# ─── Sandbox user ──────────────────────────────────────────────────
RUN useradd -m -s /bin/zsh sandbox \
 && echo "sandbox ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sandbox \
 && chmod 0440 /etc/sudoers.d/sandbox \
 && groupadd -f docker && usermod -aG docker sandbox

# Pi self-updates only when its package directory and parent are writable.
# Install it under sandbox's npm prefix, and put that bin directory before
# /usr/bin so `pi update` updates the active executable without sudo.
RUN set -e; \
    install -d -o sandbox -g sandbox "$NPM_USER_PREFIX"; \
    if [[ ",${AGENTS}," == *",pi-coding-agent,"* ]]; then \
        su - sandbox -c 'npm --prefix "$HOME/.local" install -g --ignore-scripts @earendil-works/pi-coding-agent'; \
    fi

# ─── oh-my-zsh + plugins ───────────────────────────────────────────
# Install as sandbox so $HOME resolves and files land with correct ownership.
# RUNZSH/CHSH=no keeps the installer from trying to exec zsh or re-run chsh.
RUN su - sandbox -c "RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)\" --unattended" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions         /home/sandbox/.oh-my-zsh/custom/plugins/zsh-autosuggestions" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting     /home/sandbox/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-history-substring-search /home/sandbox/.oh-my-zsh/custom/plugins/zsh-history-substring-search"

# Default tmux config for sandbox user
COPY --chown=sandbox:sandbox install/.tmux.conf /home/sandbox/.tmux.conf

# Default .zshrc for sandbox user (overrides the oh-my-zsh template)
COPY --chown=sandbox:sandbox install/.zshrc /home/sandbox/.zshrc

# Ensure user npm bin + PNPM_HOME are on PATH for login shells (SSH, openharness shell).
# bash reads .profile; zsh reads .zprofile — mirror the exports into both.
RUN printf '%s\n' \
      'export NPM_USER_PREFIX="/home/sandbox/.local"' \
      'export PNPM_HOME="/usr/local/share/pnpm"' \
      'export PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"' \
      | tee -a /home/sandbox/.profile /home/sandbox/.zprofile \
 && chown sandbox:sandbox /home/sandbox/.profile /home/sandbox/.zprofile

# Shell aliases for agent CLIs (bash fallback — .zshrc ships with these baked in)
RUN echo "alias claude='claude --dangerously-skip-permissions'" >> /home/sandbox/.bashrc \
 && echo "alias codex='codex --dangerously-bypass-approvals-and-sandbox'" >> /home/sandbox/.bashrc

# Git safe.directory for bind-mounted project
RUN su - sandbox -c "git config --global --add safe.directory /home/sandbox/harness"

# Default working directory for interactive shells (SSH + terminal attach, bash fallback)
RUN echo 'cd ~/harness 2>/dev/null' >> /home/sandbox/.bashrc

# Image-level devcontainer config — VS Code reads this on "Attach to Running Container"
RUN mkdir -p /.devcontainer && echo '{"workspaceFolder":"/home/sandbox/harness","remoteUser":"sandbox"}' > /.devcontainer/devcontainer.json

# Labels for VS Code "Attach to Running Container"
LABEL devcontainer.metadata='[{"remoteUser":"sandbox","workspaceFolder":"/home/sandbox/harness"}]'

# ─── Copy install scripts + workspace (for CI; bind mount overrides at runtime)
COPY --chown=sandbox:sandbox install/ /home/sandbox/install/
RUN chmod +x /home/sandbox/install/*.sh
COPY --chown=sandbox:sandbox workspace/ /home/sandbox/harness/workspace/

# ─── Entrypoint ────────────────────────────────────────────────────
COPY .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /home/sandbox/harness

ENTRYPOINT ["entrypoint.sh"]
CMD ["sleep", "infinity"]
