import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "sandbox-boot-smoke.sh");
const PREFIX = "/home/sandbox/.local";

const HOST_UID = String(process.getuid?.() ?? 0);
const HOST_GID = String(process.getgid?.() ?? 0);

function fixture(
  opts: {
    dockerExecAlwaysFails?: boolean;
    runtimeExecFails?: boolean;
    runtimeUid?: string;
    markerOwner?: string;
    binaryPresent?: boolean;
    installedAtBoot?: boolean;
    noInstallableHarnesses?: boolean;
    noInstallableTools?: boolean;
  } = {},
) {
  const runtimeUid = opts.runtimeUid ?? HOST_UID;
  const markerOwner = opts.markerOwner ?? `${HOST_UID}:${HOST_GID}`;
  const installed = opts.installedAtBoot ? "true" : "false";
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
      *"oh harness list --json"*)
        cat <<'JSON'
${
  opts.noInstallableHarnesses
    ? `[
  { "id": "t3code", "title": "T3 Code", "binary": "t3", "kind": "on-demand", "installed": true, "docs": "x" }
]`
    : `[
  { "id": "claude-code", "title": "Claude Code", "binary": "claude", "kind": "installable", "installed": ${installed}, "docs": "x" },
  { "id": "pi", "title": "Pi", "binary": "pi", "kind": "installable", "installed": false, "docs": "x" },
  { "id": "t3code", "title": "T3 Code", "binary": "t3", "kind": "on-demand", "installed": true, "docs": "x" }
]`
}
JSON
        exit 0
        ;;
      *"oh tool list --json"*)
        cat <<'JSON'
${
  opts.noInstallableTools
    ? `[
  { "id": "gh", "title": "GitHub CLI", "binary": "gh", "kind": "baked-in", "installed": true, "docs": "x" }
]`
    : `[
  { "id": "herdr", "title": "Herdr", "binary": "herdr", "kind": "installable", "installed": false, "docs": "x" },
  { "id": "cloudflared", "title": "cloudflared", "binary": "cloudflared", "kind": "installable", "installed": false, "docs": "x" },
  { "id": "gh", "title": "GitHub CLI", "binary": "gh", "kind": "baked-in", "installed": true, "docs": "x" }
]`
}
JSON
        exit 0
        ;;
      *"type -P"*)
        if [ "${opts.binaryPresent ? "1" : "0"}" = "1" ]; then
          echo '${PREFIX}/bin/claude exists' >&2
          exit 1
        fi
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
      NPM_USER_PREFIX: PREFIX,
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
    expect(dockerCalls).toContain("oh harness list --json");
    expect(dockerCalls).toContain("oh tool list --json");
    expect(result.stdout).toContain(`claude-code not installed at boot (claude absent from ${PREFIX})`);
    expect(result.stdout).toContain(`pi not installed at boot (pi absent from ${PREFIX})`);
    expect(result.stdout).toContain(`herdr not installed at boot (herdr absent from ${PREFIX})`);
    expect(result.stdout).toContain(`cloudflared not installed at boot (cloudflared absent from ${PREFIX})`);
    expect(result.stdout).toContain("installed no harness or tool at boot");
  });

  it("ignores on-demand harnesses and baked-in tools, which install nowhere", () => {
    const result = runSmoke(fixture());

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("t3code");
    expect(result.stdout).not.toContain("gh not installed at boot");
  });

  it("fails when an installable entry reports itself installed after a fresh boot", () => {
    const fx = fixture({ installedAtBoot: true });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "installable harness 'claude-code' reports installed=true on a fresh boot",
    );
    expect(readFileSync(fx.composeLog, "utf8")).toContain("down -v --remove-orphans");
  });

  it("fails when an installable binary is present under the install prefix after boot", () => {
    const fx = fixture({ binaryPresent: true });

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `installable harness 'claude-code' left a binary under ${PREFIX} on a fresh boot`,
    );
    expect(result.stderr).toContain(`${PREFIX}/bin/claude exists`);
    expect(readFileSync(fx.composeLog, "utf8")).toContain("down -v --remove-orphans");
  });

  it.each<[string, { noInstallableHarnesses?: boolean; noInstallableTools?: boolean }]>([
    ["harness", { noInstallableHarnesses: true }],
    ["tool", { noInstallableTools: true }],
  ])("refuses to pass vacuously when the %s catalog has no installable entry", (noun, overrides) => {
    const fx = fixture(overrides);

    const result = runSmoke(fx);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`the ${noun} catalog reported no kind:"installable" entries`);
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
