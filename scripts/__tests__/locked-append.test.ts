import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "locked-append.sh");

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "locked-append-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function run(target: string | undefined, input = ""): ReturnType<typeof spawnSync> {
  const args = target === undefined ? [SCRIPT] : [SCRIPT, target];
  return spawnSync("bash", args, {
    input,
    encoding: "utf-8",
    env: { ...process.env, TMPDIR: tmp },
  });
}

describe("locked-append.sh", () => {
  it("rejects a missing target argument", () => {
    const result = run(undefined, "ignored");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("usage: locked-append.sh <target-file>");
  });

  it("creates parent directories and appends stdin", () => {
    const target = path.join(tmp, "nested", "logs", "run.log");
    const result = run(target, "hello\n");
    expect(result.status).toBe(0);
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, "utf-8")).toBe("hello\n");
  });

  it("preserves exact bytes across multi-line appends", () => {
    const target = path.join(tmp, "memory", "log.md");
    expect(run(target, "alpha\n\nbeta\n").status).toBe(0);
    expect(run(target, "gamma\n").status).toBe(0);
    expect(readFileSync(target, "utf-8")).toBe("alpha\n\nbeta\ngamma\n");
  });

  it("serializes concurrent whole-record appends", () => {
    const target = path.join(tmp, "crons", ".cron.log");
    const driver = Array.from({ length: 24 }, (_, i) => {
      const n = String(i).padStart(2, "0");
      const payload = `BEGIN ${n}\\nline ${n} a\\nline ${n} b\\nEND ${n}\\n`;
      return `printf '${payload}' | bash '${SCRIPT}' '${target}'`;
    }).join(" &\n") + "\nwait\n";

    const result = spawnSync("bash", ["-lc", driver], {
      encoding: "utf-8",
      env: { ...process.env, TMPDIR: tmp },
    });
    expect(result.status).toBe(0);

    const text = readFileSync(target, "utf-8");
    const records = text.match(/BEGIN \d{2}\nline \d{2} a\nline \d{2} b\nEND \d{2}\n/g) ?? [];
    expect(records).toHaveLength(24);
    for (let i = 0; i < 24; i += 1) {
      const n = String(i).padStart(2, "0");
      expect(text).toContain(`BEGIN ${n}\nline ${n} a\nline ${n} b\nEND ${n}\n`);
    }
  });
});
