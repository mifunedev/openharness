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

// Comments may legitimately name a harness package; only instructions may not.
const DOCKERFILE_CODE = DOCKERFILE.split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

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

  // #908: the INSTALL_* build args are gone. The catalog no longer mirrors the
  // Dockerfile — it replaces it, and `oh harness install` is the only path.
  describe("owns the install, and the image no longer does", () => {
    const optional = HARNESS_CATALOG.filter((h) => h.kind === "optional");

    it("covers all four optional harnesses", () => {
      expect(optional.map((h) => h.id).sort()).toEqual([
        "grok-build",
        "hermes",
        "opencode",
      ]);
    });

    it("declares no buildArg anywhere — the field itself is gone", () => {
      expect(read(".oh/cli/src/lib/harnesses/catalog.ts")).not.toContain("buildArg");
    });

    it.each(optional.map((h) => [h.id, h] as const))(
      "%s: its INSTALL_* build arg is absent from the Dockerfile",
      (_id, h) => {
        const arg = `INSTALL_${(h.harnessKey as string).toUpperCase()}`;
        expect(DOCKERFILE).not.toMatch(new RegExp(`^ARG ${arg}`, "m"));
        expect(COMPOSE_YML).not.toContain(`${arg}: \${${arg}:-false}`);
      },
    );

    it.each(optional.map((h) => [h.id, h] as const))(
      "%s: installs as the sandbox user into the home mount",
      (_id, h) => {
        expect(h.installUser).toBe("sandbox");
        expect(h.installArgv.join("\n")).toMatch(/\/home\/sandbox\/\.local|\$HOME\/\.local|uv/);
      },
    );

    it.each(optional.map((h) => [h.id, h] as const))(
      "%s: its oh.json key stays documented in docs/configuration.md",
      (_id, h) => {
        const arg = `INSTALL_${(h.harnessKey as string).toUpperCase()}`;
        expect(CONFIG_DOC).toMatch(
          new RegExp(`^\\| \`install\\.[A-Za-z]+\` \\|.*\`${arg}\``, "m"),
        );
      },
    );

    it("keeps the grok-build pin in the catalog, now that the Dockerfile has none", () => {
      const grok = findHarness("grok-build");
      expect(versionPins(grok!.installArgv)).toEqual(["0.2.39"]);
      expect(DOCKERFILE).not.toContain("bash -s 0.2.39");
    });

    // INSTALL_HERMES survives as a RUNTIME flag: link-providers.sh vendors the
    // Hermes skill pack from it and entrypoint.sh wires auth.json. Only its
    // build-arg role is gone.
    it("keeps INSTALL_HERMES as a container environment variable", () => {
      expect(COMPOSE_YML).toContain("- INSTALL_HERMES=${INSTALL_HERMES:-false}");
      expect(DOCKERFILE).not.toContain("INSTALL_HERMES");
    });

    it("installs every harness as the sandbox user, never root", () => {
      for (const h of HARNESS_CATALOG) {
        expect(h.installUser, h.id).toBe("sandbox");
      }
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

    it("provisions the default harnesses at boot rather than baking them", () => {
      expect(ENTRYPOINT).toContain("OH_PROVISION_DEFAULTS");
      expect(ENTRYPOINT).toContain(".oh/scripts/provision-defaults.sh");
    });

    it.each(defaults.map((h) => [h.id, h] as const))(
      "%s: its npm package is absent from the Dockerfile",
      (id, h) => {
        const pkg = h.installArgv[h.installArgv.length - 1];
        expect(pkg, `${id} declares no install package`).toMatch(/^(@[^/]+\/)?[^-].*/);
        expect(
          DOCKERFILE_CODE,
          `${id} is baked into the image; it belongs to provision-defaults.sh`,
        ).not.toContain(pkg);
      },
    );

    it("keeps no build arg that could re-bake the default harnesses", () => {
      expect(DOCKERFILE_CODE).not.toMatch(/^ARG (BAKE_HARNESSES|AGENTS)=/m);
    });

    it("bounds the boot-path provisioner so an unreachable registry cannot stall the entrypoint", () => {
      expect(ENTRYPOINT).toMatch(
        /timeout "\$\{OH_PROVISION_DEFAULTS_TIMEOUT:-\d+\}" bash "\$HARNESS\/\.oh\/scripts\/provision-defaults\.sh"/,
      );
      expect(ENTRYPOINT).toContain("WARNING: default provisioning did not complete");
    });
  });

  it("findHarness resolves known ids and rejects unknown ones", () => {
    expect(findHarness("opencode")?.harnessKey).toBe("opencode");
    expect(findHarness("grok-build")?.harnessKey).toBe("grok_build");
    expect(findHarness("nope")).toBeUndefined();
  });
});
