import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

  it("vendors the official agent-control skill with pinned provenance", () => {
    const skill = readRepoFile(".oh/skills/herdr/SKILL.md");
    const upstream = readRepoFile(".oh/skills/herdr/UPSTREAM.md");
    const upstreamLicense = readRepoFile(".oh/skills/herdr/LICENSE.upstream");
    const lock = readRepoFile(".oh/skills.lock");
    const checksum = createHash("sha256").update(skill).digest("hex");

    expect(checksum).toBe("04b5f99c3c3178d8a7d194be2fbe99796852a8fbd7739346213d15242723ebb9");
    expect(skill).toContain("Requires HERDR_ENV=1");
    expect(skill).toContain("Do not inspect or control the focused Herdr session from outside Herdr");
    expect(upstream).toContain("v0.7.4/SKILL.md");
    expect(upstream).toContain("AGPL-3.0-or-later");
    expect(upstreamLicense).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(lock).toContain('"source": "github:ogulcancelik/herdr"');
    expect(lock).not.toContain("npx skills add ogulcancelik/herdr");
  });

  it.each(["docker-compose.yml", "docker-compose.image-only.yml"])(
    "persists Herdr state and wires integration control in %s",
    (composeFile) => {
      const compose = readRepoFile(`.devcontainer/${composeFile}`);

      expect(compose).toContain("herdr-data:/home/sandbox/.herdr");
      expect(compose).toContain("config-dir:/home/sandbox/.config");
      expect(compose).not.toContain("/home/sandbox/.config/herdr");
      expect(compose).not.toContain("/home/sandbox/.config/gh");
      expect(compose).toMatch(/^  herdr-data:$/m);
      expect(compose).toMatch(/^  config-dir:$/m);
      expect(compose).toContain("HERDR_AUTO_INTEGRATIONS=${HERDR_AUTO_INTEGRATIONS:-true}");
    },
  );

  it("repairs ownership for Herdr volumes after UID sync", () => {
    const entrypoint = readRepoFile(".devcontainer/entrypoint.sh");

    expect(entrypoint).toContain(".herdr");
    expect(entrypoint).toMatch(/for dir in .* \.config /);
  });

  it("makes Herdr the first interactive action in canonical onboarding", () => {
    const readme = readRepoFile("README.md");
    const quickstart = readRepoFile(".oh/docs/quickstart.md");
    const agents = readRepoFile("AGENTS.md");
    const contributing = readRepoFile(".oh/docs/contributing.md");
    const intro = readRepoFile(".oh/docs/intro.md");
    const harnessOverview = readRepoFile(".oh/docs/harnesses/overview.md");
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

  it("reconciles only official supported-agent integrations at runtime", () => {
    const entrypoint = readRepoFile(".devcontainer/entrypoint.sh");
    const reconciler = readRepoFile(".oh/scripts/reconcile-herdr-integrations.sh");
    const harnessConfig = readRepoFile(".oh/scripts/harness-config.sh");
    const harnessExample = readRepoFile("harness.yaml.example");

    expect(entrypoint).toContain("reconcile-herdr-integrations.sh");
    expect(reconciler).toContain("HERDR_AUTO_INTEGRATIONS");
    for (const target of ["claude", "codex", "pi", "opencode", "hermes"]) {
      expect(reconciler).toContain(`install_integration ${target}`);
    }
    expect(reconciler).not.toMatch(/curl|wget|npx|herdr update/);
    expect(reconciler).toContain('mktemp -d "${TMPDIR:-/tmp}/herdr-integrations.XXXXXX"');
    expect(reconciler).not.toContain('/tmp/herdr-integration-"$target".log');
    expect(reconciler).not.toMatch(/install_integration (grok|deepagents)/);
    expect(harnessConfig).toContain('envmap["herdr.auto_integrations"] = "HERDR_AUTO_INTEGRATIONS"');
    expect(harnessExample).toContain("auto_integrations: true");
  });

  it("documents correct state, configuration, integrations, and direct-image persistence", () => {
    const herdrDocs = readRepoFile(".oh/docs/integrations/herdr.md");
    const imageDocs = readRepoFile(".oh/docs/deployment-prebuilt-image.md");

    expect(herdrDocs).toContain("~/.config/herdr");
    expect(herdrDocs).toContain("~/.herdr/worktrees");
    expect(herdrDocs).not.toContain("herdr update");
    expect(herdrDocs).toContain("HERDR_AUTO_INTEGRATIONS=false");
    expect(herdrDocs).toContain("~/.config/herdr/config.toml");
    expect(herdrDocs).toContain("herdr --default-config");
    expect(herdrDocs).toContain("herdr integration status");
    expect(imageDocs).toContain("herdr-data:/home/sandbox/.herdr");
  });
});
