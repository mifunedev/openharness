import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareVersions,
  DEFAULT_RUNTIME,
  findRuntime,
  parseGlibcVersion,
  runtimeIds,
  RUNTIME_CATALOG,
} from "../lib/runtimes/catalog.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (p: string): string => readFileSync(join(REPO_ROOT, p), "utf8");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("runtime catalog shape", () => {
  it("exposes the three known runtimes, active one first", () => {
    expect(runtimeIds()).toEqual(["docker", "microsandbox", "gvisor"]);
  });

  it("has exactly one active runtime — the sandbox runs on one thing", () => {
    expect(RUNTIME_CATALOG.filter((r) => r.state === "active").map((r) => r.id)).toEqual([
      "docker",
    ]);
  });

  it("defaults to microsandbox, and the default resolves", () => {
    expect(DEFAULT_RUNTIME).toBe("microsandbox");
    expect(findRuntime(DEFAULT_RUNTIME)).toBeDefined();
  });

  it("gives every entry a docs path", () => {
    for (const r of RUNTIME_CATALOG) {
      expect(r.docsPath, r.id).toMatch(/^\.oh\/docs\/runtimes\//);
    }
  });

  it("gives every entry with open work a tracking issue", () => {
    for (const r of RUNTIME_CATALOG) {
      if (r.state === "active") expect(r.tracking, r.id).toBeUndefined();
      else expect(r.tracking, r.id).toMatch(/^#\d+$/);
    }
  });

  it("makes every non-installable entry say why", () => {
    for (const s of RUNTIME_CATALOG) {
      if (!s.installable) expect(s.notInstallableReason, s.id).toBeTruthy();
    }
  });

  it("gives every installable entry the argv it needs", () => {
    for (const s of RUNTIME_CATALOG) {
      if (!s.installable) continue;
      expect(s.installArgv, s.id).toBeDefined();
      expect(s.verifyArgv, s.id).toBeDefined();
      expect(s.binary, s.id).toBeTruthy();
    }
  });
});

describe("no runtime selector is introduced", () => {
  const sources = [
    ".oh/cli/src/lib/runtimes/catalog.ts",
    ".oh/cli/src/commands/runtime.ts",
  ];

  it("names neither candidate config key in the implementation", () => {
    for (const path of sources) {
      const body = stripComments(read(path));
      expect(body, path).not.toContain("sandbox.substrate");
      expect(body, path).not.toContain("sandbox.runtime");
    }
  });

  it("declares no INSTALL_* key and no Dockerfile build arg", () => {
    for (const s of RUNTIME_CATALOG) {
      expect(Object.keys(s), s.id).not.toContain("harnessKey");
      expect(Object.keys(s), s.id).not.toContain("buildArg");
    }
  });

  it("imports no .devcontainer/.env writer", () => {
    const body = read(".oh/cli/src/commands/runtime.ts");
    expect(body).not.toContain("setInstallFlag");
    expect(body).not.toContain("seedHarnessYaml");
  });
});

describe("microsandbox preflight matches the measured blockers (#805)", () => {
  const msb = findRuntime("microsandbox")!;

  it("declares both blockers, and only those", () => {
    expect(msb.preflight.map((c) => c.id)).toEqual(["glibc", "device"]);
  });

  it("floors glibc at 2.39", () => {
    const glibc = msb.preflight.find((c) => c.id === "glibc")!;
    expect(glibc.id === "glibc" && glibc.minVersion).toBe("2.39");
  });

  it("requires /dev/kvm", () => {
    const dev = msb.preflight.find((c) => c.id === "device")!;
    expect(dev.id === "device" && dev.path).toBe("/dev/kvm");
  });

  it("names the base image the Dockerfile actually pins, whatever it is", () => {
    const glibc = msb.preflight.find((c) => c.id === "glibc")!;
    const dockerfile = read(".devcontainer/Dockerfile");
    const pinned = /^FROM\s+(\S+)/m.exec(dockerfile)?.[1];

    expect(pinned).toBeDefined();
    expect(glibc.remediation).toContain(pinned!);
  });

  it("does not claim the current base fails the glibc floor", () => {
    const glibc = msb.preflight.find((c) => c.id === "glibc")!;

    expect(glibc.remediation).not.toMatch(/glibc 2\.3[0-8]/);
    expect(glibc.remediation).not.toContain("bookworm");
  });

  it("leaves /dev/kvm as the blocker the default compose still has", () => {
    const dev = msb.preflight.find((c) => c.id === "device")!;
    const compose = read(".devcontainer/docker-compose.yml");

    expect(compose).not.toMatch(/^\s*devices:/m);
    expect(dev.remediation).toContain("devices:");
  });

  it("uses the installer command recorded by the P0 spike, not an invented one", () => {
    expect(msb.installArgv).toEqual([
      "bash",
      "-lc",
      "curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh && sh /tmp/get-msb.sh",
    ]);
    expect(msb.doctorArgv).toEqual(["msb", "self", "doctor"]);
  });

  it("passes argv arrays with no interpolation into a shell", () => {
    for (const s of RUNTIME_CATALOG) {
      for (const argv of [s.installArgv, s.verifyArgv, s.doctorArgv]) {
        if (!argv) continue;
        for (const token of argv) expect(token, `${s.id}: ${token}`).not.toContain("${");
      }
    }
  });
});

