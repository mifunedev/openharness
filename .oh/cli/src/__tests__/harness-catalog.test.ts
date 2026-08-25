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

/**
 * The DRIFT TEST for the harness catalog.
 *
 * `.devcontainer/Dockerfile` is the ground truth for how a harness is installed.
 * The catalog restates that so the CLI can install one WITHOUT a rebuild — which
 * means the two can silently diverge, and a divergence is invisible in review
 * (nobody diffs a TS table against a Dockerfile by eye). These assertions make
 * the divergence a failing command instead.
 *
 * Reads real repo files, spawns nothing.
 */

// src/__tests__ -> src -> .oh/cli -> .oh -> repo root
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");

const DOCKERFILE = read(".devcontainer/Dockerfile");
const HARNESS_CONFIG_SH = read(".oh/scripts/harness-config.sh");
const HARNESS_YAML_EXAMPLE = read("harness.yaml.example");

/** Version-like tokens in an argv, e.g. the `0.2.39` grok-build pin. */
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

  it("excludes agent_browser — it shares the install: section but is not a harness", () => {
    expect(HARNESS_CATALOG.some((h) => h.harnessKey === "agent_browser")).toBe(false);
    // Guard the premise: the key really is in the install: section.
    expect(HARNESS_YAML_EXAMPLE).toMatch(/agent_browser/);
  });

  it("documents every harness under .oh/docs/harnesses/<id>.md", () => {
    for (const h of HARNESS_CATALOG) {
      expect(h.docsPath).toBe(`.oh/docs/harnesses/${h.id}.md`);
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
      "%s: harness.yaml key is in harness-config.sh's envmap",
      (_id, h) => {
        expect(HARNESS_CONFIG_SH).toContain(`install.${h.harnessKey}`);
        // The envmap must map it to the SAME build arg the catalog names.
        const row = new RegExp(
          `envmap\\["install\\.${h.harnessKey}"\\]\\s*=\\s*"${h.buildArg}"`,
        );
        expect(HARNESS_CONFIG_SH).toMatch(row);
      },
    );

    it.each(flagged.map((h) => [h.id, h] as const))(
      "%s: key ships in harness.yaml.example's install: section",
      (_id, h) => {
        const install = HARNESS_YAML_EXAMPLE.split(/^install:/m)[1] ?? "";
        const section = install.split(/^[a-zA-Z_]+:/m)[0];
        expect(section).toContain(`${h.harnessKey}:`);
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
      // The one hard-pinned installer — assert the pin explicitly so bumping it
      // in the Dockerfile alone fails here rather than installing a stale CLI.
      const grok = findHarness("grok-build");
      expect(versionPins(grok!.installArgv)).toEqual(["0.2.39"]);
      expect(DOCKERFILE).toContain("bash -s 0.2.39");
    });

    it("installs deepagents and pi as the sandbox user, not root", () => {
      // UV_TOOL_DIR/UV_TOOL_BIN_DIR live under /home/sandbox, and pi installs
      // under the sandbox user's npm prefix so `pi update` needs no sudo.
      expect(findHarness("deepagents")!.installUser).toBe("sandbox");
      expect(findHarness("pi")!.installUser).toBe("sandbox");
      expect(DOCKERFILE).toContain("UV_TOOL_DIR=/home/sandbox");
    });
  });

  it("builds pipeline installers as constant argv, never interpolation", () => {
    for (const h of HARNESS_CATALOG) {
      if (h.installArgv[0] !== "bash") continue;
      expect(h.installArgv[1]).toBe("-lc");
      // A shell string is only acceptable when it is a fixed literal. Nothing
      // derived from user input may appear in it.
      expect(h.installArgv[2]).not.toContain("${");
      expect(h.installArgv).toHaveLength(3);
    }
  });

  it("findHarness resolves known ids and rejects unknown ones", () => {
    expect(findHarness("opencode")?.harnessKey).toBe("opencode");
    // The slug/key mismatch that makes hand-editing harness.yaml error-prone.
    expect(findHarness("grok-build")?.harnessKey).toBe("grok_build");
    expect(findHarness("nope")).toBeUndefined();
  });
});
