import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  findHarness,
  harnessIds,
  HARNESS_CATALOG,
} from "../lib/harnesses/catalog.js";


const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

const DOCKERFILE = read(".devcontainer/Dockerfile");
const COMPOSE_YML = read(".devcontainer/docker-compose.yml");
const CONFIG_DOC = read("docs/configuration.md");
const ENTRYPOINT = read(".devcontainer/entrypoint.sh");
const NPM_USER_PREFIX = "/home/sandbox/.local";

function versionPins(argv: readonly string[]): string[] {
  const pins = new Set<string>();
  for (const part of argv) {
    for (const m of part.matchAll(/\b\d+\.\d+\.\d+\b/g)) pins.add(m[0]);
  }
  return [...pins];
}

describe("harness catalog", () => {
  it("has unique ids and no empty argv", () => {
    expect(new Set(harnessIds()).size).toBe(HARNESS_CATALOG.length);
    for (const h of HARNESS_CATALOG) {
      expect(h.installArgv.length).toBeGreaterThan(0);
      expect(h.verifyArgv.length).toBeGreaterThan(0);
      expect(h.binary).not.toBe("");
    }
  });

  it("pairs harnessKey and buildArg — never one without the other", () => {
    for (const h of HARNESS_CATALOG) {
      expect(Boolean(h.harnessKey)).toBe(Boolean(h.buildArg));
    }
  });

  it("gives every optional harness a flag, and no other kind one", () => {
    for (const h of HARNESS_CATALOG) {
      if (h.kind === "optional") expect(h.harnessKey).toBeDefined();
      else expect(h.harnessKey).toBeUndefined();
    }
  });

  it("excludes agent_browser — it shares the INSTALL_* namespace but is not a harness", () => {
    expect(HARNESS_CATALOG.some((h) => h.harnessKey === "agent_browser")).toBe(false);
    expect(CONFIG_DOC).toMatch(/^\| `install\.agentBrowser` \|.*`INSTALL_AGENT_BROWSER`/m);
  });

  it("documents every harness under docs/harnesses/<id>.md", () => {
    for (const h of HARNESS_CATALOG) {
      expect(h.docsPath).toBe(`docs/harnesses/${h.id}.md`);
      expect(() => read(h.docsPath)).not.toThrow();
    }
  });

  describe("does not drift from the image build", () => {
    const flagged = HARNESS_CATALOG.filter((h) => h.buildArg !== undefined);

    it("covers all four optional harnesses", () => {
      expect(flagged.map((h) => h.id).sort()).toEqual([
        "deepagents",
        "grok-build",
        "hermes",
        "opencode",
      ]);
    });

    it.each(flagged.map((h) => [h.id, h] as const))(
      "%s: build arg is in the Dockerfile",
      (_id, h) => {
        expect(DOCKERFILE).toContain(h.buildArg as string);
      },
    );

    it.each(flagged.map((h) => [h.id, h] as const))(
      "%s: the INSTALL_* key derived from harnessKey IS the build arg, and compose forwards it",
      (_id, h) => {
        expect(`INSTALL_${(h.harnessKey as string).toUpperCase()}`).toBe(h.buildArg);
        expect(COMPOSE_YML).toContain(`${h.buildArg}: \${${h.buildArg}:-false}`);
      },
    );

    it.each(flagged.map((h) => [h.id, h] as const))(
      "%s: key ships documented in docs/configuration.md, the oh.json field reference",
      (_id, h) => {
        expect(CONFIG_DOC).toMatch(
          new RegExp(`^\\| \`install\\.[A-Za-z]+\` \\|.*\`${h.buildArg}\``, "m"),
        );
      },
    );

    it.each(flagged.map((h) => [h.id, h] as const))(
      "%s: every pinned version appears verbatim in the Dockerfile",
      (_id, h) => {
        for (const pin of versionPins(h.installArgv)) {
          expect(DOCKERFILE).toContain(pin);
        }
      },
    );

    it("grok-build keeps the Dockerfile's exact pin", () => {
      const grok = findHarness("grok-build");
      expect(versionPins(grok!.installArgv)).toEqual(["0.2.39"]);
      expect(DOCKERFILE).toContain("bash -s 0.2.39");
    });

    it("installs deepagents and pi as the sandbox user, not root", () => {
      expect(findHarness("deepagents")!.installUser).toBe("sandbox");
      expect(findHarness("pi")!.installUser).toBe("sandbox");
      expect(DOCKERFILE).toContain("UV_TOOL_DIR=/home/sandbox");
    });
  });

  it("builds pipeline installers as constant argv, never interpolation", () => {
    for (const h of HARNESS_CATALOG) {
      if (h.installArgv[0] !== "bash") continue;
      expect(h.installArgv[1]).toBe("-lc");
      expect(h.installArgv[2]).not.toContain("${");
      expect(h.installArgv).toHaveLength(3);
    }
  });

  describe("default harnesses install into the home mount, not the image", () => {
    const defaults = HARNESS_CATALOG.filter((h) => h.kind === "default");

    it("covers claude-code, codex and pi", () => {
      expect(defaults.map((h) => h.id).sort()).toEqual(["claude-code", "codex", "pi"]);
    });

    it("declares NPM_USER_PREFIX as the prefix the catalog installs into", () => {
      expect(DOCKERFILE).toContain(`ENV NPM_USER_PREFIX="${NPM_USER_PREFIX}"`);
    });

    it.each(defaults.map((h) => [h.id, h] as const))(
      "%s: installs as the sandbox user into NPM_USER_PREFIX",
      (_id, h) => {
        expect(h.installUser).toBe("sandbox");
        expect(h.installArgv).toContain(NPM_USER_PREFIX);
      },
    );

    it("keeps claude-code's postinstall, which copies the native binary over the placeholder", () => {
      expect(findHarness("claude-code")!.installArgv).not.toContain("--ignore-scripts");
    });

    it("lets the image bake be turned off, and provisions the same harnesses at boot", () => {
      expect(DOCKERFILE).toMatch(/^ARG BAKE_HARNESSES=true$/m);
      expect(ENTRYPOINT).toContain("OH_PROVISION_HARNESSES");
      expect(ENTRYPOINT).toContain(".oh/scripts/provision-harnesses.sh");
    });
  });

  it("findHarness resolves known ids and rejects unknown ones", () => {
    expect(findHarness("opencode")?.harnessKey).toBe("opencode");
    expect(findHarness("grok-build")?.harnessKey).toBe("grok_build");
    expect(findHarness("nope")).toBeUndefined();
  });
});
