
export type RuntimeTier =
  | "container"
  | "microvm"
  | "syscall-interposition";

export type RuntimeState =
  | "active"
  | "blocked"
  | "planned";

export type PreflightCheck =
  | {
      readonly id: "glibc";
      readonly scope: "target";
      readonly label: string;
      readonly minVersion: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    }
  | {
      readonly id: "device";
      readonly scope: "target";
      readonly label: string;
      readonly path: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    }
  | {
      readonly id: "command";
      readonly scope: "host" | "target";
      readonly label: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    };

export interface RuntimeEntry {
  readonly id: string;
  readonly title: string;
  readonly tier: RuntimeTier;
  readonly state: RuntimeState;
  readonly installable: boolean;
  readonly notInstallableReason?: string;
  readonly binary?: string;
  readonly installArgv?: readonly string[];
  readonly installUser?: "root" | "sandbox";
  readonly verifyArgv?: readonly string[];
  readonly doctorArgv?: readonly string[];
  readonly preflight: readonly PreflightCheck[];
  readonly docsPath: string;
  readonly tracking?: string;
}

export const RUNTIME_CATALOG: readonly RuntimeEntry[] = Object.freeze([
  Object.freeze({
    id: "docker",
    title: "Docker container",
    tier: "container",
    state: "active",
    installable: false,
    notInstallableReason:
      "Docker is the runtime the sandbox already runs on — there is nothing to install. `oh sandbox` starts the container; `oh runtime status docker` checks the daemon.",
    preflight: Object.freeze([
      Object.freeze({
        id: "command",
        scope: "host",
        label: "docker",
        probeArgv: Object.freeze([
          "docker",
          "version",
          "--format",
          "{{.Server.Version}}",
        ]),
        remediation:
          "The Docker daemon did not answer. Install Docker Engine and start it — see https://docs.docker.com/engine/install/ — then re-run `oh sandbox`.",
      }),
    ]),
    docsPath: "docs/runtimes/docker.md",
  }),
  Object.freeze({
    id: "microsandbox",
    title: "MicroSandbox",
    tier: "microvm",
    state: "blocked",
    installable: true,
    binary: "msb",
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh && sh /tmp/get-msb.sh",
    ]),
    installUser: "sandbox",
    verifyArgv: Object.freeze(["bash", "-lc", "command -v msb >/dev/null"]),
    doctorArgv: Object.freeze(["msb", "self", "doctor"]),
    preflight: Object.freeze([
      Object.freeze({
        id: "glibc",
        scope: "target",
        label: "glibc",
        minVersion: "2.39",
        probeArgv: Object.freeze(["bash", "-lc", "ldd --version | head -1"]),
        remediation:
          "Rebuild the sandbox image: .devcontainer/Dockerfile pins debian:trixie-slim, whose glibc clears this floor. Tracked in #805.",
      }),
      Object.freeze({
        id: "device",
        scope: "target",
        label: "/dev/kvm",
        path: "/dev/kvm",
        probeArgv: Object.freeze(["bash", "-lc", "test -e /dev/kvm"]),
        remediation:
          ".devcontainer/docker-compose.yml declares no `devices:` key, so the container reaches no KVM. Tracked in #805.",
      }),
    ]),
    docsPath: "docs/runtimes/microsandbox.md",
    tracking: "#805",
  }),
  Object.freeze({
    id: "gvisor",
    title: "gVisor (runsc)",
    tier: "syscall-interposition",
    state: "planned",
    installable: false,
    notInstallableReason:
      "gVisor is planned and not yet implemented here. It is a host-side Docker runtime, not a package installed inside the sandbox, so `oh runtime` cannot install it. It measured GREEN (#806, draft PR #804) but the adoption decision is unmade.",
    preflight: Object.freeze([]),
    docsPath: "docs/runtimes/overview.md",
    tracking: "#806",
  }),
]);

export function findRuntime(id: string): RuntimeEntry | undefined {
  return RUNTIME_CATALOG.find((r) => r.id === id);
}

export function runtimeIds(): string[] {
  return RUNTIME_CATALOG.map((r) => r.id);
}

export const DEFAULT_RUNTIME = "microsandbox";

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function parseGlibcVersion(output: string): string | undefined {
  const matches = output.match(/\d+\.\d+/g);
  return matches ? matches[matches.length - 1] : undefined;
}
