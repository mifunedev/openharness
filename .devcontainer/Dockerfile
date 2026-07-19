FROM rust:1.96.1-bookworm AS herdr-source-packager

ARG ZIG_VERSION=0.15.2
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 && case "$(dpkg --print-architecture)" in \
      amd64) zig_arch=x86_64; zig_sha=02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239 ;; \
      arm64) zig_arch=aarch64; zig_sha=958ed7d1e00d0ea76590d27666efbf7a932281b3d7ba0c6b01b0ff26498f667f ;; \
      *) echo "Unsupported Zig architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
 && zig_archive=/tmp/zig.tar.xz \
 && curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
      "https://ziglang.org/download/${ZIG_VERSION}/zig-${zig_arch}-linux-${ZIG_VERSION}.tar.xz" \
      -o "$zig_archive" \
 && echo "${zig_sha}  ${zig_archive}" | sha256sum -c - \
 && mkdir -p /opt/zig \
 && tar -xJf "$zig_archive" --strip-components=1 -C /opt/zig \
 && ln -s /opt/zig/zig /usr/local/bin/zig \
 && test "$(zig version)" = "$ZIG_VERSION" \
 && rm -f "$zig_archive"
WORKDIR /opt/openharness-source
COPY .oh/scripts/package-herdr-corresponding-source.sh /usr/local/bin/package-herdr-corresponding-source
RUN chmod 0755 /usr/local/bin/package-herdr-corresponding-source \
 && mkdir -p /out \
 && package-herdr-corresponding-source /out

FROM debian:bookworm-slim

ARG OH_PROJECT_ROOT=/home/sandbox/harness
ARG OPENHARNESS_VERSION=development
ARG OPENHARNESS_REVISION=unknown
ARG OPENHARNESS_CREATED=unknown
ENV OH_PROJECT_ROOT=${OH_PROJECT_ROOT}

ENV TZ=America/Denver

# ─── System packages ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client openssh-server build-essential ca-certificates curl wget sudo gosu git jq gnupg \
    lsb-release nano ripgrep tmux unzip bash-completion procps less \
    iproute2 zsh cron \
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

# ─── Herdr ──────────────────────────────────────────────────────────
# Primary interactive workspace. The binary and conservative corresponding
# source bundle are independently checksum-pinned. The packager stage uses the
# same script as release CI and includes Cargo.lock plus locked dependencies.
ARG HERDR_VERSION=0.7.4
ARG HERDR_COMMIT=50aaa2ec046ee26ff407c20f49de496f522512a8
ARG HERDR_CORRESPONDING_SOURCE_SHA256=46978a7b059db39271124b0430b4cbe0db3e3a3dc12b264d39fcbd00be00b096
ARG HERDR_SOURCE_URL=file:///usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz
RUN install -d /usr/share/doc/herdr /usr/share/src/herdr
COPY .oh/skills/herdr/LICENSE.upstream /usr/share/doc/herdr/LICENSE
COPY .oh/legal/herdr/NOTICE /usr/share/doc/herdr/NOTICE
COPY .oh/legal/herdr/SOURCE-OFFER /usr/share/doc/herdr/SOURCE-OFFER
COPY --from=herdr-source-packager \
  /out/herdr-0.7.4-corresponding-source.tar.gz \
  /out/herdr-0.7.4-corresponding-source.tar.gz.sha256 \
  /usr/share/src/herdr/
RUN test "${HERDR_VERSION}" = "0.7.4" \
 && test "${HERDR_COMMIT}" = "50aaa2ec046ee26ff407c20f49de496f522512a8" \
 && test "${HERDR_CORRESPONDING_SOURCE_SHA256}" = "$(sha256sum /usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz | awk '{ print $1 }')" \
 && (cd /usr/share/src/herdr && sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256) \
 && source_listing=$(mktemp) \
 && tar -tzf /usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz > "$source_listing" \
 && grep -Fqx 'herdr-0.7.4/OPENHARNESS-CORRESPONDING-SOURCE.md' "$source_listing" \
 && grep -Eq '^herdr-0\.7\.4/vendor/cargo/[^/]+-[0-9][^/]*/\.cargo-checksum\.json$' "$source_listing" \
 && test "$(grep -Ec '^herdr-0\.7\.4/vendor/zig-global-cache/p/[^/]+/$' "$source_listing")" -eq 36 \
 && grep -Fqx 'herdr-0.7.4/vendor/zig-global-cache/p/N-V-__8AAGmZhABbsPJLfbqrh6JTHsXhY6qCaLAQyx25e0XE/' "$source_listing" \
 && grep -Fqx 'herdr-0.7.4/vendor/zig-global-cache/p/uucode-0.1.0-ZZjBPj96QADXyt5sqwBJUnhaDYs_qBeeKijZvlRa0eqM/' "$source_listing" \
 && grep -Fqx 'herdr-0.7.4/vendor/zig-global-cache/p/uucode-0.2.0-ZZjBPqZVVABQepOqZHR7vV_NcaN-wats0IB6o-Exj6m9/' "$source_listing" \
 && rm -f "$source_listing" \
 && chmod 0644 /usr/share/doc/herdr/LICENSE /usr/share/doc/herdr/NOTICE \
      /usr/share/doc/herdr/SOURCE-OFFER \
      /usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz \
      /usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256 \
 && case "$(dpkg --print-architecture)" in \
      amd64) herdr_arch=x86_64; herdr_sha=bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059 ;; \
      arm64) herdr_arch=aarch64; herdr_sha=544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2 ;; \
      *) echo "Unsupported Herdr architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac \
 && curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
      "https://github.com/ogulcancelik/herdr/releases/download/v${HERDR_VERSION}/herdr-linux-${herdr_arch}" \
      -o /usr/local/bin/herdr \
 && echo "${herdr_sha}  /usr/local/bin/herdr" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/herdr \
 && test "$(herdr --version)" = "herdr ${HERDR_VERSION}"

