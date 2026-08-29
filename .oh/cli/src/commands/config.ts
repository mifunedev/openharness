import { assertSpawned, spawnRunner, type LifecycleRunner } from "../lib/execution/runner.js";
import { setConfigField } from "../lib/env-file.js";
import {
  findOhConfigField,
  ohConfigFieldPaths,
  ohConfigPath,
  readOhConfig,
} from "../lib/oh-config.js";
import { resolveProjectRoot } from "../lib/project.js";
import * as prompt from "../lib/prompt.js";
import { isSecretKey } from "../lib/secrets.js";

export interface ConfigIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface ConfigOptions {
  cwd?: string;
}

export function configFieldList(): string {
  return ohConfigFieldPaths()
    .map((path) => `  ${path}`)
    .join("\n");
}

export async function runConfigShow(opts: ConfigOptions, io: ConfigIO): Promise<number> {
  const root = resolveProjectRoot(opts.cwd);
  const config = readOhConfig(ohConfigPath(root));
  io.stdout(`${JSON.stringify(config, null, 2)}\n`);
  return 0;
}

export async function runConfigSet(
  key: string,
  value: string,
  opts: ConfigOptions,
  io: ConfigIO,
): Promise<number> {
  if (isSecretKey(key) || isSecretKey(key.toUpperCase())) {
    io.stderr(
      `oh config set: ${key.toUpperCase()} is a secret — oh.json is tracked by git.\n` +
        `Set it with \`oh secret set ${key.toUpperCase()}\` instead.\n`,
    );
    return 1;
  }

  if (!findOhConfigField(key)) {
    io.stderr(`oh config set: unknown field "${key}"\n\nFields:\n${configFieldList()}\n`);
    return 1;
  }

  const root = resolveProjectRoot(opts.cwd);
  let outcome: string;
  try {
    outcome = setConfigField(root, key, value);
  } catch (error) {
    io.stderr(`oh config set: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  io.stdout(
    outcome === "already-set"
      ? `oh.json: ${key} already ${value}\n`
      : `oh.json: set ${key}=${value} (${outcome})\n`,
  );
  return 0;
}

export interface RepoIO extends ConfigIO {
  ask?: (q: string) => Promise<string>;
  isTTY?: boolean;
}

export interface RepoOptions extends ConfigOptions {
  run?: LifecycleRunner;
}

interface PlannedCommand {
  cmd: string;
  args: string[];
}

const UPSTREAM_REMOTE = "openharness";

function repoUrl(owner: string, name: string): string {
  return `git@github.com:${owner}/${name}.git`;
}

function shellLine(step: PlannedCommand): string {
  return `${step.cmd} ${step.args.join(" ")}`;
}

function manualSteps(owner: string, name: string, visibility: string): PlannedCommand[] {
  return [
    { cmd: "gh", args: ["repo", "create", `${owner}/${name}`, `--${visibility}`] },
    { cmd: "git", args: ["remote", "rename", "origin", UPSTREAM_REMOTE] },
    { cmd: "git", args: ["remote", "add", "origin", repoUrl(owner, name)] },
    { cmd: "git", args: ["push", "-u", "origin", "HEAD"] },
  ];
}

function printManual(io: RepoIO, steps: PlannedCommand[], lead: string): void {
  io.stdout(`\n${lead}\n\n`);
  for (const step of steps) io.stdout(`    ${shellLine(step)}\n`);
  io.stdout("\n");
}

function validateSegment(kind: string, value: string): string | undefined {
  if (value === "") return `${kind} is required`;
  if (value.startsWith("-")) return `invalid ${kind} "${value}" (must not start with "-")`;
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return `invalid ${kind} "${value}" (use letters, digits, ".", "_" or "-")`;
  }
  return undefined;
}

async function askOn(io: RepoIO, question: string): Promise<string> {
  const askFn = io.ask ?? prompt.ask;
  return (await askFn(question)).trim();
}

async function confirmOn(io: RepoIO, question: string, defaultYes: boolean): Promise<boolean> {
  const answer = (await askOn(io, `${question} ${defaultYes ? "[Y/n]" : "[y/N]"}`)).toLowerCase();
  if (answer === "") return defaultYes;
  return /^y/.test(answer);
}

async function askVisibility(io: RepoIO): Promise<string> {
  io.stdout("  Repository visibility\n    1) private (recommended)\n    2) public\n");
  for (;;) {
    const answer = await askOn(io, "Choose [1-2] (default 1):");
    if (answer === "" || answer === "1") return "private";
    if (answer === "2") return "public";
    io.stderr("  Invalid choice. Pick 1 or 2.\n");
  }
}

export async function runConfigRepo(opts: RepoOptions, io: RepoIO): Promise<number> {
  const run = opts.run ?? spawnRunner;
  const isTTY = io.isTTY ?? process.stdin.isTTY === true;

  if (!isTTY) {
    io.stderr(
      "oh config repo: creating a repo on your GitHub account needs an interactive terminal; " +
        "re-run it from a TTY.\n",
    );
    return 1;
  }

  io.stdout(`\n${prompt.bold("Version this harness in your own repo")}\n`);
  io.stdout(
    "  Creates a repo on your GitHub account, keeps the upstream you cloned from\n" +
      `  as the "${UPSTREAM_REMOTE}" remote, and pushes this branch to yours.\n`,
  );

  if (!(await confirmOn(io, "Version this harness in your own repo?", false))) {
    printManual(
      io,
      manualSteps("<your-user>", "<repo>", "private"),
      "Skipped — nothing was created and no remote was touched. To do it later, run " +
        "`oh config repo`, or by hand:",
    );
    return 0;
  }

  const owner = await askOn(io, "GitHub owner (user or org):");
  const ownerError = validateSegment("GitHub owner", owner);
  if (ownerError) {
    io.stderr(`oh config repo: ${ownerError}\n`);
    return 1;
  }

  const name = await askOn(io, "Repository name [openharness]:");
  const repoName = name === "" ? "openharness" : name;
  const nameError = validateSegment("repository name", repoName);
  if (nameError) {
    io.stderr(`oh config repo: ${nameError}\n`);
    return 1;
  }

  const visibility = await askVisibility(io);
  const url = repoUrl(owner, repoName);
  const manual = manualSteps(owner, repoName, visibility);

  let root: string;
  try {
    root = resolveProjectRoot(opts.cwd);
  } catch (error) {
    io.stderr(`oh config repo: ${error instanceof Error ? error.message : String(error)}\n`);
    printManual(io, manual, "Nothing was changed. Finish this by hand from your checkout:");
    return 1;
  }
  const capture = { stdio: "capture", cwd: root } as const;

  const auth = run("gh", ["auth", "status"], capture);
  if (auth.error?.code === "ENOENT") {
    printManual(io, manual, "gh is not on PATH — finish this by hand:");
    return 0;
  }
  assertSpawned(auth, "gh auth status");
  if (auth.status !== 0) {
    printManual(
      io,
      manual,
      "gh is not authenticated (`gh auth login`) — finish this by hand once it is:",
    );
    return 0;
  }

  const remotesResult = run("git", ["remote"], capture);
  assertSpawned(remotesResult, "git remote");
  if (remotesResult.status !== 0) {
    printManual(io, manual, "`git remote` failed — is this a git repo? Finish this by hand:");
    return 0;
  }
  const remotes = (remotesResult.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  let originUrl = "";
  if (remotes.includes("origin")) {
    const shown = run("git", ["remote", "get-url", "origin"], capture);
    assertSpawned(shown, "git remote get-url origin");
    originUrl = (shown.stdout ?? "").trim();
  }

  const originIsTarget = originUrl !== "" && sameRemote(originUrl, owner, repoName);
  if (!originIsTarget && remotes.includes("origin") && remotes.includes(UPSTREAM_REMOTE)) {
    io.stderr(
      `oh config repo: origin already points at ${originUrl} and a "${UPSTREAM_REMOTE}" remote ` +
        `already exists — nothing was changed. Sort the remotes out by hand:\n`,
    );
    printManual(io, manual.slice(2), "Remaining steps:");
    return 1;
  }

  const steps: PlannedCommand[] = [];
  const exists = run("gh", ["repo", "view", `${owner}/${repoName}`], capture);
  assertSpawned(exists, "gh repo view");
  if (exists.status === 0) {
    io.stdout(`  ${owner}/${repoName} already exists — skipping creation.\n`);
  } else {
    steps.push(manual[0]);
  }

  if (originIsTarget) {
    io.stdout("  origin already points at your repo — leaving the remotes alone.\n");
  } else {
    if (remotes.includes("origin")) steps.push(manual[1]);
    steps.push(manual[2]);
  }
  steps.push(manual[3]);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    io.stdout(`  $ ${shellLine(step)}\n`);
    const result = run(step.cmd, step.args, { stdio: "inherit", cwd: root });
    if (result.error || result.status !== 0) {
      const detail = result.error?.message ?? `exit ${result.status}`;
      io.stderr(`oh config repo: ${shellLine(step)} failed (${detail}) — stopping here.\n`);
      const remaining = steps.slice(i + 1);
      if (remaining.length > 0) {
        printManual(io, remaining, "Not run. Finish by hand once the failure is fixed:");
      }
      return 1;
    }
  }

  io.stdout(
    `\n  Done — origin is ${url}` +
      `${remotes.includes("origin") && !originIsTarget ? `, upstream kept as "${UPSTREAM_REMOTE}"` : ""}.\n`,
  );
  return 0;
}

function sameRemote(url: string, owner: string, name: string): boolean {
  const normalized = url.replace(/\.git$/, "").toLowerCase();
  const slug = `${owner}/${name}`.toLowerCase();
  return normalized.endsWith(`:${slug}`) || normalized.endsWith(`/${slug}`);
}
