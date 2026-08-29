import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findTool,
  installableToolIds,
  toolIds,
  TOOL_CATALOG,
} from "../lib/tools/catalog.js";
import { HARNESS_CATALOG } from "../lib/harnesses/catalog.js";
import { RUNTIME_CATALOG } from "../lib/runtimes/catalog.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (p: string): string => readFileSync(join(REPO_ROOT, p), "utf8");

describe("tool catalog shape", () => {
  it("lists the six known tools", () => {
    expect(toolIds()).toEqual([
      "agent-browser",
      "herdr",
      "cloudflared",
      "docker-cli",
      "gh",
      "tailscale",
    ]);
  });

  it("has exactly two installable tools", () => {
    expect(installableToolIds()).toEqual(["agent-browser", "tailscale"]);
  });

  it("makes every non-installable tool say why", () => {
    for (const t of TOOL_CATALOG) {
      if (t.installArgv === undefined) expect(t.notInstallableReason, t.id).toBeTruthy();
    }
  });

  it("gives every entry a docs path that exists", () => {
    for (const t of TOOL_CATALOG) {
      expect(() => read(t.docsPath), t.id).not.toThrow();
    }
  });

  it("checks presence with `command -v`, never a version flag", () => {
    for (const t of TOOL_CATALOG) {
      expect(t.verifyArgv.join(" "), t.id).toContain(`command -v ${t.binary}`);
    }
  });

  it("declares a version probe only where the flag is a safe standard", () => {
    const withVersion = TOOL_CATALOG.filter((t) => t.versionArgv !== undefined).map((t) => t.id);
    expect(withVersion).toEqual(["cloudflared", "docker-cli", "gh", "tailscale"]);
    for (const t of TOOL_CATALOG) {
      if (t.versionArgv) expect(t.versionArgv, t.id).toEqual([t.binary, "--version"]);
    }
  });

  it("passes argv arrays with no interpolation this process performs", () => {
    for (const t of TOOL_CATALOG) {
      for (const argv of [t.installArgv, t.verifyArgv, t.versionArgv]) {
        if (!argv) continue;
        for (const token of argv) expect(token, `${t.id}: ${token}`).not.toContain("${");
      }
    }
  });
});

describe("the three catalogs are disjoint", () => {
  it("shares no id with the harness or runtime catalog", () => {
    const harness = new Set(HARNESS_CATALOG.map((h) => h.id));
    const runtime = new Set(RUNTIME_CATALOG.map((r) => r.id));
    for (const t of TOOL_CATALOG) {
      expect(harness.has(t.id), `${t.id} is also a harness`).toBe(false);
      expect(runtime.has(t.id), `${t.id} is also a runtime`).toBe(false);
    }
  });

  it("has unique ids within itself", () => {
    expect(new Set(toolIds()).size).toBe(TOOL_CATALOG.length);
  });

  it("keeps docker-cli distinct from the docker RUNTIME", () => {
    expect(findTool("docker-cli")).toBeDefined();
    expect(findTool("docker")).toBeUndefined();
    expect(RUNTIME_CATALOG.some((r) => r.id === "docker")).toBe(true);
  });

  it("leaves agent_browser excluded from the harness catalog", () => {
    expect(HARNESS_CATALOG.some((h) => h.harnessKey === "agent_browser")).toBe(false);
  });
});

describe("agent-browser matches the entrypoint that really installs it", () => {
  const ab = findTool("agent-browser")!;
  const ENTRYPOINT = read(".devcontainer/entrypoint.sh");

  it("carries the entrypoint guard, not a build arg", () => {
    expect(ab.entrypointGuard).toBe("INSTALL_AGENT_BROWSER");
    expect(Object.keys(ab)).not.toContain("buildArg");
    expect(ab.toolKey).toBe("agent_browser");
  });

  it("is installed by the entrypoint and is ABSENT from the Dockerfile", () => {
    expect(ENTRYPOINT).toContain("INSTALL_AGENT_BROWSER");
    expect(read(".devcontainer/Dockerfile")).not.toContain("INSTALL_AGENT_BROWSER");
  });

  it("pins the same version the entrypoint pins", () => {
    expect(ab.installArgv!.join(" ")).toContain("agent-browser@0.8.5");
    expect(ENTRYPOINT).toContain("agent-browser@0.8.5");
  });

  it("reproduces each of the entrypoint's three install steps", () => {
    const argv = ab.installArgv!.join(" ");
    for (const step of [
      "pnpm add -g agent-browser@0.8.5",
      "-exec chmod +x",
      "agent-browser install --with-deps",
    ]) {
      expect(argv, step).toContain(step);
      expect(ENTRYPOINT, step).toContain(step);
    }
  });

  it("drops the entrypoint's log cosmetics, which would eat the exit code", () => {
    const argv = ab.installArgv!.join(" ");
    expect(argv).not.toContain("tail -5");
    expect(argv).not.toContain("[entrypoint]");
  });

  it("arms the download gate with the size the wizard also quotes", () => {
    expect(ab.downloadSize).toBe("~1 GB");
    expect(read(".oh/cli/src/commands/init.ts")).toContain("~1 GB");
  });

  it("keeps the env plumbing wired end to end", () => {
    expect(read(".devcontainer/docker-compose.yml")).toContain("INSTALL_AGENT_BROWSER");
    expect(read("docs/configuration.md")).toMatch(
      /^\| `install\.agentBrowser` \|.*`INSTALL_AGENT_BROWSER`/m,
    );
  });
});

