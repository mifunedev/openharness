FROM node:22-trixie-slim

ENV OH_PROJECT_ROOT=/home/sandbox/harness

ENV TZ=America/Denver

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client openssh-server build-essential ca-certificates curl wget sudo gosu git jq gnupg \
    lsb-release nano ripgrep tmux unzip bash-completion procps less \
    iproute2 zsh cron lsof htop inetutils-telnet \
 && command -v lsof >/dev/null \
 && command -v htop >/dev/null \
 && command -v telnet >/dev/null \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian trixie stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# Cloudflare publishes no trixie suite (pkg.cloudflare.com/cloudflared/dists/trixie returns HTTP 404);
# the bookworm package is compatible with trixie, so this suite stays pinned to bookworm.
RUN curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
      -o /usr/share/keyrings/cloudflare-main.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" \
      > /etc/apt/sources.list.d/cloudflared.list \
 && apt-get update && apt-get install -y --no-install-recommends cloudflared \
 && rm -rf /var/lib/apt/lists/*

RUN BUN_INSTALL=/usr/local curl -fsSL https://bun.sh/install | bash

ARG HERDR_VERSION=0.7.4
RUN case "$(dpkg --print-architecture)" in \
      amd64) herdr_arch=x86_64; herdr_sha=bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059 ;; \
      arm64) herdr_arch=aarch64; herdr_sha=544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2 ;; \
      *) echo "Unsupported Herdr architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/ogulcancelik/herdr/releases/download/v${HERDR_VERSION}/herdr-linux-${herdr_arch}" \
      -o /usr/local/bin/herdr \
 && echo "${herdr_sha}  /usr/local/bin/herdr" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/herdr \
 && test "$(herdr --version)" = "herdr ${HERDR_VERSION}"

RUN curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh \
 && cp /root/.local/bin/uv /usr/local/bin/uv \
 && cp /root/.local/bin/uvx /usr/local/bin/uvx

ARG INSTALL_HERMES=false
RUN if [ "${INSTALL_HERMES}" = "true" ]; then \
      curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
        | bash -s -- --skip-setup --skip-browser; \
      rm -rf /root/.hermes; \
      uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack,teams,web,pty]'; \
    else \
      echo "Skipping Hermes Agent CLI install (INSTALL_HERMES=false)"; \
    fi

ARG INSTALL_DEEPAGENTS=false
RUN export UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin \
 && mkdir -p "$UV_TOOL_DIR" \
 && if [ "${INSTALL_DEEPAGENTS}" = "true" ]; then \
      uv tool install deepagents-cli; \
    else \
      echo "Skipping DeepAgents CLI install (INSTALL_DEEPAGENTS=false)"; \
    fi

ENV PNPM_HOME="/usr/local/share/pnpm"
ENV NPM_USER_PREFIX="/home/sandbox/.local"
ENV PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
 && pnpm setup --force 2>/dev/null || true

SHELL ["/bin/bash", "-c"]

ARG AGENTS="claude-code,codex,pi-coding-agent"
ARG INSTALL_OPENCODE=false
ARG INSTALL_GROK_BUILD=false

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
    done; \
    if [ "${INSTALL_OPENCODE}" = "true" ]; then npm install -g opencode-ai; \
    else echo "Skipping OpenCode CLI install (INSTALL_OPENCODE=false)"; fi; \
    if [ "${INSTALL_GROK_BUILD}" = "true" ]; then \
        curl -fsSL https://x.ai/cli/install.sh | HOME=/opt/grok-build GROK_BIN_DIR=/opt/grok-build/bin bash -s 0.2.39; \
        ln -sf /opt/grok-build/bin/grok /usr/local/bin/grok; \
        rm -f /usr/local/bin/agent; \
    else echo "Skipping Grok Build CLI install (INSTALL_GROK_BUILD=false)"; fi

RUN npm install -g cc-safety-net@1.0.6

COPY .oh/cli/ /opt/oh/
RUN cd /opt/oh && npm install --no-audit --no-fund && npm run build \
 && chmod +x /opt/oh/dist/oh.js \
 && ln -sf /opt/oh/dist/oh.js /usr/local/bin/oh

RUN userdel -r node 2>/dev/null || true \
 && useradd -m -u 1000 -s /bin/zsh sandbox \
 && echo "sandbox ALL=(ALL) ALL" > /etc/sudoers.d/sandbox \
 && chmod 0440 /etc/sudoers.d/sandbox \
 && groupadd -f docker && usermod -aG docker sandbox

