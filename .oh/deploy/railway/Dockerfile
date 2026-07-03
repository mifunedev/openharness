# Railway hosted-smoke image for Open Harness.
#
# This is intentionally smaller than the local devcontainer image. Railway does
# not expose the host Docker socket or privileged sibling containers, so this
# image proves the repo boots and exposes a hosted status surface; full sandbox
# lifecycle remains the local Docker/devcontainer path.
FROM debian:bookworm-slim

ARG OH_PROJECT_ROOT=/home/sandbox/harness
ENV OH_PROJECT_ROOT=${OH_PROJECT_ROOT}
ENV NODE_ENV=production
ENV OPENHARNESS_HOSTED_MODE=railway

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git jq less procps ripgrep sudo tmux zsh \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

# Sudo requires a password (no NOPASSWD): an interactive operator who knows the
# password can escalate, but a non-interactive internal agent hits the prompt
# and fails. The password is set here at build time because start.sh runs as
# the sandbox user and can no longer use passwordless sudo to set it. Override
# at build with --build-arg SANDBOX_PASSWORD=... ; default is the weak `test1234`.
ARG SANDBOX_PASSWORD=test1234
RUN useradd -m -s /bin/zsh sandbox \
 && echo "sandbox ALL=(ALL) ALL" > /etc/sudoers.d/sandbox \
 && chmod 0440 /etc/sudoers.d/sandbox \
 && echo "sandbox:${SANDBOX_PASSWORD:-test1234}" | chpasswd

WORKDIR ${OH_PROJECT_ROOT}
COPY --chown=sandbox:sandbox . ${OH_PROJECT_ROOT}/

RUN npm --prefix .oh/cli ci --ignore-scripts --no-audit --no-fund \
 && npm --prefix .oh/cli run build \
 && chmod +x .oh/deploy/railway/start.sh \
 && ln -sf ${OH_PROJECT_ROOT}/.oh/cli/dist/oh.js /usr/local/bin/oh

USER sandbox
EXPOSE 3000

CMD ["/bin/bash", "-lc", "exec .oh/deploy/railway/start.sh"]
