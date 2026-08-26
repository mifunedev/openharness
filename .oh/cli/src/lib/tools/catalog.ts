/**
 * The sandbox-tooling catalog — the single source of truth `oh tool` reads.
 *
 * THE THREE CATALOGS, AND THE LINE BETWEEN THEM:
 *
 *   ../harnesses/catalog.ts  agent CLIs you drive       (claude, codex, pi …)
 *   ../runtimes/catalog.ts   the isolation boundary     (docker, microsandbox …)
 *   this file                everything else the sandbox ships
 *
 * `agent-browser` is the entry that forced the third table. It lives in the
 * same `INSTALL_*` namespace in `.devcontainer/.env` as the optional harnesses, so it looks
 * like one — but it is a headless browser, not an agent, and
 * `__tests__/harness-catalog.test.ts` asserts its exclusion from that catalog.
 * The exclusion was always correct; until now it had no destination.
 *
 * WHY FIVE ENTRIES WHEN ONLY ONE IS INSTALLABLE:
 *
 * A table containing only `agent-browser` WOULD be the false singleton the
 * runtime catalog's header argues against — one row, no shape, a schema change
 * waiting to happen. The fix is not to pad it. The fix is that the category is
 * "sandbox tooling that is neither an agent CLI nor an isolation runtime", and
 * that category already has five real members, four of which are baked into the
 * image and therefore report-only.
 *
 * This is structurally the same table as `../runtimes/catalog.ts`: three
 * entries, exactly one installable. Reporting on a tool you cannot install is
 * the point, not filler — "is `gh` actually here, and what version" is a real
 * question the harness could not answer before.
 *
 * SHELL-STRING RULE, inherited from the harness catalog: argv arrays only. The
 * agent-browser installer is genuinely a three-step pipeline, so its argv is
 * `["bash", "-lc", "<constant>"]` where the string is a LITERAL in this file
 * with zero interpolation. `$PNPM_HOME` inside it is expanded by the container's
 * own login shell, not by this process, and nothing user-supplied reaches it.
 */

/** How a tool reaches the sandbox. */
export type ToolKind =
  /** In the base image, unconditionally. Nothing to install. */
  | "baked-in"
  /** Behind an `install:` key, installed by the entrypoint at container start. */
  | "opt-in";

/** One tool the CLI knows how to inspect and (maybe) install. */
export interface ToolEntry {
  /** The name the user types. */
  readonly id: string;
  readonly title: string;
  readonly kind: ToolKind;
  /** Executable this tool puts on PATH. */
  readonly binary: string;
  /**
   * Presence check. Exit 0 → installed.
   *
   * ALWAYS `command -v`, never `<binary> --version`. Presence and version are
   * different questions, and the shell cannot be wrong about PATH — see
   * `versionArgv` for why that distinction is load-bearing here.
   */
  readonly verifyArgv: readonly string[];
  /**
   * Optional version probe, reported by `status`.
   *
   * DECLARED ONLY WHERE `--version` IS AN INDUSTRY-STANDARD FLAG ON A
   * UBIQUITOUS TOOL (docker, gh, cloudflared). It is deliberately ABSENT for
   * `herdr` and `agent-browser`: neither binary exists on the machine this
   * catalog was written on, so their flags could not be confirmed, and the
   * repo's rule — set by `msb` in the runtime catalog — is to cite a verified
   * source or omit, never to guess a flag. `status` renders the absence as `—`.
   */
  readonly versionArgv?: readonly string[];
  /**
   * `INSTALL_*` key in lower snake_case WITHOUT the prefix. Only `opt-in` tools have
   * one; the installer must never invent a key for a baked-in tool.
   */
  readonly toolKey?: string;
  /**
   * Environment variable the ENTRYPOINT reads to decide whether to install.
   *
   * NOT `buildArg`. The harness catalog's `buildArg` carries an invariant —
   * "this name appears in .devcontainer/Dockerfile" — that its drift test
   * enforces. agent-browser has no Dockerfile presence at all; it is installed
   * at container start by `.devcontainer/entrypoint.sh`. Reusing `buildArg`
   * would quietly falsify the harness invariant, so this is a distinct field
   * with a distinct ground truth, and the drift test asserts BOTH that the name
   * is in entrypoint.sh/compose/harness-config.sh AND that it is absent from
   * the Dockerfile.
   */
  readonly entrypointGuard?: string;
  /** Install command, argv form. Absent for baked-in tools. */
  readonly installArgv?: readonly string[];
  /** User the install runs as inside the container. */
  readonly installUser?: "root" | "sandbox";
  /**
   * Approximate download size, when it is large enough that the operator
   * should be asked first. Presence of this field is what arms the
   * confirmation gate in `../../commands/tool.ts`.
   */
  readonly downloadSize?: string;
  /** Why `install` refuses. Required when there is no `installArgv`. */
  readonly notInstallableReason?: string;
  /** Repo-relative doc path, printed in list/status output. */
  readonly docsPath: string;
}

/** Docs live in one shared table; there is no per-tool page. */
const TOOLS_DOC = ".oh/docs/installation.md";

export const TOOL_CATALOG: readonly ToolEntry[] = Object.freeze([
  Object.freeze({
    id: "agent-browser",
    title: "agent-browser",
    kind: "opt-in",
    binary: "agent-browser",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v agent-browser >/dev/null"]),
    toolKey: "agent_browser",
    entrypointGuard: "INSTALL_AGENT_BROWSER",
    // Copied from `.devcontainer/entrypoint.sh`. The `2>&1 | tail -5` and the
    // echo/|| cosmetics are dropped: they shape the entrypoint's boot log, and
    // here they would swallow the installer's own output and its exit code.
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "pnpm add -g agent-browser@0.8.5 && find \"$PNPM_HOME\" -name \"agent-browser-linux-*\" -exec chmod +x {} \\; && agent-browser install --with-deps",
    ]),
    installUser: "sandbox",
    // Chromium. No harness install downloads anything close to this, which is
    // why this tool gets a confirmation the harness installs never needed.
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
]);

/** Look up one tool by the name the user typed. */
export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

/** Every known tool id, in catalog order. */
export function toolIds(): string[] {
  return TOOL_CATALOG.map((t) => t.id);
}

/** The tools `oh tool install` can actually act on. */
export function installableToolIds(): string[] {
  return TOOL_CATALOG.filter((t) => t.installArgv !== undefined).map((t) => t.id);
}