# ─── uv ─────────────────────────────────────────────────────────────
RUN curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh \
 && cp /root/.local/bin/uv /usr/local/bin/uv \
 && cp /root/.local/bin/uvx /usr/local/bin/uvx

# ─── Hermes Agent CLI ───────────────────────────────────────────────
# Optional image-level install. When INSTALL_HERMES=true, install the
# executable during image build (like the other image-level CLIs), not at
# container boot. The Slack and Teams messaging extras ship by default so the
# gateway adapters work without a post-install step. Runtime config/auth uses
# the project-local /home/sandbox/harness/.hermes directory via HERMES_HOME.
ARG INSTALL_HERMES=false
RUN if [ "${INSTALL_HERMES}" = "true" ]; then \
      curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
        | bash -s -- --skip-setup --skip-browser; \
      rm -rf /root/.hermes; \
      uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack,teams,web,pty]'; \
    else \
      echo "Skipping Hermes Agent CLI install (INSTALL_HERMES=false)"; \
    fi

# ─── DeepAgents CLI ────────────────────────────────────────────────
# Optional image-level install. Use build-only uv tool paths so root-owned
# image paths do not leak into the sandbox user's runtime environment.
ARG INSTALL_DEEPAGENTS=false
RUN export UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin \
 && mkdir -p "$UV_TOOL_DIR" \
 && if [ "${INSTALL_DEEPAGENTS}" = "true" ]; then \
      uv tool install deepagents-cli; \
    else \
      echo "Skipping DeepAgents CLI install (INSTALL_DEEPAGENTS=false)"; \
    fi

# ─── pnpm (via corepack) ───────────────────────────────────────────
ENV PNPM_HOME="/usr/local/share/pnpm"
ENV NPM_USER_PREFIX="/home/sandbox/.local"
ENV PATH="$NPM_USER_PREFIX/bin:$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate \
 && pnpm setup --force 2>/dev/null || true

# ─── Agent CLIs ─────────────────────────────────────────────────────
# Use npm (not pnpm) for global CLI installs. Agent CLI packages require
# postinstall scripts to download platform-native binaries; npm executes these
# by default without extra configuration.
#
# AGENTS is a comma-separated list of default agent CLI keys to install.
# The default is claude-code + codex + pi-coding-agent. Optional CLIs
# such as OpenCode, Grok Build, DeepAgents, and Hermes are controlled by their own
# INSTALL_* build flags. pi-coding-agent is installed later under the
# sandbox user's npm prefix so `pi update` can self-update without sudo.
# The pi-coding-agent key resolves to @earendil-works/pi-coding-agent
# (the @mariozechner/... package is deprecated upstream as of late 2026).
# Downstream harness packs (e.g. @ryaneggz/mifune) install additional CLIs
# via their install-hook.sh.
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

# ─── cc-safety-net (destructive-command guard) ─────────────────────
# Cross-provider PreToolUse guard, pinned. Installed unconditionally at image
# build time — network is available and retryable here, so boot never touches
# the registry (avoids the #639/4979b846 boot crash-loop class). Kept as its
# own standalone RUN block (mirroring the pi-coding-agent pattern below), NOT
# threaded into the AGENTS/PKG loop above: the guard must not be conditional on
# agent selection. See .oh/tasks/cc-safety-net/install-decision.md.
RUN npm install -g cc-safety-net@1.0.6

# ─── Open Harness `oh` CLI ──────────────────────────────────────────
# Build the in-tree `oh` CLI (.oh/cli/) into a self-contained bundle,
# install onto $PATH. Source is COPY'd to /opt/oh (outside the
# bind-mount) so the bundled binary survives the bind-mount overlay.
# The `oh config` family currently ships no integration wizards (Slack is
# configured natively by editing files — see .oh/docs/integrations/slack.md).
# NOTE: COPY does not follow the back-compat `packages/oh` symlink, so the
# real path `.oh/cli/` is used here; runtime callers still use `packages/oh`.
COPY .oh/cli/ /opt/oh/
RUN cd /opt/oh && npm install --no-audit --no-fund && npm run build \
 && chmod +x /opt/oh/dist/oh.js \
 && ln -sf /opt/oh/dist/oh.js /usr/local/bin/oh

