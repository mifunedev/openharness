/**
 * The agent-harness catalog — the single source of truth `oh harness` reads.
 *
 * WHY A BUNDLED TS MODULE, not a data file under `.oh/` and not the docs:
 *
 *  - An installed `oh` binary has no readable `.oh/` payload. That is exactly
 *    why `resolveInitSource` / `bundledPayloadExists` exist in `../../cli.ts`.
 *    A data file would need the same remote-fallback dance for a static table.
 *  - The docs are already drifted: `.oh/docs/harnesses/claude-code.md` says
 *    `pnpm add -g @anthropic-ai/claude-code` while `.devcontainer/Dockerfile`
 *    runs `npm install -g`. Docs are prose, not a source of truth.
 *
 * `.devcontainer/Dockerfile` IS the ground truth for every `installArgv`,
 * including version pins. `__tests__/harness-catalog.test.ts` enforces that as a
 * drift test, so this table cannot silently diverge from the image build.
 *
 * SHELL-STRING RULE: this repo passes argv arrays, never shell command strings
 * built at runtime. Two upstream installers are genuinely pipelines
 * (`curl … | bash`), so their argv is `["bash", "-lc", "<constant>"]`. That
 * string is a LITERAL in this file with zero interpolation — nothing derived
 * from a user-supplied harness name ever reaches a shell.
 */

/** How a harness reaches the sandbox image. */
export type HarnessKind =
  /** In the default image build (the `AGENTS` build-arg list). */
  | "default"
  /** Behind an `INSTALL_*` build arg / `.devcontainer/.env` key. */
  | "optional"
  /** Never baked in; fetched at use time (`npx`). */
  | "on-demand";

/** One harness the CLI knows how to inspect and install. */
export interface HarnessEntry {
  /** Doc slug — the name the user types. Matches `.oh/docs/harnesses/<id>.md`. */
  readonly id: string;
  /** Human-readable name for list/status output. */
  readonly title: string;
  /** Executable this harness puts on PATH. */
  readonly binary: string;
  /**
   * `INSTALL_*` key in lower snake_case WITHOUT the prefix, e.g. `grok_build`.
   * NOTE the underscore — the key is `install.grok_build` while the slug is
   * `grok-build`. `undefined` for `default` and `on-demand` harnesses, which
   * have no flag; the installer must never invent one for them.
   */
  readonly harnessKey?: string;
  /** Dockerfile build arg this key maps to. Absent when `harnessKey` is. */
  readonly buildArg?: string;
  /** Install command, argv form. Copied verbatim from the Dockerfile. */
  readonly installArgv: readonly string[];
  /**
   * User the install runs as inside the container. This is NOT cosmetic:
   * `UV_TOOL_DIR`/`UV_TOOL_BIN_DIR` point under `/home/sandbox`, and pi installs
   * under the sandbox user's npm prefix so `pi update` works without sudo.
   */
  readonly installUser: "root" | "sandbox";
  /** Presence check. Exit 0 → already installed. */
  readonly verifyArgv: readonly string[];
  /** Repo-relative doc path, printed in list/status output. */
  readonly docsPath: string;
  readonly kind: HarnessKind;
}

/**
 * Every harness documented under `.oh/docs/harnesses/`, and only those.
 *
 * `INSTALL_AGENT_BROWSER` lives in the same `.devcontainer/.env` namespace but
 * is a browser tool, not a harness — it is deliberately absent, and `oh harness`
 * must never write it.
 */
