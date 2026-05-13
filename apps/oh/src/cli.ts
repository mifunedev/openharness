import { runSlack } from "./config/slack.js";

const VERSION = "0.1.0";

function printHelp(): void {
  process.stdout.write(`oh — Open Harness CLI (v${VERSION})

Usage:
  oh config <integration>   Configure an integration via interactive wizard
  oh --version              Print version
  oh --help                 Show this help

Integrations:
  slack                     Slack bridge tokens + allowlist

Examples:
  oh config slack
`);
}

function printConfigHelp(): void {
  process.stdout.write(`oh config — Configure integrations

Usage:
  oh config <integration>

Integrations:
  slack                     Slack bridge tokens + allowlist

Examples:
  oh config slack
`);
}

async function main(argv: string[]): Promise<number> {
  const [first, second] = argv;

  if (!first || first === "--help" || first === "-h" || first === "help") {
    printHelp();
    return 0;
  }
  if (first === "--version" || first === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === "config") {
    if (!second || second === "--help" || second === "-h") {
      printConfigHelp();
      return second ? 0 : 1;
    }
    switch (second) {
      case "slack":
        return await runSlack();
      default:
        process.stderr.write(`oh config: unknown integration "${second}"\n`);
        printConfigHelp();
        return 1;
    }
  }

  process.stderr.write(`oh: unknown command "${first}"\n`);
  printHelp();
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`oh: ${(err as Error).message ?? err}\n`);
    process.exit(2);
  },
);
