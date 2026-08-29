import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "node-pnpm-parity.sh");

function fixture(perBase: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "node-pnpm-parity-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });

  const cases = Object.entries(perBase)
    .map(([base, out]) => `  ${JSON.stringify(base)}) printf '%s\\n' ${JSON.stringify(out)} ;;`)
    .join("\n");

  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
${cases}
  esac
done
exit 0
`,
  );
  chmodSync(docker, 0o755);
  return { bin };
}

function run(fx: { bin: string }, args: string[] = []) {
  return spawnSync("bash", [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, PATH: `${fx.bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

describe("node-pnpm-parity", () => {
  it("reads the node base image tag and pnpm pin straight from the Dockerfile", () => {
    const fx = fixture({
      "node:22-bookworm-slim": "v22.14.0 10.33.0",
      "node:22-trixie-slim": "v22.14.0 10.33.0",
    });

    const result = run(fx);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("node base:  node:22-trixie-slim");
    expect(result.stdout).toContain("pnpm pin:   10.33.0");
    expect(result.stdout).toContain("PARITY: node:22-bookworm-slim and node:22-trixie-slim");
  });

  it("reports a divergence between the two bases", () => {
    const fx = fixture({
      "node:22-bookworm-slim": "v22.14.0 10.33.0",
      "node:22-trixie-slim": "v22.15.1 10.33.0",
    });

    const result = run(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DIVERGENCE");
    expect(result.stderr).toContain("v22.15.1 10.33.0");
  });

  it("fails loudly when the Dockerfile carries no readable pins", () => {
    const empty = join(mkdtempSync(join(tmpdir(), "parity-df-")), "Dockerfile");
    writeFileSync(empty, "FROM debian:trixie-slim\n");

    const result = spawnSync("bash", [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, PARITY_DOCKERFILE: empty },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not read the node base image tag or the pnpm pin");
  });
});