export const HARNESS_CATALOG: readonly HarnessEntry[] = [
  {
    id: "claude-code",
    title: "Claude Code",
    binary: "claude",
    installArgv: ["npm", "install", "-g", "@anthropic-ai/claude-code"],
    installUser: "root",
    verifyArgv: ["claude", "--version"],
    docsPath: ".oh/docs/harnesses/claude-code.md",
    kind: "default",
  },
  {
    id: "codex",
    title: "Codex",
    binary: "codex",
    installArgv: ["npm", "install", "-g", "@openai/codex"],
    installUser: "root",
    verifyArgv: ["codex", "--version"],
    docsPath: ".oh/docs/harnesses/codex.md",
    kind: "default",
  },
  {
    // Installed under the sandbox user's npm prefix so `pi update` can
    // self-update the active executable without sudo (Dockerfile: the
    // `su - sandbox -c 'npm --prefix "$HOME/.local" …'` step).
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
    docsPath: ".oh/docs/harnesses/pi.md",
    kind: "default",
  },
  {
    id: "opencode",
    title: "OpenCode",
    binary: "opencode",
    harnessKey: "opencode",
    buildArg: "INSTALL_OPENCODE",
    installArgv: ["npm", "install", "-g", "opencode-ai"],
    installUser: "root",
    verifyArgv: ["opencode", "--version"],
    docsPath: ".oh/docs/harnesses/opencode.md",
    kind: "optional",
  },
  {
    // Pipeline installer. The version pin (0.2.39) is asserted against the
    // Dockerfile by the drift test. The two post-install steps mirror the image
    // build: symlink the launcher onto PATH, and drop the `agent` alias the
    // installer leaves behind (it collides with other tooling).
    id: "grok-build",
    title: "Grok Build",
    binary: "grok",
    harnessKey: "grok_build",
    buildArg: "INSTALL_GROK_BUILD",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://x.ai/cli/install.sh | HOME=/opt/grok-build GROK_BIN_DIR=/opt/grok-build/bin bash -s 0.2.39 && ln -sf /opt/grok-build/bin/grok /usr/local/bin/grok && rm -f /usr/local/bin/agent",
    ],
    installUser: "root",
    verifyArgv: ["grok", "--version"],
    docsPath: ".oh/docs/harnesses/grok-build.md",
    kind: "optional",
  },
  {
    // Runs as `sandbox`, NOT root: UV_TOOL_DIR/UV_TOOL_BIN_DIR are set to paths
    // under /home/sandbox, so a root-run `uv tool install` would write
    // root-owned files into the sandbox user's tool dirs.
    id: "deepagents",
    title: "DeepAgents",
    binary: "deepagents",
    harnessKey: "deepagents",
    buildArg: "INSTALL_DEEPAGENTS",
    installArgv: ["uv", "tool", "install", "deepagents-cli"],
    installUser: "sandbox",
    verifyArgv: ["deepagents", "--version"],
    docsPath: ".oh/docs/harnesses/deepagents.md",
    kind: "optional",
  },
  {
    // Pipeline installer plus the messaging extras the gateway adapters need,
    // so the Slack/Teams bridges work with no post-install step.
    id: "hermes",
    title: "Hermes",
    binary: "hermes",
    harnessKey: "hermes",
    buildArg: "INSTALL_HERMES",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup --skip-browser && uv pip install --python /usr/local/lib/hermes-agent/venv/bin/python 'hermes-agent[slack,teams,web,pty]'",
    ],
    installUser: "root",
    verifyArgv: ["hermes", "--version"],
    docsPath: ".oh/docs/harnesses/hermes.md",
    kind: "optional",
  },
  {
    // Never baked into the image. `npx --yes t3` fetches it at use time, which
    // is also what the `/t3` skill does — so "installing" it is a no-op fetch
    // that warms the npx cache. It has no `INSTALL_*` key by design.
    id: "t3code",
    title: "T3 Code",
    binary: "t3",
    installArgv: ["npx", "--yes", "t3", "--version"],
    installUser: "sandbox",
    verifyArgv: ["npx", "--no-install", "t3", "--version"],
    docsPath: ".oh/docs/harnesses/t3code.md",
    kind: "on-demand",
  },
  {
    // Never baked into the image, so it has no `INSTALL_*` key: the upstream
    // installer resolves the latest release at run time, and pinning it in the
    // Dockerfile would make this catalog the second place a version lives.
    //
    // Three details in the argv are load-bearing:
    //   - `npm_config_prefix` puts the global install under the sandbox user's
    //     own prefix (the same one pi uses), so the default root-owned
    //     /usr/lib/node_modules is never written and `prime-agent update`
    //     needs no sudo.
    //   - `setsid --wait` drops the controlling terminal. The installer's two
    //     confirmation prompts read /dev/tty directly, so redirecting stdin
    //     does not silence them; with no controlling terminal they report
    //     "No terminal detected" and proceed.
    //   - `PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=0` skips the IPython
    //     runtime (uv + Python 3.11 + ipykernel). The agent prepares it on
    //     first ipython use, which keeps the on-demand install light.
    id: "prime-agent",
    title: "Prime Agent",
    binary: "prime-agent",
    installArgv: [
      "bash",
      "-lc",
      "curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL=0 npm_config_prefix=/home/sandbox/.local setsid --wait sh",
    ],
    installUser: "sandbox",
    verifyArgv: ["prime-agent", "--version"],
    docsPath: ".oh/docs/harnesses/prime-agent.md",
    kind: "on-demand",
  },
];

/** Catalog lookup by doc slug. `undefined` when the name is unknown. */
export function findHarness(id: string): HarnessEntry | undefined {
  return HARNESS_CATALOG.find((h) => h.id === id);
}

/** Every valid `<name>`, for the unknown-name error and the help text. */
export function harnessIds(): string[] {
  return HARNESS_CATALOG.map((h) => h.id);
}
