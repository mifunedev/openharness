import { runSlack } from "./config/slack.js";

// Injected at build time from package.json#version (see build.mjs).
declare const __OH_VERSION__: string;
const VERSION: string = typeof __OH_VERSION__ === "string" ? __OH_VERSION__ : "0.0.0-dev";

interface Integration {
  description: string;
  runner: () => Promise<number>;
}

const INTEGRATIONS: Record<string, Integration> = {
  slack: {
    description: "Slack bridge tokens + allowlist",
    runner: runSlack,
  },
};

function isHelpFlag(arg: string | undefined): boolean {
  return arg === "--help" || arg === "-h" || arg === "help";
}

function isVersionFlag(arg: string | undefined): boolean {
  return arg === "--version" || arg === "-v";
}

function integrationLines(): string {
  const names = Object.keys(INTEGRATIONS);
  if (names.length === 0) return "  (none)";
  const width = Math.max(...names.map((n) => n.length));
  return names
    .map((n) => `  ${n.padEnd(width)}  ${INTEGRATIONS[n].description}`)
    .join("\n");
}

function printOhHelp(): void {
  process.stdout.write(`oh — Open Harness CLI (v${VERSION})

Usage:
  oh config <integration>   Configure an integration via interactive wizard
  oh --version              Print version
  oh --help                 Show this help

Integrations:
${integrationLines()}

Examples:
  oh config slack
`);
}

function printConfigHelp(): void {
  process.stdout.write(`oh config — Configure integrations

Usage:
  oh config <integration>
  oh config <integration> --help

Integrations:
${integrationLines()}

Examples:
  oh config slack
`);
}

function printIntegrationHelp(name: string, integration: Integration): void {
  process.stdout.write(`oh config ${name} — ${integration.description}

Usage:
  oh config ${name}

This launches an interactive wizard. It takes no flags.
`);
}

async function main(argv: string[]): Promise<number> {
  const [first, second, third] = argv;

  if (!first || isHelpFlag(first)) {
    printOhHelp();
    return 0;
  }
  if (isVersionFlag(first)) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === "config") {
    if (!second || isHelpFlag(second)) {
      printConfigHelp();
      return second ? 0 : 1;
    }

    const integration = INTEGRATIONS[second];
    if (!integration) {
      process.stderr.write(`oh config: unknown integration "${second}"\n\n`);
      printConfigHelp();
      return 1;
    }

    if (third && isHelpFlag(third)) {
      printIntegrationHelp(second, integration);
      return 0;
    }

    if (third !== undefined) {
      process.stderr.write(
        `oh config ${second}: unexpected argument "${third}". This wizard takes no flags.\n`,
      );
      return 1;
    }

    return await integration.runner();
  }

  process.stderr.write(`oh: unknown command "${first}"\n\n`);
  printOhHelp();
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`oh: ${msg}\n`);
    process.exit(2);
  },
);
