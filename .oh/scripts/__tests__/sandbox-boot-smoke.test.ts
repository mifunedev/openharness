import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "sandbox-boot-smoke.sh");

const HOST_UID = String(process.getuid?.() ?? 0);
const HOST_GID = String(process.getgid?.() ?? 0);

function fixture(
  opts: {
    dockerExecAlwaysFails?: boolean;
    runtimeExecFails?: boolean;
    runtimeUid?: string;
    markerOwner?: string;
    harnessProbeFails?: boolean;
    noDefaultHarnesses?: boolean;
    noDefaultTools?: boolean;
  } = {},
) {
  const runtimeUid = opts.runtimeUid ?? HOST_UID;
  const markerOwner = opts.markerOwner ?? `${HOST_UID}:${HOST_GID}`;
  const dir = mkdtempSync(join(tmpdir(), "sandbox-boot-smoke-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const composeLog = join(dir, "compose.log");
  const dockerLog = join(dir, "docker.log");
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
printf '%s\n' "$*" >> ${JSON.stringify(dockerLog)}
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
    if [ "${opts.runtimeExecFails ? "1" : "0"}" = "1" ] && [ "$count" -eq 3 ]; then
      echo 'required utility unavailable' >&2
      exit 1
    fi
    all="$*"
    case "$all" in
      *"id -u; id -g"*)
        printf '%s\n%s\n%s\n%s\n' ${JSON.stringify(runtimeUid)} ${JSON.stringify(HOST_GID)} ${JSON.stringify(runtimeUid)} ${JSON.stringify(HOST_GID)}
        exit 0
        ;;
      *"stat -c %u:%g"*)
        printf '%s\n' ${JSON.stringify(markerOwner)}
        exit 0
        ;;
      *"oh harness list --defaults --json"*)
        cat <<'JSON'
${
  opts.noDefaultHarnesses
    ? "[]"
    : `[
  { "id": "claude-code", "title": "Claude Code", "binary": "claude", "kind": "default", "enabled": null, "installed": true, "docs": "x" },
  { "id": "pi", "title": "Pi", "binary": "pi", "kind": "default", "enabled": null, "installed": true, "docs": "x" }
]`
}
JSON
        exit 0
        ;;
      *"oh tool list --defaults --json"*)
        cat <<'JSON'
${
  opts.noDefaultTools
    ? "[]"
    : `[
  { "id": "herdr", "title": "Herdr", "binary": "herdr", "kind": "default", "enabled": null, "installed": true, "docs": "x" },
  { "id": "cloudflared", "title": "cloudflared", "binary": "cloudflared", "kind": "default", "enabled": null, "installed": true, "docs": "x" }
]`
}
JSON
        exit 0
        ;;
      *"type -P"*)
        if [ "${opts.harnessProbeFails ? "1" : "0"}" = "1" ]; then
          echo 'is not on PATH under /home/sandbox/.local (type -P gave: /usr/bin/claude)' >&2
          exit 1
        fi
        printf '1.2.3\n'
        exit 0
        ;;
      *"id -u sandbox"*)
        printf '%s\n' ${JSON.stringify(runtimeUid)}
        exit 0
        ;;
    esac
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

  return { dir, bin, compose, composeLog, dockerLog };
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
    const dockerCalls = readFileSync(fx.dockerLog, "utf8");
    expect(dockerCalls).toContain("exec -u sandbox cid-123 sh -lc");
    expect(dockerCalls).toContain("command -v lsof");
    expect(dockerCalls).toContain("lsof -v");
    expect(dockerCalls).toContain("command -v htop");
    expect(dockerCalls).toContain("htop --version");
    expect(dockerCalls).toContain("command -v telnet");
    expect(dockerCalls).toContain("telnet --version");
    expect(dockerCalls).toContain("id -u; id -g");
    expect(dockerCalls).toContain("stat -c %u:%g");
    expect(result.stdout).toContain(
      `sandbox user, bind mount, and sandbox-created files all resolve to ${HOST_UID}:${HOST_GID}`,
    );
    expect(dockerCalls).toContain("oh harness list --defaults --json");
    expect(dockerCalls).toContain("oh tool list --defaults --json");
    expect(dockerCalls).toContain("type -P");
    expect(result.stdout).toContain("claude-code provisioned at boot -> 1.2.3");
    expect(result.stdout).toContain("pi provisioned at boot -> 1.2.3");
    expect(result.stdout).toContain("herdr provisioned at boot -> 1.2.3");
    expect(result.stdout).toContain("cloudflared provisioned at boot -> 1.2.3");
  });

  // #904 deleted the image bake, so this assertion is the only thing standing
  // between a silently broken boot-time install and a green pipeline.
  it("fails when a default harness was not provisioned into the home mount", () => {
    const fx = fixture({ harnessProbeFails: true });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "default harness 'claude-code' was not provisioned into the home mount at boot",
    );
    expect(result.stderr).toContain("type -P gave: /usr/bin/claude");
    expect(readFileSync(fx.composeLog, "utf8")).toContain("down -v --remove-orphans");
  });

  it.each<[string, { noDefaultHarnesses?: boolean; noDefaultTools?: boolean }]>([
    ["harness", { noDefaultHarnesses: true }],
    ["tool", { noDefaultTools: true }],
  ])("refuses to pass vacuously when the %s catalog reports no defaults", (noun, overrides) => {
    const fx = fixture(overrides);

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`the ${noun} catalog reported no kind:"default" entries`);
  });

  it("fails when the runtime sandbox user does not match the checkout owner", () => {
    const fx = fixture({ runtimeUid: String(Number(HOST_UID) + 1) });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("but the host checkout owner is");
    expect(readFileSync(fx.composeLog, "utf8")).toContain("down -v --remove-orphans");
  });

  it("fails when a sandbox-created file is not host-compatible", () => {
    const fx = fixture({ markerOwner: "0:0" });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("a sandbox-created file is owned by 0:0");
    expect(readFileSync(fx.composeLog, "utf8")).toContain("down -v --remove-orphans");
  });

  it("diagnoses a failed sandbox-user runtime assertion and tears down", () => {
    const fx = fixture({ runtimeExecFails: true });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "required utilities, Herdr runtime, or writable state is unavailable",
    );
    expect(result.stderr).toContain("--- docker compose ps");
    expect(result.stderr).toContain("--- container health inspect (cid-123)");
    expect(result.stderr).toContain("entrypoint log tail");
    const composeCalls = readFileSync(fx.composeLog, "utf8");
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
