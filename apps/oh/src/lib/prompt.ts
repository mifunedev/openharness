import { createInterface } from "node:readline";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

export function ok(msg: string): void {
  process.stdout.write(`  ${COLORS.green}✓${COLORS.reset} ${msg}\n`);
}

export function warn(msg: string): void {
  process.stdout.write(`  ${COLORS.yellow}!${COLORS.reset} ${msg}\n`);
}

export function fail(msg: string): void {
  process.stderr.write(`  ${COLORS.red}✗${COLORS.reset} ${msg}\n`);
}

export function info(msg: string): void {
  process.stdout.write(`  ${msg}\n`);
}

export function header(msg: string): void {
  process.stdout.write(`\n${COLORS.bold}${msg}${COLORS.reset}\n\n`);
}

export function redact(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 5) + "*".repeat(token.length - 5);
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(`  ${question} `, (answer) => resolve(answer.trim()));
    });
  } finally {
    rl.close();
  }
}

export async function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Suppress echo by intercepting the output writer. Without this, every
  // keystroke would be echoed to the terminal and the token would be
  // visible mid-entry.
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  let prompted = false;
  const patched = (chunk: string | Uint8Array): boolean => {
    if (!prompted) {
      prompted = true;
      return stdoutWrite(chunk);
    }
    return true; // swallow keystroke echoes
  };
  type WritableHole = { write: (chunk: string | Uint8Array) => boolean };
  (process.stdout as unknown as WritableHole).write = patched;

  // Restore terminal state on any exit path — normal return, throw, or
  // SIGINT. Without the SIGINT handler, Ctrl-C during token entry would
  // leave the terminal with echo suppressed for the rest of the shell
  // session.
  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    (process.stdout as unknown as WritableHole).write = stdoutWrite;
    try { rl.close(); } catch { /* ignore */ }
  };

  const onSigint = (): void => {
    restore();
    process.stdout.write("\n");
    process.exit(130); // 128 + SIGINT(2) — conventional shell-interrupt code
  };
  process.on("SIGINT", onSigint);

  try {
    return await new Promise<string>((resolve) => {
      rl.question(`  ${question} `, (answer) => {
        process.stdout.write("\n");
        resolve(answer.trim());
      });
    });
  } finally {
    process.removeListener("SIGINT", onSigint);
    restore();
  }
}

export async function askChoice(
  question: string,
  options: { label: string; value: string }[],
): Promise<string> {
  process.stdout.write(`  ${question}\n`);
  options.forEach((opt, i) => {
    process.stdout.write(`    ${COLORS.cyan}${i + 1}${COLORS.reset}) ${opt.label}\n`);
  });
  while (true) {
    const answer = await ask(`Choose [1-${options.length}]:`);
    const idx = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
      return options[idx].value;
    }
    warn(`Invalid choice. Pick 1-${options.length}.`);
  }
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${question} ${suffix}`)).toLowerCase();
  if (answer === "") return defaultYes;
  return /^y/.test(answer);
}