describe("docker is the active runtime and is checked, not assumed", () => {
  const docker = findRuntime("docker")!;

  it("is the container tier, active, and needs no install", () => {
    expect(docker.tier).toBe("container");
    expect(docker.state).toBe("active");
    expect(docker.installable).toBe(false);
    expect(docker.notInstallableReason).toContain("already runs on");
  });

  it("declares a real check rather than assuming the daemon answers", () => {
    expect(docker.preflight.length).toBeGreaterThan(0);
    const check = docker.preflight[0];
    expect(check.id).toBe("command");
    expect(check.probeArgv).toEqual([
      "docker",
      "version",
      "--format",
      "{{.Server.Version}}",
    ]);
  });

  it("probes the HOST, not the container", () => {
    for (const check of docker.preflight) expect(check.scope).toBe("host");
  });

  it("points its remediation at installing Docker", () => {
    expect(docker.preflight[0].remediation).toContain("docker.com");
  });
});

describe("check scopes are declared coherently", () => {
  it("puts every glibc and device check inside the sandbox", () => {
    for (const r of RUNTIME_CATALOG) {
      for (const c of r.preflight) {
        if (c.id === "glibc" || c.id === "device") expect(c.scope, r.id).toBe("target");
      }
    }
  });
});

describe("gvisor is present but not installable", () => {
  const gvisor = findRuntime("gvisor")!;

  it("is planned and not implemented — green elsewhere, undecided here", () => {
    expect(gvisor.state).toBe("planned");
    expect(gvisor.installable).toBe(false);
    expect(gvisor.tracking).toBe("#806");
  });

  it("declares no preflight, because nothing is implemented to probe", () => {
    expect(gvisor.preflight).toEqual([]);
    expect(gvisor.installArgv).toBeUndefined();
  });
});

describe("compareVersions", () => {
  it("compares numerically, not lexically", () => {
    expect(compareVersions("2.9", "2.39")).toBeLessThan(0);
    expect(compareVersions("2.39", "2.39")).toBe(0);
    expect(compareVersions("2.41", "2.39")).toBeGreaterThan(0);
    expect(compareVersions("2.36", "2.39")).toBeLessThan(0);
    expect(compareVersions("3.0", "2.39")).toBeGreaterThan(0);
  });

  it("treats a missing component as zero", () => {
    expect(compareVersions("2", "2.0")).toBe(0);
    expect(compareVersions("2", "2.1")).toBeLessThan(0);
  });
});

describe("parseGlibcVersion", () => {
  it("takes the trailing version, not the packaging string", () => {
    expect(parseGlibcVersion("ldd (Ubuntu GLIBC 2.35-0ubuntu3.11) 2.35")).toBe("2.35");
    expect(parseGlibcVersion("ldd (Debian GLIBC 2.36-9+deb12u7) 2.36")).toBe("2.36");
    expect(parseGlibcVersion("ldd (GNU libc) 2.39")).toBe("2.39");
  });

  it("returns undefined rather than guessing", () => {
    expect(parseGlibcVersion("")).toBeUndefined();
    expect(parseGlibcVersion("bash: ldd: command not found")).toBeUndefined();
  });
});
