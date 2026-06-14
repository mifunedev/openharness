import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const ENTRYPOINT = join(ROOT, ".devcontainer/entrypoint.sh");

function entrypoint(): string {
  return readFileSync(ENTRYPOINT, "utf8");
}

describe("devcontainer entrypoint cron supervision", () => {
  it("starts a cron-watchdog session that supervises cron-system", () => {
    const text = entrypoint();

    expect(text).toContain("cron-watchdog");
    expect(text).toContain("cron-system missing; starting cron-runtime.ts");
    expect(text).toContain("tmux new-session -d -s cron-system");
    expect(text).toContain("node --experimental-strip-types scripts/cron-runtime.ts");
    expect(text).toContain("/tmp/cron-system.log");
    expect(text).toContain("/tmp/cron-watchdog.log");
  });

  it("preserves the legacy system-cron migration guard", () => {
    const text = entrypoint();

    expect(text).toContain("tmux has-session -t system-cron");
    expect(text).toContain("not starting cron-system or cron-watchdog");
    expect(text).toContain("legacy system-cron detected; watchdog exiting");
  });
});
