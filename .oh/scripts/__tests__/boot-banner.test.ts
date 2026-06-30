import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

function readRepoFile(...parts: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...parts), "utf-8");
}

function firstBootBlock(entrypoint: string): string {
  const match = entrypoint.match(
    /# First-boot message if onboarding not complete[\s\S]*?\nfi\n/,
  );
  expect(match, "first-boot banner block should be present").not.toBeNull();
  return match?.[0] ?? "";
}

function ohStatusBlock(banner: string): string {
  const match = banner.match(/# oh CLI[\s\S]*?printf '    %-6s %-11s %s\\n' "\$oh_status"[^\n]+/);
  expect(match, "oh CLI status block should be present").not.toBeNull();
  return match?.[0] ?? "";
}

describe("boot banners", () => {
  it("first-boot entrypoint banner points at the Slack bridge setup docs", () => {
    const block = firstBootBlock(readRepoFile(".oh", "devcontainer", "entrypoint.sh"));

    expect(block).toContain(".oh/docs/integrations/slack.md");
    expect(block).toContain("Optional Slack bridge setup");
    expect(block).toContain("Start an agent from this shell");
    expect(block).not.toContain("openharness onboard");
    expect(block).not.toContain("Complete setup");
    // The `oh config slack` wizard was removed with the pi-messenger-bridge
    // swap (#481/#287); the banner must not advertise a command that errors.
    expect(block).not.toContain("oh config slack");
  });

  it("interactive shell banner checks and labels the installed oh CLI", () => {
    const block = ohStatusBlock(readRepoFile(".oh", "install", "banner.sh"));

    expect(block).toContain("command -v oh");
    expect(block).toContain("oh --version");
    expect(block).toContain('"oh"');
    expect(block).not.toContain("command -v openharness");
    expect(block).not.toContain("openharness --version");
    expect(block).not.toContain('"openharness"');
  });
});
