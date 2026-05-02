#!/usr/bin/env node

/**
 * openharness — Open Harness CLI
 *
 * Commander.js-based subcommand router. Each action lives in
 * `./actions/*.ts` and is lazy-loaded via dynamic import so cold-start
 * stays fast for `--help` / `--version`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/src/cli/index.js → ../../../package.json
    // src/cli/index.ts (tsx) → ../../package.json
    const candidates = [
      join(here, "..", "..", "..", "package.json"),
      join(here, "..", "..", "package.json"),
    ];
    for (const path of candidates) {
      if (existsSync(path)) {
        const pkg = JSON.parse(readFileSync(path, "utf-8")) as { version?: string };
        if (typeof pkg.version === "string") return pkg.version;
      }
    }
  } catch {
    // fallthrough
  }
  return "0.0.0";
}

export function isInsideContainer(): boolean {
  return existsSync("/.dockerenv");
}

export const HOST_ONLY_COMMANDS = new Set(["sandbox", "run", "stop", "clean", "shell", "list"]);

/**
 * Build the Commander program. Exported for tests so they can introspect
 * registered subcommands and option flags without spawning a process.
 */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("oh")
    .description("openharness — sandbox-for-harnesses platform")
    .version(readVersion(), "-v, --version");

  // ─── Container lifecycle (host-only) ────────────────────────────────
  program
    .command("sandbox [name]")
    .description("provision (build + start) a sandbox")
    .action(async (name?: string) => {
      const { sandboxAction } = await import("./actions/sandbox.js");
      await sandboxAction(name);
    });

  program
    .command("run [name]")
    .description("start the sandbox container")
    .action(async (name?: string) => {
      const { runAction } = await import("./actions/run.js");
      await runAction(name);
    });

  program
    .command("stop [name]")
    .description("stop and remove the sandbox container")
    .action(async (name?: string) => {
      const { stopAction } = await import("./actions/stop.js");
      await stopAction(name);
    });

  program
    .command("clean [name]")
    .description("full cleanup (containers + volumes)")
    .action(async (name?: string) => {
      const { cleanAction } = await import("./actions/clean.js");
      await cleanAction(name);
    });

  program
    .command("shell <name>")
    .description("open an interactive shell in the sandbox")
    .action(async (name: string) => {
      const { shellAction } = await import("./actions/shell.js");
      await shellAction(name);
    });

  program
    .command("list")
    .description("list running sandboxes")
    .action(async () => {
      const { listAction } = await import("./actions/list.js");
      await listAction();
    });

  // ─── Onboarding ─────────────────────────────────────────────────────
  program
    .command("onboard [target]")
    .description(
      "setup wizard — sandbox name OR a single step (slack, llm, ssh, github, cloudflare, claude)",
    )
    .option("--force", "re-run completed steps")
    .option("--only <step>", "run only the named step")
    .action(async (target: string | undefined, opts: { force?: boolean; only?: string }) => {
      const { onboardAction } = await import("./actions/onboard.js");
      await onboardAction(target, { force: opts.force, only: opts.only });
    });

  // ─── Worktree ───────────────────────────────────────────────────────
  program
    .command("worktree <name>")
    .description("create a git worktree for branch isolation")
    .option("--base-branch <branch>", "base branch (default: development)")
    .action(async (name: string, opts: { baseBranch?: string }) => {
      const { worktreeAction } = await import("./actions/worktree.js");
      await worktreeAction(name, { baseBranch: opts.baseBranch });
    });

  // ─── Gateway / expose ───────────────────────────────────────────────
  program
    .command("ports [name]")
    .description("inspect listeners and exposed routes")
    .action(async (name?: string) => {
      const { portsAction } = await import("./actions/ports.js");
      await portsAction(name);
    });

  program
    .command("expose <name> <port>")
    .description("expose a sandbox app via a Caddy route")
    .action(async (name: string, port: string) => {
      const { exposeAction } = await import("./actions/expose.js");
      await exposeAction(name, port);
    });

  program
    .command("unexpose <name>")
    .description("remove a Caddy route")
    .action(async (name: string) => {
      const { unexposeAction } = await import("./actions/unexpose.js");
      await unexposeAction(name);
    });

  program
    .command("open <target>")
    .description("open a route's URL (by name or port)")
    .action(async (target: string) => {
      const { openAction } = await import("./actions/open.js");
      await openAction(target);
    });

  // ─── Harness packs (NEW from openharness/mifune split) ──────────────
  // Placeholder action handlers — real implementation lands in T5
  // alongside src/harness/pack.ts and src/harness/registry.ts.
  const harness = program.command("harness").description("manage harness packs");
  harness
    .command("add <spec>")
    .description("install a harness pack (npm package, owner/repo, git URL, or local path)")
    .action(async (spec: string) => {
      const { harnessAddAction } = await import("./actions/harness.js");
      await harnessAddAction(spec);
    });
  harness
    .command("list")
    .description("list installed harness packs")
    .action(async () => {
      const { harnessListAction } = await import("./actions/harness.js");
      await harnessListAction();
    });
  harness
    .command("remove <name>")
    .description("uninstall a harness pack")
    .action(async (name: string) => {
      const { harnessRemoveAction } = await import("./actions/harness.js");
      await harnessRemoveAction(name);
    });

  // ─── Host-only enforcement (replaces ad-hoc HOST_ONLY_COMMANDS check)
  program.hook("preAction", (thisCommand) => {
    if (HOST_ONLY_COMMANDS.has(thisCommand.name()) && isInsideContainer()) {
      console.error(`Error: 'oh ${thisCommand.name()}' is a host-only command.`);
      console.error("You are inside the sandbox. Run this from the host instead.");
      process.exit(1);
    }
  });

  return program;
}

const program = buildProgram();

const isMainModule = (() => {
  if (typeof process.argv[1] !== "string") return false;
  try {
    const here = fileURLToPath(import.meta.url);
    return here === process.argv[1] || process.argv[1].endsWith("cli/index.js");
  } catch {
    return false;
  }
})();

if (isMainModule) {
  program.parseAsync(process.argv).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  });
}

export { program };
