import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(REPO_ROOT, ".oh", "scripts", "spec-build.sh");
const LIB = path.join(REPO_ROOT, ".oh", "scripts", "lib", "session-runner.sh");
const TEMPLATE_REL = path.join(
  ".oh",
  "skills",
  "spec",
  "templates",
  "session-prompt.md",
);
const TEMPLATE = path.join(REPO_ROOT, TEMPLATE_REL);
const SCRIPT_SOURCE = readFileSync(SCRIPT, "utf-8");

const BASH = (() => {
  const r = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf-8" });
  return (r.stdout ?? "").trim() || "/usr/bin/bash";
})();

const scratch: string[] = [];

function tmpDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  while (scratch.length) {
    rmSync(scratch.pop() as string, { recursive: true, force: true });
  }
});


const HERDR_STUB = `#!/usr/bin/env bash
printf '%s\\n' "herdr $*" >> "\${STUB_CALLS:-/dev/null}"
sub="\${1:-}"; shift || true
case "$sub" in
  status)
    printf 'client:\\n  version: 0.7.4\\n\\nserver:\\n  status: running\\n  compatible: yes\\n'
    ;;
  agent)
    verb="\${1:-}"; shift || true
    case "$verb" in
      start)
        printf '{"result":{"agent":{"cwd":"%s","foreground_cwd":"%s","pane_id":"%s"}},"type":"agent_started"}\\n' \\
          "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_PANE_ID:-w7:p3}"
        ;;
      get)
        if [ "\${STUB_HERDR_AGENT_LIVE:-0}" = "1" ]; then
          printf '{"result":{"agent":{"pane_id":"%s"}},"type":"agent_info"}\\n' "\${STUB_HERDR_PANE_ID:-w7:p3}"
          exit 0
        fi
        printf '{"error":{"type":"agent_not_found"}}\\n' >&2; exit 1
        ;;
      *) exit 64 ;;
    esac
    ;;
  wait) exit "\${STUB_HERDR_WAIT_RC:-0}" ;;
  pane)
    verb="\${1:-}"; shift || true
    case "$verb" in
      read) printf '%s\\n' "\${STUB_HERDR_PROBE_OUT:-}" ;;
      list)
        printf '{"result":{"panes":[{"pane_id":"%s","foreground_cwd":"%s","cwd":"%s"}]}}\\n' \\
          "\${STUB_HERDR_PANE_ID:-w7:p3}" "\${STUB_HERDR_FG_CWD:-/w}" "\${STUB_HERDR_FG_CWD:-/w}"
        ;;
      close) printf '{"result":{"type":"ok"}}\\n' ;;
      *) exit 64 ;;
    esac
    ;;
  *) exit 64 ;;
esac
`;

const TMUX_STUB = `#!/usr/bin/env bash
printf '%s\\n' "tmux $*" >> "\${STUB_CALLS:-/dev/null}"
verb="\${1:-}"
case "$verb" in
  has-session)
    target=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-t" ]; then shift; target="\${1:-}"; fi
      shift
    done
    for s in \${STUB_TMUX_SESSIONS:-}; do
      if [ "$s" = "$target" ]; then exit 0; fi
    done
    exit 1
    ;;
  new-session) exit "\${STUB_TMUX_NEW_SESSION_RC:-0}" ;;
  kill-session) exit 0 ;;
  *) exit 0 ;;
esac
`;

function makeBin(opts: { herdr?: boolean; tmux?: boolean }): string {
  const dir = tmpDir("fm-bin-");
  if (opts.herdr) {
    const p = path.join(dir, "herdr");
    writeFileSync(p, HERDR_STUB);
    chmodSync(p, 0o755);
  }
  if (opts.tmux) {
    const p = path.join(dir, "tmux");
    writeFileSync(p, TMUX_STUB);
    chmodSync(p, 0o755);
  }
  return dir;
}


interface Repo {
  root: string;
  slug: string;
  taskDir: string;
  progressFile: string;
  runnerTmp: string;
  lock: string;
  promptFile: string;
  callsFile: string;
}

