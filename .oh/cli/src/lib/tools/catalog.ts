
export type ToolKind =
  | "baked-in"
  | "opt-in";

export interface ToolEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: ToolKind;
  readonly binary: string;
  readonly verifyArgv: readonly string[];
  readonly versionArgv?: readonly string[];
  readonly toolKey?: string;
  readonly entrypointGuard?: string;
  readonly installArgv?: readonly string[];
  readonly installUser?: "root" | "sandbox";
  readonly downloadSize?: string;
  readonly notInstallableReason?: string;
  readonly docsPath: string;
}

const TOOLS_DOC = "docs/installation.md";

export const TOOL_CATALOG: readonly ToolEntry[] = Object.freeze([
  Object.freeze({
    id: "agent-browser",
    title: "agent-browser",
    kind: "opt-in",
    binary: "agent-browser",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v agent-browser >/dev/null"]),
    toolKey: "agent_browser",
    entrypointGuard: "INSTALL_AGENT_BROWSER",
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "pnpm add -g agent-browser@0.8.5 && find \"$PNPM_HOME\" -name \"agent-browser-linux-*\" -exec chmod +x {} \\; && agent-browser install --with-deps",
    ]),
    installUser: "sandbox",
    downloadSize: "~1 GB",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "herdr",
    title: "Herdr",
    kind: "baked-in",
    binary: "herdr",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v herdr >/dev/null"]),
    notInstallableReason:
      "herdr is installed in the base image with a pinned, sha256-verified binary (.devcontainer/Dockerfile). Rebuild the image to change it.",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "cloudflared",
    title: "cloudflared",
    kind: "baked-in",
    binary: "cloudflared",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v cloudflared >/dev/null"]),
    versionArgv: Object.freeze(["cloudflared", "--version"]),
    notInstallableReason:
      "cloudflared is installed in the base image from Cloudflare's apt repository (.devcontainer/Dockerfile). Rebuild the image to change it.",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "docker-cli",
    title: "Docker CLI + Compose",
    kind: "baked-in",
    binary: "docker",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v docker >/dev/null"]),
    versionArgv: Object.freeze(["docker", "--version"]),
    notInstallableReason:
      "The Docker CLI is installed in the base image. Note that the CLI being present says nothing about whether a daemon is reachable — `oh runtime status docker` answers that.",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "gh",
    title: "GitHub CLI",
    kind: "baked-in",
    binary: "gh",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v gh >/dev/null"]),
    versionArgv: Object.freeze(["gh", "--version"]),
    notInstallableReason:
      "The GitHub CLI is installed in the base image. Run `gh auth login` inside the sandbox to authenticate it.",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "tailscale",
    title: "Tailscale",
    kind: "opt-in",
    binary: "tailscale",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v tailscale >/dev/null"]),
    versionArgv: Object.freeze(["tailscale", "--version"]),
    toolKey: "tailscale",
    entrypointGuard: "INSTALL_TAILSCALE",
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "set -e\narch=\"$(dpkg --print-architecture)\"\ncase \"$arch\" in\n  amd64) tarball=tailscale_1.102.3_amd64.tgz; sha=36ddd9b51be57ffc2990cf76323cfa13643bfbb1b8a969f6183fa164741cdef5 ;;\n  arm64) tarball=tailscale_1.102.3_arm64.tgz; sha=a0fa1b154af8c61f862a2259f559f7396d96c0225f4a863eae2333e1546bbe25 ;;\n  *) echo \"no pinned Tailscale build for $arch\" >&2; exit 1 ;;\nesac\ntmp=\"$(mktemp -d)\"\ntrap 'rm -rf \"$tmp\"' EXIT\ncurl -fsSL \"https://pkgs.tailscale.com/stable/$tarball\" -o \"$tmp/$tarball\"\necho \"$sha  $tmp/$tarball\" | sha256sum -c -\ntar -xzf \"$tmp/$tarball\" -C \"$tmp\"\ninstall -m 0755 \"$tmp/tailscale_1.102.3_$arch/tailscale\" /usr/local/bin/tailscale\ninstall -m 0755 \"$tmp/tailscale_1.102.3_$arch/tailscaled\" /usr/local/bin/tailscaled\ninstall -d -o sandbox -g sandbox -m 0700 /home/sandbox/.tailscale",
    ]),
    installUser: "root",
    docsPath: TOOLS_DOC,
  }),
]);

export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

export function toolIds(): string[] {
  return TOOL_CATALOG.map((t) => t.id);
}

export function installableToolIds(): string[] {
  return TOOL_CATALOG.filter((t) => t.installArgv !== undefined).map((t) => t.id);
}
