
export type ToolKind =
  | "baked-in"
  | "default"
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
    kind: "default",
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
    kind: "default",
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
]);

export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

export function toolIds(): string[] {
  return TOOL_CATALOG.map((t) => t.id);
}

export function defaultTools(): readonly ToolEntry[] {
  return TOOL_CATALOG.filter((t) => t.kind === "default");
}

export function installableToolIds(): string[] {
  return TOOL_CATALOG.filter((t) => t.installArgv !== undefined).map((t) => t.id);
}
