import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

function entrypoint(): string {
  return readFileSync(ENTRYPOINT, "utf8");
}

describe("devcontainer entrypoint auth volume ownership", () => {
  it("repairs auth mounts with the sandbox user's current numeric uid/gid", () => {
    const text = entrypoint();

    expect(text).toContain("sandbox_ownership()");
    expect(text).toContain('$(id -u sandbox)');
    expect(text).toContain('$(id -g sandbox)');
    expect(text).toContain('owner="$(sandbox_ownership)"');
    expect(text).toContain('chown -hR "$owner" "/home/sandbox/$dir"');
    expect(text).toContain(".local/share/opencode");
    expect(text).toContain("/home/sandbox/.hermes");
    expect(text).toContain("Do not recurse\n  # into $HERMES_HOME when it points at the bind-mounted checkout");
  });

  it("runs auth mount repair before and after host UID reconciliation", () => {
    const text = entrypoint();
    const firstRepair = text.indexOf("repair_home_mount_ownership\n\n# ─── Host UID reconciliation");
    const uidSync = text.indexOf("usermod -u \"$HOST_UID\" sandbox");
    const secondRepair = text.indexOf("# UID/GID reconciliation can change");

    expect(firstRepair).toBeGreaterThan(-1);
    expect(uidSync).toBeGreaterThan(firstRepair);
    expect(secondRepair).toBeGreaterThan(uidSync);
    const postUidSync = text.slice(secondRepair);
    const secondRepairCall = postUidSync.indexOf("repair_home_mount_ownership");
    const linkProviders = postUidSync.indexOf('bash "$HARNESS/.oh/scripts/link-providers.sh" --init');
    const hermesBlock = postUidSync.indexOf("# Hermes keeps all runtime state");
    expect(secondRepairCall).toBeGreaterThan(-1);
    expect(linkProviders).toBeGreaterThan(secondRepairCall);
    expect(hermesBlock).toBeGreaterThan(linkProviders);
  });

  it("does not swallow host UID reconciliation failures", () => {
    const text = entrypoint();
    const block = text.slice(
      text.indexOf("# ─── Host UID reconciliation"),
      text.indexOf("# UID/GID reconciliation can change"),
    );

    expect(block).toContain("uid_reconcile_step()");
    expect(block).toContain("WARNING: failed to");
    // Scope the "no swallowed failures" guard to the host-reconciliation
    // branch itself. The sibling `OH_IMAGE_ONLY` (no-bind) branch legitimately
    // best-efforts a volume chown with `2>/dev/null || true`; it is not host
    // UID reconciliation (it deliberately skips it), so it is excluded here.
    const reconBranch = block.slice(block.indexOf('elif [ -d "$HARNESS_DIR" ]'));
    expect(reconBranch).not.toContain("2>/dev/null || true");
    expect(reconBranch).not.toContain("groupmod -g \"$HOST_GID\" sandbox 2>/dev/null");
    expect(reconBranch).not.toContain("usermod -u \"$HOST_UID\" sandbox 2>/dev/null");
  });

  it("prints UID sync success only after reconciliation commands report success", () => {
    const text = entrypoint();
    const block = text.slice(
      text.indexOf("# ─── Host UID reconciliation"),
      text.indexOf("# UID/GID reconciliation can change"),
    );
    const usermod = block.indexOf("uid_reconcile_step \"set sandbox UID to host UID $HOST_UID\" usermod -u \"$HOST_UID\" sandbox");
    const chown = block.indexOf("uid_reconcile_step \"repair sandbox-owned files after UID/GID sync\" find /home/sandbox");
    const success = block.indexOf("sandbox UID synced to host");
    const incomplete = block.indexOf("sandbox UID/GID reconciliation incomplete");

    expect(usermod).toBeGreaterThan(-1);
    expect(chown).toBeGreaterThan(usermod);
    expect(success).toBeGreaterThan(chown);
    expect(incomplete).toBeGreaterThan(success);
    expect(block).toContain("if [ \"$UID_GID_SYNC_OK\" = \"true\" ]; then");
  });
});

describe("devcontainer entrypoint Slack restore (delegates to gateway.sh)", () => {
  it("exposes the bare `gateway` command via a live (idempotent) symlink", () => {
    expect(entrypoint()).toContain(
      'ln -sf "$HARNESS/.oh/scripts/gateway.sh" /usr/local/bin/gateway',
    );
  });

  it("gates on both Slack tokens + pi, then hands off to gateway.sh pi (one launch path)", () => {
    const text = entrypoint();
    expect(text).toContain("client-slack-pi");
    expect(text).toMatch(/grep -qE '\^PI_SLACK_APP_TOKEN=\.'/);
    expect(text).toMatch(/grep -qE '\^PI_SLACK_BOT_TOKEN=\.'/);
    expect(text).toContain(".oh/scripts/gateway.sh pi");
  });

  it("reads token presence with grep — never sources the Compose env file", () => {
    const text = entrypoint();
    expect(text).not.toContain("source $SLACK_ENV");
    expect(text).not.toContain("set -a; source");
  });

  it("no longer extracts tokens inline (that logic moved into gateway.sh)", () => {
    const text = entrypoint();
    expect(text).not.toContain("SLACK_RUNTIME_ENV=$(mktemp");
    expect(text).not.toContain("shell_quote");
  });
});

