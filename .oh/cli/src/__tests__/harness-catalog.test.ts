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

  it("documents every harness under docs/harnesses/<id>.md", () => {
    for (const h of HARNESS_CATALOG) {
      expect(h.docsPath).toBe(`docs/harnesses/${h.id}.md`);
      expect(() => read(h.docsPath)).not.toThrow();
    }
  });

  // #948: the only kinds left are `installable` (the verb installs it) and
  // `on-demand` (the runner fetches it per invocation). Nothing is a default.
  describe("every entry is installable or on-demand", () => {
    const installable = HARNESS_CATALOG.filter((h) => h.kind === "installable");

    it("classifies each entry as one of exactly two kinds", () => {
      for (const h of HARNESS_CATALOG) {
        expect(["installable", "on-demand"], h.id).toContain(h.kind);
      }
      expect(installable.length).toBeGreaterThan(0);
    });

    it("covers every harness the verb can install", () => {
      expect(installable.map((h) => h.id).sort()).toEqual([
        "claude-code",
        "codex",
        "grok-build",
        "hermes",
        "muse-code",
        "opencode",
        "pi",
      ]);
    });

    it("leaves t3code the sole on-demand entry", () => {
      expect(HARNESS_CATALOG.filter((h) => h.kind === "on-demand").map((h) => h.id)).toEqual([
        "t3code",
      ]);
    });

    it("carries no oh.json key on any entry — the verb is the only door", () => {
      for (const h of HARNESS_CATALOG) {
        expect(Object.keys(h).sort(), h.id).toEqual([
          "binary",
          "docsPath",
          "id",
          "installArgv",
          "installUser",
          "kind",
          "title",
          "verifyArgv",
        ]);
      }
    });
  });

  // #908: the INSTALL_* build args are gone. The catalog no longer mirrors the
  // Dockerfile — it replaces it, and `oh harness install` is the only path.
  describe("owns the install, and the image no longer does", () => {
    it("declares no buildArg anywhere — the field itself is gone", () => {
      expect(read(".oh/cli/src/lib/harnesses/catalog.ts")).not.toContain("buildArg");
    });

    it("declares no per-harness INSTALL_* build arg or compose projection", () => {
      for (const name of ["OPENCODE", "GROK_BUILD", "HERMES", "AGENT_BROWSER", "TAILSCALE"]) {
        const arg = `INSTALL_${name}`;
        expect(DOCKERFILE).not.toMatch(new RegExp(`^ARG ${arg}`, "m"));
        expect(COMPOSE_YML).not.toContain(`${arg}: \${${arg}:-false}`);
      }
    });

    it.each(HARNESS_CATALOG.map((h) => [h.id, h] as const))(
      "%s: installs as the sandbox user into the home mount",
      (_id, h) => {
        expect(h.installUser).toBe("sandbox");
        expect(h.installArgv.join("\n")).toMatch(
          /\/home\/sandbox\/\.local|\$HOME\/\.local|uv|npx/,
        );
      },
    );

    it("keeps the grok-build pin in the catalog, now that the Dockerfile has none", () => {
      const grok = findHarness("grok-build");
      expect(versionPins(grok!.installArgv)).toEqual(["0.2.39"]);
      expect(DOCKERFILE).not.toContain("bash -s 0.2.39");
    });

    it("gates the Hermes wiring on the binary, never on INSTALL_HERMES", () => {
      expect(COMPOSE_YML).not.toContain("INSTALL_HERMES");
      expect(DOCKERFILE).not.toContain("INSTALL_HERMES");
      expect(ENTRYPOINT).not.toContain("INSTALL_HERMES");
      expect(ENTRYPOINT).toContain("if command -v hermes >/dev/null 2>&1; then");
      expect(read(".oh/scripts/link-providers.sh")).not.toContain("INSTALL_HERMES");
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

  describe("npm-installed harnesses land in the home mount, not the image", () => {
    const npmHarnesses = HARNESS_CATALOG.filter((h) => h.installArgv[0] === "npm");

    it("covers claude-code, codex, opencode and pi", () => {
      expect(npmHarnesses.map((h) => h.id).sort()).toEqual([
        "claude-code",
        "codex",
        "opencode",
        "pi",
      ]);
    });

    it("declares NPM_USER_PREFIX as the prefix the catalog installs into", () => {
      expect(DOCKERFILE).toContain(`ENV NPM_USER_PREFIX="${NPM_USER_PREFIX}"`);
    });

    it.each(npmHarnesses.map((h) => [h.id, h] as const))(
      "%s: installs as the sandbox user into NPM_USER_PREFIX",
      (_id, h) => {
        expect(h.installUser).toBe("sandbox");
        expect(h.installArgv).toContain(NPM_USER_PREFIX);
      },
    );

    it("keeps claude-code's postinstall, which copies the native binary over the placeholder", () => {
      expect(findHarness("claude-code")!.installArgv).not.toContain("--ignore-scripts");
    });

    it.each(npmHarnesses.map((h) => [h.id, h] as const))(
      "%s: its npm package is absent from the Dockerfile",
      (id, h) => {
        const pkg = h.installArgv[h.installArgv.length - 1];
        expect(pkg, `${id} declares no install package`).toMatch(/^(@[^/]+\/)?[^-].*/);
        expect(
          DOCKERFILE_CODE,
          `${id} is baked into the image; it enters only through \`oh harness install\``,
        ).not.toContain(pkg);
      },
    );

    it("keeps no build arg that could bake a harness back into the image", () => {
      expect(DOCKERFILE_CODE).not.toMatch(/^ARG (BAKE_HARNESSES|AGENTS)=/m);
    });
  });

  it("findHarness resolves known ids and rejects unknown ones", () => {
    expect(findHarness("opencode")?.id).toBe("opencode");
    expect(findHarness("grok-build")?.title).toBe("Grok Build");
    expect(findHarness("nope")).toBeUndefined();
  });

  it("registers Muse with a home-local native installer and version verification", () => {
    const muse = findHarness("muse-code")!;
    expect(muse).toMatchObject({
      title: "Muse Code", binary: "muse", kind: "installable",
      installUser: "sandbox", verifyArgv: ["muse", "--version"],
      docsPath: "docs/harnesses/muse-code.md",
    });
    expect(muse.installArgv[2]).toContain('MUSE_INSTALL_DIR="$HOME/.local/bin"');
    expect(muse.installArgv[2]).toContain("MUSE_NO_MODIFY_PATH=1");
    expect(muse.installArgv[2]).toContain("MUSE_LOGIN=0");
    expect(muse.installArgv[2]).toContain("set -o pipefail");
  });
});
