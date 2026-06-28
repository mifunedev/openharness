import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "sandbox-boot-smoke.sh");

function fixture(opts: { dockerExecAlwaysFails?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-boot-smoke-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const composeLog = join(dir, "compose.log");
  const execCount = join(dir, "exec-count");

  const compose = join(dir, "compose.sh");
  writeFileSync(
    compose,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(composeLog)}
if [ "$1" = "ps" ] && [ "\${2:-}" = "-q" ]; then
  printf 'cid-123\n'
  exit 0
fi
if [ "$1" = "ps" ]; then
  printf 'NAME STATUS\nopenharness running\n'
  exit 0
fi
exit 0
`,
  );
  chmodSync(compose, 0o755);

  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
case "$1" in
  exec)
    count=0
    [ -f ${JSON.stringify(execCount)} ] && count=$(cat ${JSON.stringify(execCount)})
    count=$((count + 1))
    printf '%s' "$count" > ${JSON.stringify(execCount)}
    if [ "${opts.dockerExecAlwaysFails ? "1" : "0"}" = "1" ] || [ "$count" -lt 2 ]; then
      echo 'health not ready' >&2
      exit 1
    fi
    echo 'sandbox healthcheck ok'
    exit 0
    ;;
  inspect)
    printf 'starting\n'
    exit 0
    ;;
  logs)
    printf 'entrypoint log tail\n'
    exit 0
    ;;
esac
echo "unexpected docker args: $*" >&2
exit 2
`,
  );
  chmodSync(docker, 0o755);

  return { dir, bin, compose, composeLog };
}

function runSmoke(fx: ReturnType<typeof fixture>, extraEnv: Record<string, string> = {}) {
  return spawnSync("bash", [SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `${fx.bin}:${process.env.PATH}`,
      BOOT_SMOKE_COMPOSE: fx.compose,
      BOOT_SMOKE_TIMEOUT_SECONDS: "3",
      BOOT_SMOKE_INTERVAL_SECONDS: "1",
      SANDBOX_NAME: "openharness-test",
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

describe("sandbox boot smoke", () => {
  it("starts the sandbox service, polls the healthcheck, and tears down", () => {
    const fx = fixture();

    const result = runSmoke(fx);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("sandbox boot smoke ok");
    const composeCalls = readFileSync(fx.composeLog, "utf8");
    expect(composeCalls).toContain("up -d --no-build sandbox");
    expect(composeCalls).toContain("ps -q sandbox");
    expect(composeCalls).toContain("down -v --remove-orphans");
  });

  it("prints compose, health, and log diagnostics on timeout", () => {
    const fx = fixture({ dockerExecAlwaysFails: true });

    const result = runSmoke(fx, { BOOT_SMOKE_TIMEOUT_SECONDS: "0" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sandbox boot smoke timed out");
    expect(result.stderr).toContain("--- docker compose ps");
    expect(result.stderr).toContain("--- container health inspect (cid-123)");
    expect(result.stderr).toContain("entrypoint log tail");
    const composeCalls = readFileSync(fx.composeLog, "utf8");
    expect(composeCalls).toContain("down -v --remove-orphans");
  });
});