# ─── Sandbox user ──────────────────────────────────────────────────
RUN useradd -m -s /bin/zsh sandbox \
 && echo "sandbox ALL=(ALL) ALL" > /etc/sudoers.d/sandbox \
 && chmod 0440 /etc/sudoers.d/sandbox \
 && groupadd -f docker && usermod -aG docker sandbox

# Runtime uv operations should be owned by the default in-container user.
# Image-level installs may still place launchers in /usr/local/bin, but
# ad-hoc `uv tool install` and `uv pip install --python ...` from a shell
# must not target root-owned tool dirs by default.
ENV UV_TOOL_DIR=/home/sandbox/.local/share/uv/tools
ENV UV_TOOL_BIN_DIR=/home/sandbox/.local/bin
RUN install -d -o sandbox -g sandbox "$UV_TOOL_DIR" "$UV_TOOL_BIN_DIR" \
 && chown -R sandbox:sandbox /opt/uv 2>/dev/null || true \
 && if [ -d /usr/local/lib/hermes-agent ]; then chown -R sandbox:sandbox /usr/local/lib/hermes-agent; fi

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

# Default tmux config for sandbox user (real path — COPY ignores the install symlink)
COPY --chown=sandbox:sandbox .oh/install/.tmux.conf /home/sandbox/.tmux.conf

# Default .zshrc for sandbox user (overrides the oh-my-zsh template)
COPY --chown=sandbox:sandbox .oh/install/.zshrc /home/sandbox/.zshrc

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
RUN su - sandbox -c "git config --global --add safe.directory ${OH_PROJECT_ROOT}"

# Default working directory for interactive shells (SSH + terminal attach, bash fallback)
RUN echo "cd ${OH_PROJECT_ROOT} 2>/dev/null" >> /home/sandbox/.bashrc

# Image-level devcontainer config — VS Code reads this on "Attach to Running Container"
RUN mkdir -p /.devcontainer && echo '{"workspaceFolder":"/home/sandbox/harness","remoteUser":"sandbox"}' > /.devcontainer/devcontainer.json

# Image provenance plus component-scoped Herdr compliance metadata. The OCI
# labels describe Open Harness; dev.openharness.herdr.* describes only the
# separately aggregated Herdr component.
LABEL devcontainer.metadata='[{"remoteUser":"sandbox","workspaceFolder":"/home/sandbox/harness"}]' \
      org.opencontainers.image.title="Open Harness" \
      org.opencontainers.image.description="Sandbox orchestrator and agent toolchain" \
      org.opencontainers.image.url="https://github.com/mifunedev/openharness" \
      org.opencontainers.image.source="https://github.com/mifunedev/openharness" \
      org.opencontainers.image.version="${OPENHARNESS_VERSION}" \
      org.opencontainers.image.revision="${OPENHARNESS_REVISION}" \
      org.opencontainers.image.created="${OPENHARNESS_CREATED}" \
      dev.openharness.herdr.version="${HERDR_VERSION}" \
      dev.openharness.herdr.license="AGPL-3.0-or-later" \
      dev.openharness.herdr.commit="${HERDR_COMMIT}" \
      dev.openharness.herdr.source.path="/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz" \
      dev.openharness.herdr.source.checksum.path="/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256" \
      dev.openharness.herdr.source.sha256="${HERDR_CORRESPONDING_SOURCE_SHA256}" \
      dev.openharness.herdr.source.url="${HERDR_SOURCE_URL}" \
      dev.openharness.herdr.binary.amd64.sha256="bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059" \
      dev.openharness.herdr.binary.arm64.sha256="544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2" \
      dev.openharness.herdr.aggregate="unmodified separate work"

# ─── Copy install scripts + workspace (for CI; bind mount overrides at runtime)
# Real path .oh/install/ — COPY does not traverse the back-compat install symlink.
COPY --chown=sandbox:sandbox .oh/install/ /home/sandbox/install/
RUN chmod +x /home/sandbox/install/*.sh
COPY --chown=sandbox:sandbox workspace/ ${OH_PROJECT_ROOT}/workspace/

# Flavor B (#609): bake a non-shadowed seed copy of the repo/control-plane so
# the image-only path can populate an empty named workspace volume on first
# boot (entrypoint OH_IMAGE_ONLY / seed_workspace_volume, OH_IMAGE_SEED_SRC).
# Scoped by .dockerignore (.git, node_modules, .oh/worktrees/*, .claude, .env* etc.).
# Tradeoff: bakes the repo into the image (size cost) for the seeding path only;
# the primary bind-mount build ignores /opt/oh-seed at runtime.
COPY --chown=sandbox:sandbox . /opt/oh-seed/

# ─── Entrypoint ────────────────────────────────────────────────────
COPY .devcontainer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR ${OH_PROJECT_ROOT}

ENTRYPOINT ["entrypoint.sh"]
CMD ["sleep", "infinity"]