describe("tailscale matches the entrypoint that really installs it", () => {
  const ts = findTool("tailscale")!;
  const ENTRYPOINT = read(".devcontainer/entrypoint.sh");
  const VERSION = "1.102.3";
  const SHA_AMD64 = "36ddd9b51be57ffc2990cf76323cfa13643bfbb1b8a969f6183fa164741cdef5";
  const SHA_ARM64 = "a0fa1b154af8c61f862a2259f559f7396d96c0225f4a863eae2333e1546bbe25";

  it("carries the entrypoint guard, not a build arg", () => {
    expect(ts.entrypointGuard).toBe("INSTALL_TAILSCALE");
    expect(Object.keys(ts)).not.toContain("buildArg");
    expect(ts.toolKey).toBe("tailscale");
    expect(ts.kind).toBe("opt-in");
  });

  it("is installed by the entrypoint and is ABSENT from the Dockerfile", () => {
    expect(ENTRYPOINT).toContain("INSTALL_TAILSCALE");
    expect(read(".devcontainer/Dockerfile")).not.toContain("INSTALL_TAILSCALE");
  });

  it("pins the same version the entrypoint pins", () => {
    expect(ts.installArgv!.join(" ")).toContain(`tailscale_${VERSION}_`);
    expect(ENTRYPOINT).toContain(`tailscale_${VERSION}_`);
  });

  it("verifies the same per-arch sha256 the entrypoint verifies", () => {
    const argv = ts.installArgv!.join(" ");
    for (const sha of [SHA_AMD64, SHA_ARM64]) {
      expect(argv, sha).toContain(sha);
      expect(ENTRYPOINT, sha).toContain(sha);
    }
    expect(argv).toContain("sha256sum -c -");
    expect(ENTRYPOINT).toContain("sha256sum -c -");
  });

  it("downloads from the pinned stable base the entrypoint uses", () => {
    const base = "https://pkgs.tailscale.com/stable/";
    expect(ts.installArgv!.join(" ")).toContain(base);
    expect(ENTRYPOINT).toContain(base);
  });

  it("installs as root because the binaries land in /usr/local/bin", () => {
    expect(ts.installUser).toBe("root");
    expect(ts.installArgv!.join(" ")).toContain("/usr/local/bin/tailscale");
    expect(ts.installArgv!.join(" ")).toContain("/usr/local/bin/tailscaled");
  });

  it("pre-creates the socket directory the entrypoint also pre-creates", () => {
    expect(ts.installArgv!.join(" ")).toContain("/var/run/tailscale");
    expect(ENTRYPOINT).toContain("/var/run/tailscale");
  });

  it("never joins a tailnet — installation is not authentication", () => {
    const argv = ts.installArgv!.join(" ");
    expect(argv).not.toContain("tailscale up");
    expect(argv).not.toMatch(/(^|[^d])tailscaled\s+--tun/);
  });

  it("drops the entrypoint's log cosmetics, which would eat the exit code", () => {
    const argv = ts.installArgv!.join(" ");
    expect(argv).not.toContain("[entrypoint]");
    expect(argv).not.toContain("tail -");
  });

  it("arms no download gate — the tarball is small", () => {
    expect(ts.downloadSize).toBeUndefined();
  });

  it("keeps the env plumbing wired end to end", () => {
    expect(read(".devcontainer/docker-compose.yml")).toContain("INSTALL_TAILSCALE");
    expect(read("docs/configuration.md")).toMatch(
      /^\| `install\.tailscale` \|.*`INSTALL_TAILSCALE`/m,
    );
  });
});

describe("baked-in tools", () => {
  it("declare no install key — the installer must not invent one", () => {
    for (const t of TOOL_CATALOG) {
      if (t.kind !== "baked-in") continue;
      expect(t.toolKey, t.id).toBeUndefined();
      expect(t.entrypointGuard, t.id).toBeUndefined();
      expect(t.installArgv, t.id).toBeUndefined();
    }
  });

  it("are each actually in the Dockerfile", () => {
    const dockerfile = read(".devcontainer/Dockerfile");
    for (const id of ["herdr", "cloudflared"]) {
      expect(dockerfile, id).toContain(id);
    }
  });
});
