FROM node:22-trixie-slim AS base

ENV OH_PROJECT_ROOT=/home/sandbox/harness

ENV TZ=America/Denver

ENV container=docker

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client openssh-server build-essential ca-certificates curl wget sudo gosu git jq gnupg \
    lsb-release nano ripgrep tmux unzip bash-completion procps less \
    iproute2 zsh cron lsof htop inetutils-telnet \
    systemd systemd-sysv dbus \
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

RUN BUN_INSTALL=/usr/local curl -fsSL https://bun.sh/install | bash

RUN curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh \
 && cp /root/.local/bin/uv /usr/local/bin/uv \
 && cp /root/.local/bin/uvx /usr/local/bin/uvx

ENV PNPM_HOME="/home/sandbox/.local/share/pnpm"
ENV NPM_USER_PREFIX="/home/sandbox/.local"
ENV PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

SHELL ["/bin/bash", "-c"]

RUN npm install -g cc-safety-net@1.0.6

COPY .devcontainer/docker-compose.yml .devcontainer/docker-compose.image-only.yml .devcontainer/docker-compose.ssh.yml .devcontainer/docker-compose.docker-sock.yml /opt/oh-assets/.devcontainer/
COPY .oh/scripts/docker-compose.sh .oh/scripts/check-host-port.sh /opt/oh-assets/.oh/scripts/
COPY .oh/cli/ /opt/oh/
RUN cd /opt/oh && OH_ASSET_ROOT=/opt/oh-assets npm install --no-audit --no-fund && OH_ASSET_ROOT=/opt/oh-assets npm run build \
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

FROM base AS home
RUN install -d -o sandbox -g sandbox -m 0700 /home/sandbox/.ssh \
 && install -d -o sandbox -g sandbox \
      /home/sandbox/.local \
      /home/sandbox/.local/share \
      /home/sandbox/.local/share/uv \
      /home/sandbox/.cache \
      /home/sandbox/.config \
      /home/sandbox/.herdr \
      "$UV_TOOL_DIR" "$UV_TOOL_BIN_DIR" "$UV_PYTHON_INSTALL_DIR" "$UV_CACHE_DIR"

RUN install -d -o sandbox -g sandbox "$NPM_USER_PREFIX" "$PNPM_HOME" \
 && rm -rf /home/sandbox/.npm

RUN su - sandbox -c "RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c \"\$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)\" --unattended" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions         /home/sandbox/.oh-my-zsh/custom/plugins/zsh-autosuggestions" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting     /home/sandbox/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting" \
 && su - sandbox -c "git clone --depth 1 https://github.com/zsh-users/zsh-history-substring-search /home/sandbox/.oh-my-zsh/custom/plugins/zsh-history-substring-search"

COPY --chown=sandbox:sandbox .oh/install/.tmux.conf /home/sandbox/.tmux.conf

COPY --chown=sandbox:sandbox .oh/install/.zshrc /home/sandbox/.zshrc

RUN printf '%s\n' \
      'export NPM_USER_PREFIX="${NPM_USER_PREFIX:-/home/sandbox/.local}"' \
      'export PNPM_HOME="${PNPM_HOME:-/home/sandbox/.local/share/pnpm}"' \
      'export PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"' \
      '[ -r "$HOME/.local/share/oh/python-env.sh" ] && . "$HOME/.local/share/oh/python-env.sh"' \
      | tee -a /home/sandbox/.profile /home/sandbox/.zprofile \
 && chown sandbox:sandbox /home/sandbox/.profile /home/sandbox/.zprofile

RUN echo "alias claude='claude --dangerously-skip-permissions'" >> /home/sandbox/.bashrc \
 && echo "alias codex='codex --dangerously-bypass-approvals-and-sandbox'" >> /home/sandbox/.bashrc

RUN su - sandbox -c "git config --global --add safe.directory ${OH_PROJECT_ROOT}"

RUN echo "cd ${OH_PROJECT_ROOT} 2>/dev/null" >> /home/sandbox/.bashrc

COPY --chown=sandbox:sandbox .oh/install/ /home/sandbox/install/
RUN chmod +x /home/sandbox/install/*.sh

COPY --chown=sandbox:sandbox . /opt/oh-seed/

ARG INSTALL_PYTHON_KERNEL=true
ARG OH_PYTHON_VERSION=3.11
RUN if [ "${INSTALL_PYTHON_KERNEL}" = "true" ]; then \
      su - sandbox -c "OH_PYTHON_VERSION='${OH_PYTHON_VERSION}' bash /opt/oh-seed/.oh/scripts/provision-python.sh"; \
    else \
      echo "Skipping Python kernel provisioning (INSTALL_PYTHON_KERNEL=false)"; \
    fi \
 && rm -rf /home/sandbox/.cache/uv

FROM base AS final
RUN mkdir -p /.devcontainer && echo '{"workspaceFolder":"/home/sandbox/harness","remoteUser":"sandbox"}' > /.devcontainer/devcontainer.json

LABEL devcontainer.metadata='[{"remoteUser":"sandbox","workspaceFolder":"/home/sandbox/harness"}]'
LABEL org.opencontainers.image.licenses="Apache-2.0"

COPY --chown=sandbox:sandbox . /opt/oh-seed/

COPY .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY .devcontainer/openharness-bootstrap.service .devcontainer/openharness-cron.service /usr/lib/systemd/system/
COPY .devcontainer/openharness-env-generator.sh /usr/lib/systemd/system-environment-generators/10-openharness
RUN chmod 0755 /usr/lib/systemd/system-environment-generators/10-openharness \
 && systemctl enable openharness-bootstrap.service openharness-cron.service \
 && systemctl mask cron.service ssh.service ssh.socket

COPY --from=home --chown=sandbox:sandbox /home/sandbox /opt/home-seed
RUN rm -rf /opt/home-seed/harness /home/sandbox \
 && chmod 0700 /opt/home-seed \
 && install -d -o sandbox -g sandbox -m 0755 /home/sandbox

WORKDIR ${OH_PROJECT_ROOT}

STOPSIGNAL SIGRTMIN+3
ENTRYPOINT []
CMD ["/sbin/init"]
