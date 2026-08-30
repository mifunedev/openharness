import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepoFile = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

describe("default Herdr integration", () => {
  it("pins and verifies Herdr for both supported architectures", () => {
    const dockerfile = readRepoFile(".devcontainer/Dockerfile");

    expect(dockerfile).toContain("HERDR_VERSION=0.7.4");
    expect(dockerfile).toContain("bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059");
    expect(dockerfile).toContain("544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2");
    expect(dockerfile).toContain("sha256sum -c -");
    expect(dockerfile).toContain('test "$(herdr --version)" = "herdr ${HERDR_VERSION}"');
  });

  it.each(["docker-compose.yml", "docker-compose.image-only.yml"])(
    "persists Herdr state in %s",
    (composeFile) => {
      const compose = readRepoFile(`.devcontainer/${composeFile}`);

      expect(compose).toContain("${OH_HOME_MOUNT:-workspace}:/home/sandbox");
      expect(compose).not.toContain("/home/sandbox/.herdr");
      expect(compose).not.toContain("/home/sandbox/.config");
      expect(compose).toMatch(/^  workspace:$/m);
    },
  );

  it("repairs ownership for Herdr state after UID sync", () => {
    const entrypoint = readRepoFile(".devcontainer/entrypoint.sh");

    expect(entrypoint).toContain('find /home/sandbox -path "$OH_PROJECT_ROOT" -prune -o');
    expect(entrypoint).toContain('-exec chown -h "$owner" {} +');
  });

  it("makes Herdr the first interactive action in canonical onboarding", () => {
    const readme = readRepoFile("README.md");
    const quickstart = readRepoFile("docs/quickstart.md");
    const agents = readRepoFile("AGENTS.md");
    const contributing = readRepoFile("docs/contributing.md");
    const intro = readRepoFile("docs/intro.md");
    const harnessOverview = readRepoFile("docs/harnesses/overview.md");
    const zshrc = readRepoFile(".oh/install/.zshrc");

    expect(readme.indexOf("\nherdr\n")).toBeGreaterThan(-1);
    expect(readme.indexOf("\nherdr\n")).toBeLessThan(readme.indexOf("gh auth login"));
    expect(quickstart.indexOf("## Start Herdr first")).toBeLessThan(quickstart.indexOf("gh auth login"));
    expect(agents.indexOf("Start the primary interactive workspace")).toBeLessThan(agents.indexOf("gh auth login"));
    expect(contributing.indexOf("\nherdr\n")).toBeLessThan(contributing.indexOf("gh auth login"));
    expect(intro).toContain("then run `herdr` first");
    expect(harnessOverview).toContain("run `herdr` first");
    expect(zshrc).toContain(".oh/install/banner.sh");
  });

  it("documents correct state and direct-image persistence", () => {
    const herdrDocs = readRepoFile("docs/integrations/herdr.md");
    const imageDocs = readRepoFile("docs/deployment-prebuilt-image.md");

    expect(herdrDocs).toContain("~/.config/herdr");
    expect(herdrDocs).toContain("~/.herdr/worktrees");
    expect(herdrDocs).not.toContain("herdr update");
    expect(imageDocs).toContain("herdr-data:/home/sandbox/.herdr");
  });
});