describe("client-slack bridge supervisor", () => {
  const SUPERVISOR = join(ROOT, ".devcontainer/client-slack-supervise.sh");

  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", SUPERVISOR]);
  });

  it("restarts pi on stale-ctx and crash, clears the lock, stops on a clean exit", () => {
    const text = readFileSync(SUPERVISOR, "utf8");
    // Detects the pi "extension ctx is stale" failure and kills the bridge pi
    // (matched by its unique --extension path) so the loop relaunches it fresh.
    expect(text).toContain("ctx is stale");
    expect(text).toContain("pkill -f 'pi-messenger-bridge/dist/index.js'");
    // pi runs interactive on the pane TTY: no `| tee` pipe and no --mode rpc, so
    // the loaded UI extensions render instead of flooding stdout with JSON. A 2nd
    // --extension co-loads the Codex retry-recovery extension. Assert on the pi
    // command line itself so comment wording can't satisfy the negatives.
    const piLine = text.split("\n").find((l) => /^\s*pi --extension/.test(l)) ?? "";
    expect(piLine).toContain("--approve");
    expect(piLine).toContain('--extension "$RECOVERY_ENTRY"');
    expect(piLine).not.toContain("--mode rpc");
    expect(piLine).not.toContain("tee");
    expect(piLine).toContain('2>>"$LOG"');
    expect(text).toContain("bridge-recovery");
    expect(text).toContain("rc=$?");
    // Clears the single-instance lock before each (re)launch.
    expect(text).toContain('rm -f "$LOCK"');
    // A clean pi exit (rc=0) breaks the loop; anything else restarts.
    expect(text).toMatch(/\$rc"?\s+-eq\s+0/);
    expect(text).toContain("break");
    expect(text).toContain("restarting in 3s");
  });

  it("is referenced by gateway.sh, which the entrypoint delegates to", () => {
    const gateway = readFileSync(join(ROOT, ".oh/scripts/gateway.sh"), "utf8");
    expect(gateway).toContain(".devcontainer/client-slack-supervise.sh");
    // The entrypoint no longer launches the supervisor directly — it hands off.
    expect(entrypoint()).toContain(".oh/scripts/gateway.sh pi");
  });
});

describe("devcontainer entrypoint cron supervision", () => {
  it("starts a cron-watchdog session that supervises cron-system", () => {
    const text = entrypoint();

    expect(text).toContain("cron-watchdog");
    expect(text).toContain("cron-system missing; starting cron-runtime.ts");
    expect(text).toContain("tmux new-session -d -s cron-system");
    expect(text).toContain("node --experimental-strip-types .oh/scripts/cron-runtime.ts");
    expect(text).toContain("/tmp/cron-system.log");
    expect(text).toContain("/tmp/cron-watchdog.log");
  });

  it("reaps stale legacy system-cron instead of blocking modern cron supervision", () => {
    const text = entrypoint();

    expect(text).toContain("tmux has-session -t system-cron");
    expect(text).toContain("legacy system-cron tmux session detected — stopping it before starting cron-watchdog");
    expect(text).not.toContain("not starting cron-system or cron-watchdog");
    expect(text).toContain("legacy system-cron detected; stopping it before supervising cron-system");
    expect(text).not.toContain("watchdog exiting");
  });
});

describe("msg-bridge seed/merge (seed-msg-bridge.sh)", () => {
  const SEED_SCRIPT = join(ROOT, ".devcontainer/seed-msg-bridge.sh");

  function runSeed(seedJson: unknown, runtimeJson?: string): unknown {
    const home = mkdtempSync(join(tmpdir(), "seed-msg-bridge-"));
    const seed = join(home, "seed.json");
    writeFileSync(seed, JSON.stringify(seedJson));
    const dest = join(home, ".pi/msg-bridge.json");
    if (runtimeJson !== undefined) {
      mkdirSync(join(home, ".pi"), { recursive: true });
      writeFileSync(dest, runtimeJson);
    }
    execFileSync("bash", [SEED_SCRIPT, seed], { env: { ...process.env, HOME: home } });
    return { dest, raw: readFileSync(dest, "utf8") };
  }

  it("parses as valid bash", () => {
    execFileSync("bash", ["-n", SEED_SCRIPT]);
  });

  it("installs the tracked seed verbatim on first boot", () => {
    const { raw } = runSeed({ autoConnect: true, showWidget: true, auth: { trustedUsers: [] } }) as {
      raw: string;
    };
    const dest = JSON.parse(raw);
    expect(dest.showWidget).toBe(true);
    expect(dest.auth.trustedUsers).toEqual([]);
  });

  it("preserves operator grants on reboot while adopting non-grant seed structure", () => {
    // Tracked seed ships EMPTY grants but a NEW non-grant field (showWidget).
    // The package-written runtime file holds the operator's real grants.
    const { raw } = runSeed(
      { autoConnect: true, showWidget: true, auth: { trustedUsers: [] } },
      JSON.stringify({
        autoConnect: false,
        auth: {
          trustedUsers: ["slack:UOPERATOR"],
          channels: { CCHANNEL: { enabled: true } },
        },
      }),
    ) as { raw: string };
    const merged = JSON.parse(raw);
    // A restart must NOT wipe the operator's trust (bug #289).
    expect(merged.auth.trustedUsers).toEqual(["slack:UOPERATOR"]);
    expect(merged.auth.channels).toHaveProperty("CCHANNEL");
    // Non-grant structure is adopted from the tracked seed.
    expect(merged.showWidget).toBe(true);
  });

  it("leaves a malformed runtime file untouched (never clobbers on jq failure)", () => {
    const malformed = "{ not valid json ";
    const { raw } = runSeed({ autoConnect: true, auth: { trustedUsers: [] } }, malformed) as {
      raw: string;
    };
    // jq fails → the existing runtime file is preserved, never overwritten by the seed.
    expect(raw).toBe(malformed);
  });
});
