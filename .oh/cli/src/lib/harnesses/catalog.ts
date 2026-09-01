
export type HarnessKind =
  | "default"
  | "optional"
  | "on-demand";

export interface HarnessEntry {
  readonly id: string;
  readonly title: string;
  readonly binary: string;
  readonly harnessKey?: string;
  readonly installArgv: readonly string[];
  readonly installUser: "root" | "sandbox";
  readonly verifyArgv: readonly string[];
  readonly docsPath: string;
  readonly kind: HarnessKind;
}

export const HARNESS_CATALOG: readonly HarnessEntry[] = [
  {
    id: "claude-code",
    title: "Claude Code",
    binary: "claude",
    installArgv: [
      "npm",
      "--prefix",
      "/home/sandbox/.local",
      "install",
      "-g",
      "@anthropic-ai/claude-code",
    ],
    installUser: "sandbox",
    verifyArgv: ["claude", "--version"],
    docsPath: "docs/harnesses/claude-code.md",
    kind: "default",
  },
  {
    id: "codex",
    title: "Codex",
    binary: "codex",
    installArgv: [
      "npm",
      "--prefix",
      "/home/sandbox/.local",
      "install",
      "-g",
      "@openai/codex",
    ],
    installUser: "sandbox",
    verifyArgv: ["codex", "--version"],
    docsPath: "docs/harnesses/codex.md",
    kind: "default",
  },
  {
    id: "pi",
    title: "Pi",
    binary: "pi",
    installArgv: [
      "npm",
      "--prefix",
      "/home/sandbox/.local",
      "install",
      "-g",
      "--ignore-scripts",
      "@earendil-works/pi-coding-agent",
    ],
    installUser: "sandbox",
    verifyArgv: ["pi", "--version"],
    docsPath: "docs/harnesses/pi.md",
    kind: "default",
  },
  {
    id: "opencode",
    title: "OpenCode",
    binary: "opencode",
    harnessKey: "opencode",
    installArgv: [
      "npm",
      "--prefix",
      "/home/sandbox/.local",
      "install",
      "-g",
      "opencode-ai",
    ],
    installUser: "sandbox",
    verifyArgv: ["opencode", "--version"],
    docsPath: "docs/harnesses/opencode.md",
    kind: "optional",
  },
  {
    id: "grok-build",
    title: "Grok Build",
    binary: "grok",
    harnessKey: "grok_build",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://x.ai/cli/install.sh | GROK_BIN_DIR=\"$HOME/.local/bin\" bash -s 0.2.39 && rm -f \"$HOME/.local/bin/agent\"",
    ],
    installUser: "sandbox",
    verifyArgv: ["grok", "--version"],
    docsPath: "docs/harnesses/grok-build.md",
    kind: "optional",
  },
  {
    id: "hermes",
    title: "Hermes",
    binary: "hermes",
    harnessKey: "hermes",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | HERMES_INSTALL_DIR=\"$HOME/.local/lib/hermes-agent\" bash -s -- --skip-setup --skip-browser && uv pip install --python \"$HOME/.local/lib/hermes-agent/venv/bin/python\" 'hermes-agent[slack,teams,web,pty]'",
    ],
    installUser: "sandbox",
    verifyArgv: ["hermes", "--version"],
    docsPath: "docs/harnesses/hermes.md",
    kind: "optional",
  },
  {
    id: "t3code",
    title: "T3 Code",
    binary: "t3",
    installArgv: ["npx", "--yes", "t3", "--version"],
    installUser: "sandbox",
    verifyArgv: ["npx", "--no-install", "t3", "--version"],
    docsPath: "docs/harnesses/t3code.md",
    kind: "on-demand",
  },
];

export function optionalHarnesses(): readonly HarnessEntry[] {
  return HARNESS_CATALOG.filter((h) => h.kind === "optional");
}

export function defaultHarnesses(): readonly HarnessEntry[] {
  return HARNESS_CATALOG.filter((h) => h.kind === "default");
}

export function findHarness(id: string): HarnessEntry | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id);
}

export function harnessIds(): string[] {
  return HARNESS_CATALOG.map((h) => h.id);
}
