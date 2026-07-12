import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const RALPH = path.join(ROOT, ".oh/scripts/ralph.sh");
const WRAPPER = path.join(ROOT, ".oh/install/codelayer-wrapper.sh");
const STATUS = path.join(ROOT, ".oh/install/codelayer-status.sh");
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
