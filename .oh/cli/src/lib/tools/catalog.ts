
export type ToolKind = "baked-in" | "installable";

export interface ToolEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: ToolKind;
  readonly binary: string;
  readonly verifyArgv: readonly string[];
  readonly versionArgv?: readonly string[];
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
    kind: "installable",
    binary: "agent-browser",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v agent-browser >/dev/null"]),
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
    kind: "installable",
    binary: "herdr",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v herdr >/dev/null"]),
    versionArgv: Object.freeze(["herdr", "--version"]),
    installArgv: Object.freeze([
      "bash",
      "-lc",
      [
        "set -e",
        'version=0.7.4',
        'case "$(dpkg --print-architecture)" in',
        "  amd64) arch=x86_64; sha=bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059 ;;",
        "  arm64) arch=aarch64; sha=544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2 ;;",
        '  *) echo "no pinned Herdr build for $(dpkg --print-architecture)" >&2; exit 1 ;;',
        "esac",
        'prefix="${NPM_USER_PREFIX:-$HOME/.local}"',
        'tmp="$(mktemp -d)"',
        "trap 'rm -rf \"$tmp\"' EXIT",
        'curl -fsSL "https://github.com/ogulcancelik/herdr/releases/download/v$version/herdr-linux-$arch" -o "$tmp/herdr"',
        'echo "$sha  $tmp/herdr" | sha256sum -c -',
        'install -d "$prefix/bin"',
        'install -m 0755 "$tmp/herdr" "$prefix/bin/herdr"',
        'test "$("$prefix/bin/herdr" --version)" = "herdr $version"',
      ].join("\n"),
    ]),
    installUser: "sandbox",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "cloudflared",
    title: "cloudflared",
    kind: "installable",
    binary: "cloudflared",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v cloudflared >/dev/null"]),
    versionArgv: Object.freeze(["cloudflared", "--version"]),
    installArgv: Object.freeze([
      "bash",
      "-lc",
      [
        "set -e",
        "version=2026.8.2",
        'case "$(dpkg --print-architecture)" in',
        "  amd64) sha=fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2 ;;",
        "  arm64) sha=7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790 ;;",
        '  *) echo "no pinned cloudflared build for $(dpkg --print-architecture)" >&2; exit 1 ;;',
        "esac",
        'arch="$(dpkg --print-architecture)"',
        'prefix="${NPM_USER_PREFIX:-$HOME/.local}"',
        'tmp="$(mktemp -d)"',
        "trap 'rm -rf \"$tmp\"' EXIT",
        'curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-linux-$arch" -o "$tmp/cloudflared"',
        'echo "$sha  $tmp/cloudflared" | sha256sum -c -',
        'install -d "$prefix/bin"',
        'install -m 0755 "$tmp/cloudflared" "$prefix/bin/cloudflared"',
        '"$prefix/bin/cloudflared" --version >/dev/null',
      ].join("\n"),
    ]),
    installUser: "sandbox",
    docsPath: TOOLS_DOC,
  }),
  Object.freeze({
    id: "microsandbox",
    title: "MicroSandbox CLI",
    kind: "installable",
    binary: "msb",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v msb >/dev/null"]),
    versionArgv: Object.freeze(["msb", "--version"]),
    installArgv: Object.freeze([
      "bash",
      "-lc",
      [
        "set -e",
        "sha=767df6954e09fec9bf8276cc2858fc9038024b3a22fa4740572620370eb719f4",
        'prefix="${NPM_USER_PREFIX:-$HOME/.local}"',
        'tmp="$(mktemp -d)"',
        "trap 'rm -rf \"$tmp\"' EXIT",
        'curl -fsSL "https://raw.githubusercontent.com/superradcompany/microsandbox/refs/heads/main/scripts/install.sh" -o "$tmp/install-msb.sh"',
        'echo "$sha  $tmp/install-msb.sh" | sha256sum -c -',
        'MSB_HOME="$prefix/microsandbox" sh "$tmp/install-msb.sh"',
        '"$prefix/bin/msb" --version >/dev/null',
      ].join("\n"),
    ]),
    installUser: "sandbox",
    docsPath: "docs/runtimes/microsandbox.md",
  }),
  Object.freeze({
    id: "docker-cli",
    title: "Docker CLI + Compose",
    kind: "baked-in",
    binary: "docker",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v docker >/dev/null"]),
    versionArgv: Object.freeze(["docker", "--version"]),
    notInstallableReason:
      "The Docker CLI is installed in the base image. Note that the CLI being present says nothing about whether a daemon is reachable — `oh ps <name>` answers that.",
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
    kind: "installable",
    binary: "tailscale",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v tailscale >/dev/null"]),
    versionArgv: Object.freeze(["tailscale", "--version"]),
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "set -e\narch=\"$(dpkg --print-architecture)\"\ncase \"$arch\" in\n  amd64) tarball=tailscale_1.102.3_amd64.tgz; sha=36ddd9b51be57ffc2990cf76323cfa13643bfbb1b8a969f6183fa164741cdef5 ;;\n  arm64) tarball=tailscale_1.102.3_arm64.tgz; sha=a0fa1b154af8c61f862a2259f559f7396d96c0225f4a863eae2333e1546bbe25 ;;\n  *) echo \"no pinned Tailscale build for $arch\" >&2; exit 1 ;;\nesac\nprefix=\"${NPM_USER_PREFIX:-$HOME/.local}\"\ntmp=\"$(mktemp -d)\"\ntrap 'rm -rf \"$tmp\"' EXIT\ncurl -fsSL \"https://pkgs.tailscale.com/stable/$tarball\" -o \"$tmp/$tarball\"\necho \"$sha  $tmp/$tarball\" | sha256sum -c -\ntar -xzf \"$tmp/$tarball\" -C \"$tmp\"\ninstall -d \"$prefix/bin\"\ninstall -m 0755 \"$tmp/tailscale_1.102.3_$arch/tailscale\" \"$prefix/bin/tailscale\"\ninstall -m 0755 \"$tmp/tailscale_1.102.3_$arch/tailscaled\" \"$prefix/bin/tailscaled\"\ninstall -d -m 0700 \"$HOME/.tailscale\"",
    ]),
    installUser: "sandbox",
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
