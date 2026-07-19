import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepoFile = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

describe("default Herdr integration", () => {
  it("installs and verifies Herdr in the default image", () => {
    const dockerfile = readRepoFile(".devcontainer/Dockerfile");

    expect(dockerfile).toContain("https://herdr.dev/install.sh");
    expect(dockerfile).toContain("HERDR_INSTALL_DIR=/usr/local/bin");
    expect(dockerfile).toContain("herdr --version");
  });

  it.each(["docker-compose.yml", "docker-compose.image-only.yml"])(
    "persists Herdr state in %s",
    (composeFile) => {
      const compose = readRepoFile(`.devcontainer/${composeFile}`);

      expect(compose).toContain("herdr-data:/home/sandbox/.herdr");
      expect(compose).toContain("config-dir:/home/sandbox/.config");
      expect(compose).not.toContain("/home/sandbox/.config/herdr");
      expect(compose).not.toContain("/home/sandbox/.config/gh");
      expect(compose).toMatch(/^  herdr-data:$/m);
      expect(compose).toMatch(/^  config-dir:$/m);
    },
  );

  it("repairs ownership for Herdr volumes after UID sync", () => {
    const entrypoint = readRepoFile(".devcontainer/entrypoint.sh");

    expect(entrypoint).toContain(".herdr");
    expect(entrypoint).toMatch(/for dir in .* \.config /);
  });
});