function makeRepo(
  slug: string,
  opts: { progress?: string; files?: string[]; branch?: string } = {},
): Repo {
  const root = tmpDir("fm-repo-");
  const taskDir = path.join(root, ".oh", "tasks", slug);
  const runnerTmp = path.join(root, "tmp");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(runnerTmp, { recursive: true });
  mkdirSync(path.join(root, path.dirname(TEMPLATE_REL)), { recursive: true });
  copyFileSync(TEMPLATE, path.join(root, TEMPLATE_REL));

  const files = opts.files ?? [
    "prd.md",
    "prd.json",
    "prompt.md",
    "progress.txt",
  ];
  for (const f of files) {
    if (f === "prd.json") {
      writeFileSync(
        path.join(taskDir, f),
        JSON.stringify(
          {
            branchName: opts.branch ?? `feat/4242-${slug}`,
            description: `a fixture task (issue #4242)`,
            userStories: [],
          },
          null,
          2,
        ),
      );
    } else if (f === "progress.txt") {
      writeFileSync(path.join(taskDir, f), opts.progress ?? "# progress\n");
    } else {
      writeFileSync(path.join(taskDir, f), `# ${f}\n`);
    }
  }

  return {
    root,
    slug,
    taskDir,
    progressFile: path.join(taskDir, "progress.txt"),
    runnerTmp,
    lock: path.join(runnerTmp, `build-${slug}.lock`),
    promptFile: path.join(runnerTmp, `build-${slug}.prompt.md`),
    callsFile: path.join(root, "calls.txt"),
  };
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(
  args: string[],
  opts: { repo?: Repo; bin?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const repo = opts.repo;
  const env: NodeJS.ProcessEnv = {
    PATH: opts.bin ? `${opts.bin}:${process.env.PATH ?? ""}` : process.env.PATH,
    ...(repo
      ? {
          HOME: repo.root,
          RUNNER_TMPDIR: repo.runnerTmp,
          STUB_CALLS: repo.callsFile,
        }
      : {}),
    ...opts.env,
  };
  const result = spawnSync(BASH, [SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: repo?.root,
    env,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function sourceCall(
  snippet: string,
  opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): RunResult {
  const result = spawnSync(BASH, ["-c", `source '${SCRIPT}'\n${snippet}`], {
    encoding: "utf-8",
    cwd: opts.cwd,
    env: { PATH: process.env.PATH, ...opts.env },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? -1,
  };
}

function readCalls(repo: Repo): string {
  try {
    return readFileSync(repo.callsFile, "utf-8");
  } catch {
    return "";
  }
}

function matchingProbeOutput(worktree: string): string {
  const r = spawnSync(
    BASH,
    ["-c", `source '${LIB}'\nrunner_local_fingerprint '${worktree}'`],
    { encoding: "utf-8" },
  );
  return `BUILD-SESSION-FINGERPRINT ${(r.stdout ?? "").trim()}`;
}


describe("task-folder validation", () => {
  it("rejects a slug that is not kebab-case, with the canonical message", () => {
    const repo = makeRepo("ok-slug");
    const r = run(["Bad Slug"], { repo });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must match ^[a-z0-9-]+$");
  });

  it("rejects a missing task folder", () => {
    const repo = makeRepo("ok-slug");
    const r = run(["absent-slug"], { repo });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("does not exist");
    expect(r.stderr).toContain("scaffold a task with /prd then /ralph first");
  });

  for (const missing of ["prd.md", "prd.json", "prompt.md", "progress.txt"]) {
    it(`rejects a task folder missing ${missing}`, () => {
      const files = ["prd.md", "prd.json", "prompt.md", "progress.txt"].filter(
        (f) => f !== missing,
      );
      const repo = makeRepo("partial", { files });
      const r = run(["partial"], { repo });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${missing} is missing`);
      expect(r.stderr).toContain("four-file contract");
    });
  }

  it("validates via the shared sourced helper, not a private copy", () => {
    expect(SCRIPT_SOURCE).toContain("lib/task-contract.sh");
    expect(SCRIPT_SOURCE).toContain("task_contract_validate_slug");
    expect(SCRIPT_SOURCE).toContain("task_contract_validate_dir");
  });

  it("rejects an unknown option and an unknown harness", () => {
    const repo = makeRepo("ok-slug");
    const bad = run(["--nope", "ok-slug"], { repo });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("unknown option");

    const harness = run(["--harness", "deepagents", "ok-slug"], { repo });
    expect(harness.status).toBe(2);
    expect(harness.stderr).toContain("unknown harness");
  });

  it("requires exactly one positional slug", () => {
    const repo = makeRepo("ok-slug");
    const r = run([], { repo });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });
});


describe("sentinel short-circuit", () => {
  it("exits 0 without launching anything when STATUS: COMPLETE is already present", () => {
    const repo = makeRepo("done-slug", {
      progress: "# progress\n\nSTATUS: COMPLETE\n",
    });
    const bin = makeBin({ tmux: true, herdr: true });
    const r = run(["done-slug"], { repo, bin });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("already present");
    expect(readCalls(repo)).toBe("");
    expect(existsSync(repo.lock)).toBe(false);
  });

  it("is anchored to the whole line — prose about the marker does not short-circuit", () => {
    const repo = makeRepo("prose-slug", {
      progress: "# progress\n\nI will append STATUS: COMPLETE when done.\n",
    });
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "prose-slug"], {
      repo,
      bin,
    });

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("already present");
    expect(readCalls(repo)).toContain("tmux new-session");
  });
});


describe("single-executor surface", () => {
  it("launches even when an unrelated tmux session shares the bare slug name", () => {
    const repo = makeRepo("busy-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "busy-slug"], {
      repo,
      bin,
      env: { STUB_TMUX_SESSIONS: "busy-slug" },
    });

    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("executor conflict");
    expect(readCalls(repo)).toContain("new-session");
  });

  it("names no alternative executor arm anywhere in the entrypoint", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/ralph/i);
    expect(SCRIPT_SOURCE).not.toContain("--executor");
  });
});


describe("launch-claim lock", () => {
  it("claims /tmp/build-<slug>.lock with an atomic mkdir on a clean launch", () => {
    const repo = makeRepo("lock-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "lock-slug"], {
      repo,
      bin,
    });

    expect(r.status).toBe(0);
    expect(existsSync(repo.lock)).toBe(true);
    expect(statSync(repo.lock).isDirectory()).toBe(true);
    expect(SCRIPT_SOURCE).toContain('mkdir "$lock"');
  });

  it("refuses a second launch while the lock is held AND the session is live", () => {
    const repo = makeRepo("live-slug");
    const bin = makeBin({ tmux: true });
    mkdirSync(repo.lock);

    const r = run(["--runner", "tmux", "--no-watch", "live-slug"], {
      repo,
      bin,
      env: { STUB_TMUX_SESSIONS: "agent-build-live-slug" },
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("already running");
    expect(r.stderr).toContain("--kill live-slug");
    expect(readCalls(repo)).not.toContain("new-session");
  });

  it("cross-checks liveness with `herdr agent get` in herdr mode", () => {
    const repo = makeRepo("held-slug");
    const bin = makeBin({ herdr: true });
    const fp = matchingProbeOutput(repo.root);
    mkdirSync(repo.lock);

    const live = run(["--runner", "herdr", "--no-watch", "held-slug"], {
      repo,
      bin,
      env: {
        STUB_HERDR_PROBE_OUT: fp,
        STUB_HERDR_FG_CWD: repo.root,
        STUB_HERDR_AGENT_LIVE: "1",
      },
    });
    expect(live.status).not.toBe(0);
    expect(live.stderr).toContain("already running");
    expect(readCalls(repo)).toContain("herdr agent get build-held-slug");

    const gone = run(["--runner", "herdr", "--no-watch", "held-slug"], {
      repo,
      bin,
      env: {
        STUB_HERDR_PROBE_OUT: fp,
        STUB_HERDR_FG_CWD: repo.root,
        STUB_HERDR_AGENT_LIVE: "0",
      },
    });
    expect(gone.status).toBe(0);
    expect(gone.stderr).toContain("stale lock");
  });

  it("treats a lock with no live session as stale and reclaimable", () => {
    const repo = makeRepo("stale-slug");
    const bin = makeBin({ tmux: true });
    mkdirSync(repo.lock);
    writeFileSync(path.join(repo.lock, "debris"), "from the crashed run\n");

    const r = run(["--runner", "tmux", "--no-watch", "stale-slug"], {
      repo,
      bin,
      env: { STUB_TMUX_SESSIONS: "" },
    });

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("stale lock");
    expect(existsSync(repo.lock)).toBe(true);
    expect(existsSync(path.join(repo.lock, "debris"))).toBe(false);
    expect(readCalls(repo)).toContain("tmux new-session");
  });
});


describe("exit paths", () => {
  it("removes the lock and appends BUILD-SESSION-INCOMPLETE after a launch failure", () => {
    const repo = makeRepo("fail-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "fail-slug"], {
      repo,
      bin,
      env: { STUB_TMUX_NEW_SESSION_RC: "1" },
    });

    expect(r.status).not.toBe(0);
    expect(existsSync(repo.lock)).toBe(false);
    const progress = readFileSync(repo.progressFile, "utf-8");
    expect(progress).toContain("BUILD-SESSION-INCOMPLETE");
    expect(progress).toContain("launch failure");
  });

  it("removes the lock when the herdr session cannot be verified in the launch cwd", () => {
    const repo = makeRepo("cwd-slug");
    const bin = makeBin({ herdr: true });
    const fp = matchingProbeOutput(repo.root);
    const r = run(["--runner", "herdr", "--no-watch", "cwd-slug"], {
      repo,
      bin,
      env: {
        STUB_HERDR_PROBE_OUT: fp,
        STUB_HERDR_FG_CWD: "/somewhere/else",
      },
    });

    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("different environment");
    expect(existsSync(repo.lock)).toBe(false);
    expect(readFileSync(repo.progressFile, "utf-8")).toContain(
      "BUILD-SESSION-INCOMPLETE",
    );
  });
});


describe("render_session_prompt", () => {
  const DECLARED = ["<slug>", "<branch>", "<issue>"];

  it("substitutes every declared placeholder and lets none survive", () => {
    const r = sourceCall(
      `render_session_prompt '${TEMPLATE}' demo-slug feat/9-demo 9`,
    );
    expect(r.status).toBe(0);

    for (const token of DECLARED) {
      expect(r.stdout).not.toContain(token);
    }
    const survivors = [...r.stdout.matchAll(/<[^ <>]+>/g)].map((m) => m[0]);
    expect(survivors).toEqual([]);

    expect(r.stdout).toContain("# Build Session — demo-slug");
    expect(r.stdout).toContain(".oh/tasks/demo-slug/prd.json");
    expect(r.stdout).toContain("feat/9-demo");
    expect(r.stdout).toContain("Issue: #9");
  });

  it("leaves {curly-brace} runtime-fill text untouched", () => {
    const r = sourceCall(
      `render_session_prompt '${TEMPLATE}' demo-slug feat/9-demo 9`,
    );
    expect(r.stdout).toContain("{story title}");
    expect(r.stdout).toContain("{YYYY-MM-DD HH:MM UTC}");
    expect(r.stdout).toContain("Submitted-by: {active harness identity}");
  });

  it("drops the authoring contract header and keeps the whole body", () => {
    const r = sourceCall(
      `render_session_prompt '${TEMPLATE}' demo-slug feat/9-demo 9`,
    );
    expect(r.stdout).not.toContain("END CONTRACT HEADER");
    expect(r.stdout).not.toContain("ANCHOR 1:");
    expect(r.stdout).toContain("## 1. Load the task graph");
    expect(r.stdout).toContain("## 9. Reference");
  });

  it("requires all four arguments and an existing template", () => {
    const missingArg = sourceCall(
      `render_session_prompt '${TEMPLATE}' demo-slug feat/9-demo`,
    );
    expect(missingArg.status).toBe(2);
    expect(missingArg.stderr).toContain("requires all four arguments");

    const missingTemplate = sourceCall(
      `render_session_prompt /nope/session-prompt.md s b 1`,
    );
    expect(missingTemplate.status).toBe(1);
    expect(missingTemplate.stderr).toContain("is missing");
  });

  it("substitutes only the declared set — an undeclared token is not its business", () => {
    const dir = tmpDir("fm-tpl-");
    const tpl = path.join(dir, "session-prompt.md");
    writeFileSync(tpl, "body for <slug> and <undeclared>\n");
    const r = sourceCall(`render_session_prompt '${tpl}' s b 1`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("body for s and <undeclared>");
  });

  it("refuses to emit a prompt in which a declared placeholder survived", () => {
    const dir = tmpDir("fm-tpl-");
    const tpl = path.join(dir, "session-prompt.md");
    writeFileSync(tpl, "slug=<slug> branch=<branch>\n");
    const r = sourceCall(`render_session_prompt '${tpl}' s '<slug>' 1`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("placeholder <slug> survived rendering");
    expect(r.stdout).toBe("");
  });

  it("resolves the branch and issue from prd.json", () => {
    const repo = makeRepo("meta-slug", { branch: "feat/77-meta" });
    const prd = path.join(repo.taskDir, "prd.json");
    const branch = sourceCall(`spec_build_branch_name '${prd}'`);
    const issue = sourceCall(`spec_build_issue_number '${prd}'`);
    expect(branch.stdout.trim()).toBe("feat/77-meta");
    expect(issue.stdout.trim()).toBe("4242");
  });

  it("renders BARE DIGITS for the issue — the template writes its own #", () => {
    const repo = makeRepo("hash-slug");
    const prd = path.join(repo.taskDir, "prd.json");
    const r = sourceCall(`spec_build_issue_number '${prd}'`, {
      env: { PATH: process.env.PATH, SPEC_BUILD_ISSUE: "#812" },
    });
    expect(r.stdout.trim()).toBe("812");
  });
});


describe("launch", () => {
  it("prints the resolved runner mode, the session handle, the log path and the watch command", () => {
    const repo = makeRepo("report-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "report-slug"], {
      repo,
      bin,
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("runner:   tmux");
    expect(r.stdout).toContain("handle:   agent-build-report-slug");
    expect(r.stdout).toContain(
      path.join(repo.runnerTmp, "agent-build-report-slug.log"),
    );
    expect(r.stdout).toContain("watch:    tmux attach -t agent-build-report-slug");
    expect(r.stdout).toContain("budget:   14400000ms");
  });

  it("uses the herdr naming contract and verifies foreground_cwd in herdr mode", () => {
    const repo = makeRepo("herdr-slug");
    const bin = makeBin({ herdr: true });
    const fp = matchingProbeOutput(repo.root);
    const r = run(["--runner", "herdr", "--no-watch", "herdr-slug"], {
      repo,
      bin,
      env: { STUB_HERDR_PROBE_OUT: fp, STUB_HERDR_FG_CWD: repo.root },
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("runner:   herdr");
    expect(r.stdout).toContain("handle:   build-herdr-slug (pane w7:p3)");
    expect(r.stdout).not.toContain(
      path.join(repo.runnerTmp, "build-herdr-slug.log"),
    );
    expect(r.stdout).toContain("log:      (herdr pane capture");
    expect(r.stdout).toContain("watch:    herdr agent read build-herdr-slug");

    const calls = readCalls(repo);
    expect(calls).toContain("herdr agent start build-herdr-slug");
    expect(calls).toContain("--no-focus");
    expect(calls).toContain("herdr pane list");
  });

  it("writes the rendered prompt to /tmp/build-<slug>.prompt.md and launches from it", () => {
    const repo = makeRepo("prompt-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "tmux", "--no-watch", "prompt-slug"], {
      repo,
      bin,
    });

    expect(r.status).toBe(0);
    expect(existsSync(repo.promptFile)).toBe(true);
    const rendered = readFileSync(repo.promptFile, "utf-8");
    expect(rendered).toContain("# Build Session — prompt-slug");
    expect(rendered).toContain("feat/4242-prompt-slug");
    expect(rendered).not.toContain("<slug>");

    const calls = readCalls(repo);
    expect(calls).toContain(repo.promptFile);
    expect(calls).toContain('"$(cat ');
    expect(calls).not.toContain("| tee ");
    expect(calls).not.toContain("--print");
  });

  it("honours SPEC_BUILD_HARNESS_CMD and exports the session's own signals", () => {
    const repo = makeRepo("env-slug");
    const bin = makeBin({ tmux: true });
    const marker = path.join(repo.root, "env-marker.txt");
    const r = run(["--runner", "foreground", "--no-watch", "env-slug"], {
      repo,
      bin,
      env: {
        SPEC_BUILD_HARNESS_CMD: `printf 'session=%s slug=%s prompt=%s\\n' "$SPEC_BUILD_SESSION" "$SPEC_BUILD_SLUG" "$SPEC_BUILD_PROMPT_FILE" > ${marker}`,
      },
    });

    expect(r.status).toBe(0);
    const deadline = Date.now() + 10_000;
    while (!existsSync(marker) && Date.now() < deadline) {
      spawnSync(BASH, ["-c", "sleep 0.2"]);
    }
    const observed = readFileSync(marker, "utf-8");
    expect(observed).toContain("session=1");
    expect(observed).toContain("slug=env-slug");
    expect(observed).toContain(repo.promptFile);
  });
});


describe("watch to completion", () => {
  it("exits 0, tears down and releases the lock once STATUS: COMPLETE lands", () => {
    const repo = makeRepo("e2e-slug");
    const bin = makeBin({ tmux: true });
    const r = run(["--runner", "foreground", "e2e-slug"], {
      repo,
      bin,
      env: {
        RUNNER_POLL_INTERVAL_S: "1",
        SPEC_BUILD_HARNESS_CMD: `printf 'STATUS: COMPLETE\\n' >> "$SPEC_BUILD_TASK_DIR/progress.txt"`,
      },
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toContain("STATUS: COMPLETE observed");
    expect(existsSync(repo.lock)).toBe(false);
    expect(readFileSync(repo.progressFile, "utf-8")).not.toContain(
      "BUILD-SESSION-INCOMPLETE",
    );
  });
});


describe("--kill", () => {
  it("clears the lock, tears the session down and records the outcome", () => {
    const repo = makeRepo("kill-slug");
    const bin = makeBin({ tmux: true, herdr: true });
    mkdirSync(repo.lock);

    const r = run(["--kill", "kill-slug"], {
      repo,
      bin,
      env: { STUB_HERDR_AGENT_LIVE: "1" },
    });

    expect(r.status).toBe(0);
    expect(existsSync(repo.lock)).toBe(false);
    expect(readFileSync(repo.progressFile, "utf-8")).toContain(
      "BUILD-SESSION-INCOMPLETE",
    );

    const calls = readCalls(repo);
    expect(calls).toContain("herdr pane close w7:p3");
    expect(calls).toContain("tmux kill-session -t agent-build-kill-slug");
    expect(calls).not.toContain("agent stop");
    expect(calls).not.toContain("agent kill");
    expect(calls).not.toContain("server stop");
    expect(r.stdout).toContain("the herdr server was not stopped or restarted");
  });

  it("still validates the slug", () => {
    const repo = makeRepo("kill-slug");
    const r = run(["--kill", "NOPE"], { repo });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must match ^[a-z0-9-]+$");
  });
});


describe("static contract", () => {
  it("is executable and launches via the US-001 session-runner library", () => {
    expect(statSync(SCRIPT).mode & 0o111).not.toBe(0);
    expect(SCRIPT_SOURCE).toContain("lib/session-runner.sh");
    for (const fn of [
      "runner_detect",
      "runner_launch",
      "runner_verify_cwd",
      "runner_alive",
      "runner_teardown",
      "runner_abort",
      "resolve_timeout_ms",
    ]) {
      expect(SCRIPT_SOURCE).toContain(fn);
    }
  });

  it("references no nonexistent herdr verb and never touches the server", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/herdr agent (stop|kill)/);
    expect(SCRIPT_SOURCE).not.toMatch(/herdr server stop/);
    expect(SCRIPT_SOURCE).not.toMatch(/herdr update/);
    expect(SCRIPT_SOURCE).not.toMatch(/herdr channel set/);
  });

});
