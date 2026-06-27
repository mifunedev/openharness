import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ENTRYPOINT = path.join(REPO_ROOT, ".oh", "devcontainer", "entrypoint.sh");

const entrypoint = readFileSync(ENTRYPOINT, "utf-8");

describe("devcontainer entrypoint pnpm install", () => {
  it("keeps the explicit SKIP_PNPM_INSTALL opt-out", () => {
    expect(entrypoint).toContain("SKIP_PNPM_INSTALL=1");
    expect(entrypoint).toContain('${SKIP_PNPM_INSTALL:-0}');
  });

  it("fails boot instead of swallowing a required pnpm install error", () => {
    expect(entrypoint).toContain("pnpm install failed — see /tmp/pnpm-install.log; aborting sandbox boot");
    expect(entrypoint).toMatch(/pnpm install failed[\s\S]*exit 1/);
    expect(entrypoint).not.toContain("cron-runtime and Slack Pi extension will not load");
  });
});
