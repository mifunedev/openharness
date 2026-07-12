import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RALPH = path.join(ROOT, ".oh/scripts/ralph.sh");
const WRAPPER = path.join(ROOT, ".oh/install/codelayer-wrapper.sh");
const STATUS = path.join(ROOT, ".oh/install/codelayer-status.sh");
const BANNER = path.join(ROOT, ".oh/install/banner.sh");
const created: string[] = [];

afterEach(() => { for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function source(snippet: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync("bash", ["-c", `source '${RALPH}'\n${snippet}`], { encoding: "utf8", env });
}

function tempBin(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "codelayer-test-"));
  created.push(dir);
  return dir;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const CODELAYER_TMUX_ENV = [
  "RALPH_CODELAYER_PROVIDER", "RALPH_CODELAYER_FLAGS",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "FIREWORKS_API_KEY", "EXA_API_KEY",
  "AGENTLAYER_AUTH_PATH", "AGENT_SDK_AUTH_PATH", "OPENCODE_AUTH_PATH",
] as const;

function withoutCodeLayerEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of CODELAYER_TMUX_ENV) delete env[name];
  return env;
}

describe("CodeLayer image contract", () => {
  it("pins the coding package and creates the exact regular-file wrapper after unconditional removal", () => {
    const dockerfile = readFileSync(path.join(ROOT, ".devcontainer/Dockerfile"), "utf8");
    const wrapper = readFileSync(WRAPPER, "utf8");
    expect(dockerfile).toContain("ARG INSTALL_CODELAYER=false");
    expect(dockerfile).toContain("npm install -g --prefix /usr/local '@humanlayer/codelayer@0.0.61'");
    expect(dockerfile).toContain("rm -f /usr/local/bin/codelayer");
    expect(dockerfile).toContain("test ! -L /usr/local/bin/codelayer");
    expect(dockerfile).toContain("test -f /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts");
    expect(dockerfile).not.toContain("npm install -g '@humanlayer/cli");
    expect(wrapper).toBe('#!/bin/sh\nexec /usr/local/bin/bun /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts "$@"\n');
  });

  it("forwards argv containing spaces and empty elements exactly", () => {
    const dir = tempBin();
    const bun = path.join(dir, "bun");
    const out = path.join(dir, "argv");
    writeFileSync(bun, `#!/bin/sh\nprintf '%s\\0' "$@" > '${out}'\n`);
    chmodSync(bun, 0o755);
    const patched = readFileSync(WRAPPER, "utf8").replace("/usr/local/bin/bun", bun);
    const executable = path.join(dir, "codelayer");
    writeFileSync(executable, patched); chmodSync(executable, 0o755);
    const result = spawnSync(executable, ["two words", "", "plain"]);
    expect(result.status).toBe(0);
    expect(readFileSync(out)).toEqual(Buffer.from("/usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts\0two words\0\0plain\0"));
  });

  it("ships commented defaults and config mapping", () => {
    for (const file of ["harness.yaml.example", ".oh/templates/harness.yaml"]) {
      expect(readFileSync(path.join(ROOT, file), "utf8")).toMatch(/^  # codelayer: false/m);
    }
    expect(readFileSync(path.join(ROOT, ".oh/scripts/harness-config.sh"), "utf8"))
      .toContain('envmap["install.codelayer"]     = "INSTALL_CODELAYER"');
    expect(readFileSync(path.join(ROOT, ".devcontainer/docker-compose.yml"), "utf8"))
      .toContain("INSTALL_CODELAYER: ${INSTALL_CODELAYER:-false}");
  });
});

describe("CodeLayer banner status", () => {
  function statusWith(stub?: string) {
    const bin = tempBin();
    if (stub !== undefined) { const f = path.join(bin, "codelayer"); writeFileSync(f, stub); chmodSync(f, 0o755); }
    return spawnSync("sh", ["-c", `status_x=X status_ok=OK . '${STATUS}'; printf '%s|%s' "$codelayer_status" "$codelayer_detail"`], {
      encoding: "utf8", env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
  }
  it("reports absent with enable and rebuild guidance", () => expect(statusWith().stdout).toContain("X|not installed — set install.codelayer: true"));
  it("reports installed but never authenticated when offline help succeeds", () => {
    const out = statusWith("#!/bin/sh\n[ \"$1\" = --help ]\n").stdout;
    expect(out).toContain("OK|installed — provider authentication is not verified");
  });
  it("reports degraded when local help fails", () => expect(statusWith("#!/bin/sh\nexit 7\n").stdout).toContain("X|installed but local help failed"));

  it("sources the actual banner from another cwd and prints the CodeLayer row", () => {
    const home = tempBin();
    const bin = path.join(home, "bin");
    mkdirSync(bin);
    writeFileSync(path.join(bin, "codelayer"), "#!/bin/sh\n[ \"$1\" = --help ]\n");
    chmodSync(path.join(bin, "codelayer"), 0o755);
    const result = spawnSync("bash", ["--noprofile", "--norc", "-ic", `. ${shellQuote(BANNER)}`], {
      cwd: "/",
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}:/usr/bin:/bin`,
        OH_BANNER_STATUS_STYLE: "legacy",
        OH_BANNER_SHOWN: "",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\[✓\]\s+codelayer\s+installed — provider authentication is not verified/);
  });
});

describe("Ralph CodeLayer adapter", () => {
  it("accepts codelayer explicitly without changing fallback branches", () => {
    expect(source("normalize_harness codelayer").stdout.trim()).toBe("codelayer");
    expect(source("fallback_after_harness codelayer").stderr).toMatch(/no fallback/);
  });

  it("emits exact argv with provider set/unset and ordinary flags", () => {
    const bin = tempBin(); const out = path.join(bin, "argv");
    writeFileSync(path.join(bin, "codelayer"), `#!/bin/sh\nprintf '%s\\0' "$@" > '${out}'\n`); chmodSync(path.join(bin, "codelayer"), 0o755);
    let result = source("run_codelayer 'task with spaces'", { ...process.env, PATH: `${bin}:/usr/bin:/bin`, RALPH_CODELAYER_FLAGS: "--model gpt-4.1 --verbose", RALPH_CODELAYER_PROVIDER: "openai" });
    expect(result.status).toBe(0);
    expect(readFileSync(out)).toEqual(Buffer.from("--model\0gpt-4.1\0--verbose\0--provider\0openai\0--prompt\0task with spaces\0"));
    result = source("run_codelayer task", { ...process.env, PATH: `${bin}:/usr/bin:/bin`, RALPH_CODELAYER_FLAGS: "   ", RALPH_CODELAYER_PROVIDER: "" });
    expect(result.status).toBe(0);
    expect(readFileSync(out)).toEqual(Buffer.from("--prompt\0task\0"));
  });

  for (const value of ["--prompt x", "--prompt=x", "--promptVALUE", "--provider x", "--provider=x", "-p", "-pfoo", "'two words'", '"two words"', "two\\ words", "x;y", "x&y", "x|y", "x$y", "x*y", "x?y", "x[y]"]) {
    it(`rejects unsafe/reserved flags: ${value}`, () => {
      const result = source("parse_codelayer_flags", { ...process.env, RALPH_CODELAYER_FLAGS: value });
      expect(result.status).not.toBe(0);
    });
  }

  it("builds tmux argv with allowlisted values outside the launch command", () => {
    const repo = tempBin();
    const bin = path.join(repo, "bin");
    const task = "codelayer-launch-argv-test";
    const taskDir = path.join(repo, ".oh", "tasks", task);
    const capture = path.join(repo, "tmux-argv");
    mkdirSync(bin);
    mkdirSync(taskDir, { recursive: true });
    for (const file of ["prd.md", "prd.json", "prompt.md", "progress.txt"]) writeFileSync(path.join(taskDir, file), file === "prompt.md" ? "launch task\n" : "{}\n");
    expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
    writeFileSync(path.join(bin, "tmux"), `#!/bin/sh\nif [ \"$1\" = has-session ]; then exit 1; fi\nprintf '%s\\0' \"$@\" > ${shellQuote(capture)}\n`);
    writeFileSync(path.join(bin, "codelayer"), "#!/bin/sh\nexit 0\n");
    chmodSync(path.join(bin, "tmux"), 0o755);
    chmodSync(path.join(bin, "codelayer"), 0o755);

    const client = spawnSync("bash", [RALPH, "--harness=codelayer", task], {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...withoutCodeLayerEnv(),
        PATH: `${bin}:/usr/bin:/bin`,
        RALPH_CODELAYER_PROVIDER: "open ai",
        RALPH_CODELAYER_FLAGS: "--model gpt-4.1 --verbose",
        OPENAI_API_KEY: "fixture key with spaces",
        ANTHROPIC_API_KEY: "",
      },
    });
    expect(client.status).toBe(0);
    const tmuxArgs = readFileSync(capture).toString().split("\0").filter(Boolean);
    expect(tmuxArgs.slice(0, 2)).toEqual(["new-session", "-E"]);
    expect(tmuxArgs).toContain("RALPH_CODELAYER_PROVIDER=open ai");
    expect(tmuxArgs).toContain("RALPH_CODELAYER_FLAGS=--model gpt-4.1 --verbose");
    expect(tmuxArgs).toContain("OPENAI_API_KEY=fixture key with spaces");
    expect(tmuxArgs).toContain("ANTHROPIC_API_KEY=");
    expect(tmuxArgs).not.toContain(expect.stringContaining("FIREWORKS_API_KEY="));
    const launch = tmuxArgs.at(-1) ?? "";
    expect(launch).not.toContain("fixture key with spaces");
    expect(launch).not.toContain("open ai");
    expect(launch).toContain("unset FIREWORKS_API_KEY;");
  });

  it("overrides stale CodeLayer values in a real existing tmux 3.3a+ server", () => {
    expect(spawnSync("tmux", ["-V"], { encoding: "utf8" }).stdout).toMatch(/^tmux (?:3\.[3-9]|[4-9]\.)/);
    const repo = tempBin();
    const bin = path.join(repo, "bin");
    const tmuxTmp = path.join(repo, "tmux");
    const task = "codelayer-real-tmux-test";
    const taskDir = path.join(repo, ".oh", "tasks", task);
    const envCapture = path.join(repo, "codelayer-env.json");
    const argvCapture = path.join(repo, "codelayer-argv.json");
    const progress = path.join(taskDir, "progress.txt");
    const ralphLog = `/tmp/ralph-${task}.log`;
    created.push(ralphLog);
    mkdirSync(bin);
    mkdirSync(tmuxTmp, { mode: 0o700 });
    mkdirSync(taskDir, { recursive: true });
    for (const file of ["prd.md", "prd.json"]) writeFileSync(path.join(taskDir, file), "{}\n");
    writeFileSync(path.join(taskDir, "prompt.md"), "real tmux task\n");
    writeFileSync(progress, "# progress\n");
    expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
    writeFileSync(path.join(bin, "codelayer"), `#!${process.execPath}\nconst fs = require("node:fs");\nconst names = ${JSON.stringify(CODELAYER_TMUX_ENV)};\nfs.writeFileSync(${JSON.stringify(envCapture)}, JSON.stringify(Object.fromEntries(names.concat(["UNRELATED_SERVER_ENV"]).map(n => [n, { set: Object.hasOwn(process.env, n), value: process.env[n] }]))));\nfs.writeFileSync(${JSON.stringify(argvCapture)}, JSON.stringify(process.argv.slice(2)));\nfs.appendFileSync(${JSON.stringify(progress)}, "STATUS: COMPLETE\\n");\n`);
    chmodSync(path.join(bin, "codelayer"), 0o755);

    const baseEnv = { ...withoutCodeLayerEnv(), HOME: repo, PATH: `${bin}:/usr/bin:/bin`, TMUX_TMPDIR: tmuxTmp };
    const staleEnv: NodeJS.ProcessEnv = { ...baseEnv, UNRELATED_SERVER_ENV: "normal server inheritance" };
    for (const name of CODELAYER_TMUX_ENV) staleEnv[name] = `stale ${name}`;
    expect(spawnSync("tmux", ["new-session", "-d", "-s", "seed", "sleep 30"], { env: staleEnv }).status).toBe(0);

    const clientValues: NodeJS.ProcessEnv = {
      ...baseEnv,
      RALPH_CODELAYER_PROVIDER: "open ai",
      RALPH_CODELAYER_FLAGS: "--model gpt-4.1 --verbose",
      OPENAI_API_KEY: "client openai key with spaces",
      ANTHROPIC_API_KEY: "",
      FIREWORKS_API_KEY: "client fireworks key",
      EXA_API_KEY: "client exa key",
      AGENTLAYER_AUTH_PATH: "/client path/agentlayer.json",
      AGENT_SDK_AUTH_PATH: "/client path/agent-sdk.json",
      // OPENCODE_AUTH_PATH intentionally remains unset.
    };
    const client = spawnSync("bash", [RALPH, "--harness=codelayer", task], { cwd: repo, encoding: "utf8", env: clientValues });
    expect(client.status).toBe(0);
    for (let attempt = 0; attempt < 100 && spawnSync("test", ["-f", envCapture]).status !== 0; attempt++) spawnSync("sleep", ["0.1"]);

    const captured = JSON.parse(readFileSync(envCapture, "utf8")) as Record<string, { set: boolean; value?: string }>;
    for (const name of CODELAYER_TMUX_ENV) {
      if (Object.hasOwn(clientValues, name)) expect(captured[name]).toEqual({ set: true, value: clientValues[name] });
    }
    expect(captured.OPENCODE_AUTH_PATH).toEqual({ set: false });
    expect(captured.UNRELATED_SERVER_ENV).toEqual({ set: true, value: "normal server inheritance" });
    expect(JSON.parse(readFileSync(argvCapture, "utf8"))).toEqual(["--model", "gpt-4.1", "--verbose", "--provider", "open ai", "--prompt", "real tmux task"]);
    const log = readFileSync(ralphLog, "utf8");
    expect(log).not.toContain("client openai key with spaces");
    expect(log).not.toContain("client fireworks key");
    expect(spawnSync("tmux", ["kill-server"], { env: baseEnv }).status).toBe(0);
  });

  it("never uses eval and treats only progress exact lines as authoritative for CodeLayer", () => {
    const text = readFileSync(RALPH, "utf8");
    expect(text).not.toMatch(/\beval\b/);
    const dir = tempBin(); const out = path.join(dir, "out"); const progress = path.join(dir, "progress");
    writeFileSync(out, "STATUS: COMPLETE\n"); writeFileSync(progress, "prefix STATUS: COMPLETE\nSTATUS: COMPLETE soon\n");
    expect(source(`iteration_output_completes codelayer '${out}'`).status).not.toBe(0);
    expect(source(`progress_file_completes '${progress}'`).status).not.toBe(0);
    writeFileSync(progress, "near\nSTATUS: COMPLETE\n");
    expect(source(`progress_file_completes '${progress}'`).status).toBe(0);
  });
});
