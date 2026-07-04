import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

const onboardingDocs = [
  ["README", "README.md"],
  ["docs intro", ".oh/docs/intro.md"],
  ["quickstart", ".oh/docs/quickstart.md"],
  ["installation", ".oh/docs/installation.md"],
] as const;

describe("installer host prerequisite docs", () => {
  it.each(onboardingDocs)("%s documents Docker and Git as host prerequisites", (_name, file) => {
    const text = readRepoFile(file);

    expect(text).toMatch(/Docker/i);
    expect(text).toMatch(/Git/i);
    expect(text).not.toMatch(/Only host dependency:\s*Docker/i);
    expect(text).not.toMatch(/only host dependency is \[?Docker/i);
    expect(text).not.toMatch(/Docker remains the only required host dependency/i);
  });

  it("installer help and missing-git diagnostic explain the Git prerequisite", () => {
    const install = readRepoFile(".oh", "scripts", "install.sh");

    expect(install).toContain("Docker with the Compose plugin");
    expect(install).toContain("git (used to clone or update Open Harness)");
    expect(install).toContain("git is required to clone or update Open Harness");
  });

  it("installer surfaces make as a soft (non-fatal) lifecycle prerequisite", () => {
    const install = readRepoFile(".oh", "scripts", "install.sh");

    // Help text lists make for the post-install lifecycle (make shell / destroy).
    expect(install).toContain("make (build-essential)");
    // Preflight checks for make...
    expect(install).toMatch(/command -v make/);
    // ...and warns rather than dies when it's absent.
    expect(install).toContain("make not found");
  });
});