ENV UV_TOOL_DIR=/home/sandbox/.local/share/uv/tools
ENV UV_TOOL_BIN_DIR=/home/sandbox/.local/bin
ENV UV_PYTHON_INSTALL_DIR=/home/sandbox/.local/share/uv/python
ENV UV_CACHE_DIR=/home/sandbox/.cache/uv
RUN install -d -o sandbox -g sandbox \
      /home/sandbox/.local \
      /home/sandbox/.local/share \
      /home/sandbox/.local/share/uv \
      /home/sandbox/.cache \
      /home/sandbox/.config \
      /home/sandbox/.herdr \
      /home/sandbox/.ssh \
      "$UV_TOOL_DIR" "$UV_TOOL_BIN_DIR" "$UV_PYTHON_INSTALL_DIR" "$UV_CACHE_DIR" \
 && chown -R sandbox:sandbox /opt/uv 2>/dev/null || true \
 && if [ -d /usr/local/lib/hermes-agent ]; then chown -R sandbox:sandbox /usr/local/lib/hermes-agent; fi

RUN set -e; \
    install -d -o sandbox -g sandbox "$NPM_USER_PREFIX"; \
    if [[ ",${AGENTS}," == *",pi-coding-agent,"* ]]; then \
        su - sandbox -c 'npm --prefix "$HOME/.local" install -g --ignore-scripts @earendil-works/pi-coding-agent'; \
    fi

RUN su - sandbox -c "RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)\" --unattended" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions         /home/sandbox/.oh-my-zsh/custom/plugins/zsh-autosuggestions" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting     /home/sandbox/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-history-substring-search /home/sandbox/.oh-my-zsh/custom/plugins/zsh-history-substring-search"

COPY --chown=sandbox:sandbox .oh/install/.tmux.conf /home/sandbox/.tmux.conf

COPY --chown=sandbox:sandbox .oh/install/.zshrc /home/sandbox/.zshrc

RUN printf '%s\n' \
      'export NPM_USER_PREFIX="/home/sandbox/.local"' \
      'export PNPM_HOME="/usr/local/share/pnpm"' \
      'export PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"' \
      '# uv/Python env written by .oh/scripts/provision-python.sh (PRIME_AGENT_KERNEL_PYTHON).' \
      '[ -r "$HOME/.local/share/oh/python-env.sh" ] && . "$HOME/.local/share/oh/python-env.sh"' \
      | tee -a /home/sandbox/.profile /home/sandbox/.zprofile \
 && chown sandbox:sandbox /home/sandbox/.profile /home/sandbox/.zprofile

RUN echo "alias claude='claude --dangerously-skip-permissions'" >> /home/sandbox/.bashrc \
 && echo "alias codex='codex --dangerously-bypass-approvals-and-sandbox'" >> /home/sandbox/.bashrc

RUN su - sandbox -c "git config --global --add safe.directory ${OH_PROJECT_ROOT}"

RUN echo "cd ${OH_PROJECT_ROOT} 2>/dev/null" >> /home/sandbox/.bashrc

RUN mkdir -p /.devcontainer && echo '{"workspaceFolder":"/home/sandbox/harness","remoteUser":"sandbox"}' > /.devcontainer/devcontainer.json

LABEL devcontainer.metadata='[{"remoteUser":"sandbox","workspaceFolder":"/home/sandbox/harness"}]'
LABEL org.opencontainers.image.licenses="Apache-2.0"

COPY --chown=sandbox:sandbox .oh/install/ /home/sandbox/install/
RUN chmod +x /home/sandbox/install/*.sh

# boot (entrypoint OH_IMAGE_ONLY / seed_workspace_volume, OH_IMAGE_SEED_SRC).
COPY --chown=sandbox:sandbox . /opt/oh-seed/

ARG INSTALL_PYTHON_KERNEL=true
ARG OH_PYTHON_VERSION=3.11
RUN if [ "${INSTALL_PYTHON_KERNEL}" = "true" ]; then \
      su - sandbox -c "OH_PYTHON_VERSION='${OH_PYTHON_VERSION}' bash /opt/oh-seed/.oh/scripts/provision-python.sh"; \
    else \
      echo "Skipping Python kernel provisioning (INSTALL_PYTHON_KERNEL=false)"; \
    fi

COPY .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN mv /home/sandbox /opt/home-seed \
 && rm -rf /opt/home-seed/harness \
 && install -d -o sandbox -g sandbox -m 0755 /home/sandbox

WORKDIR ${OH_PROJECT_ROOT}

ENTRYPOINT ["entrypoint.sh"]
CMD ["sleep", "infinity"]
