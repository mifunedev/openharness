import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
}

const onboardingDocs = [
  ["README", "README.md"],
  ["docs intro", "docs/intro.md"],
  ["quickstart", "docs/quickstart.md"],
  ["installation", "docs/installation.md"],
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

    expect(install).toContain("make (build-essential)");
    expect(install).toMatch(/command -v make/);
    expect(install).toContain("make not found");
  });

  it("refuses to overwrite a sandbox that already exists under the same name", () => {
    const install = readRepoFile(".oh", "scripts", "install.sh");

    expect(install).toContain("docker ps -a --format");
    expect(install).toContain('die "A sandbox named');
    expect(install).toContain("already exists");
    expect(install).toContain("OH_REPLACE");
  });

  it("offers optional agent installs (Hermes etc.) as INSTALL_* toggles", () => {
    const install = readRepoFile(".oh", "scripts", "install.sh");

    expect(install).toContain("_opt_install HERMES");
    expect(install).toContain("_opt_install AGENT_BROWSER");
    expect(install).toContain('prompt_yn "Install ');
    expect(install).toContain("INSTALL_");
  });
});
