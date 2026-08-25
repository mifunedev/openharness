/**
 * The isolation-runtime catalog — the single source of truth `oh runtime` reads.
 *
 * A RUNTIME IS NOT A HARNESS. `../harnesses/catalog.ts` lists agent CLIs that
 * run *inside* the sandbox; this file lists the isolation boundaries the sandbox
 * itself runs *on*. They are deliberately separate tables: a harness is a
 * package, a runtime is a kernel boundary, and conflating them would put `msb`
 * in the same list as `claude`.
 *
 * "runtime" is the word Docker already uses (`docker run --runtime=runsc`) and
 * the word this repo already uses (`.oh/docs/rfcs/rfc-runtime-support.md`).
 * NAMING THE COMMAND DOES NOT SETTLE THE CONFIG KEY: #806 § B1 records
 * `sandbox.substrate` vs `sandbox.runtime` as an open decision owned by #731,
 * and this file writes neither — see below.
 *
 * WHY THIS TABLE DECLARES NO `harness.yaml` KEY, AND NO DOCKERFILE BUILD ARG:
 *
 *  - No config key. #806 § B1 states that settling the selector outside #731
 *    forks the `ExecutionTarget` seam at `../execution/index.ts`. So
 *    `oh runtime` writes NOTHING. It reports which runtime is in use, measures
 *    what the others would need, and installs a tool; it does not select a
 *    runtime. Selection is #731's, and this command stays correct whichever
 *    name wins.
 *
 *  - No build arg. `.devcontainer/Dockerfile` pins `debian:bookworm-slim`
 *    (glibc 2.36) and the MicroSandbox installer floors at glibc 2.39 (#805).
 *    A build arg would bake a guaranteed-failing install into every image.
 *
 * Consequently `oh runtime install` is LIVE-ONLY by construction. The
 * persist-first ordering that `oh harness install` uses does not apply here,
 * because there is nothing durable to persist.
 *
 * SHELL-STRING RULE, inherited from the harness catalog: argv arrays only.
 * The MicroSandbox installer is genuinely a two-step pipeline, so its argv is
 * `["bash", "-lc", "<constant>"]` where the string is a LITERAL in this file
 * with zero interpolation. Nothing derived from a user-supplied name ever
 * reaches a shell.
 *
 * PROVENANCE: every MicroSandbox command below is copied from
 * `.oh/tasks/microsandbox-substrate/next-tasks.md` on PR #803 — the P0 spike
 * record. None is invented. MicroSandbox has never produced a binary in this
 * harness, so there is no local round trip to derive them from, and guessing an
 * installer flag would be worse than citing the spike.
 */

/** Isolation depth. Not a ranking — a description of the boundary. */
export type RuntimeTier =
  /** A shared host kernel with namespaces and cgroups. What runs today. */
  | "container"
  /** One real kernel per sandbox, KVM-backed. */
  | "microvm"
  /** A userspace kernel intercepts syscalls. No KVM needed. */
  | "syscall-interposition";

/** How far a runtime has got in this harness. */
export type RuntimeState =
  /** In use right now. The sandbox runs on this. */
  | "active"
  /** Measured, and measured to NOT work here yet. Blockers are known. */
  | "blocked"
  /** Measured green elsewhere. Not implemented here, and no adoption decision. */
  | "planned";

/**
 * One requirement, probed and reported.
 *
 * `scope` decides WHERE it runs, and the two are genuinely different machines:
 * `"target"` runs inside the sandbox through `ExecutionTarget.exec` (that is
 * where glibc and `/dev/kvm` must be right), while `"host"` runs on the machine
 * holding the `oh` binary (that is where the Docker daemon lives). A host check
 * asked inside the container would answer about the wrong kernel.
 *
 * A discriminated union rather than a free-form predicate so the catalog stays
 * data: `__tests__/runtime-catalog.test.ts` asserts the declared floor, and a
 * probe asserts the checks exist at all.
 */
export type PreflightCheck =
  | {
      readonly id: "glibc";
      readonly scope: "target";
      readonly label: string;
      /** Minimum acceptable `major.minor`. */
      readonly minVersion: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    }
  | {
      readonly id: "device";
      readonly scope: "target";
      readonly label: string;
      /** Device path that must exist. */
      readonly path: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    }
  | {
      /** A command that must exit 0. Its stdout is reported as the found value. */
      readonly id: "command";
      readonly scope: "host" | "target";
      readonly label: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    };

/** One isolation runtime the CLI knows how to inspect and (maybe) install. */
export interface RuntimeEntry {
  /** The name the user types. Matches `.oh/docs/runtimes/<id>.md` when one exists. */
  readonly id: string;
  readonly title: string;
  readonly tier: RuntimeTier;
  readonly state: RuntimeState;
  /**
   * Can `oh runtime install <id>` do anything at all? `false` means either
   * "already in use" or "the adoption decision is unmade" — never "this runtime
   * is bad". `notInstallableReason` says which.
   */
  readonly installable: boolean;
  /** Why `install` refuses. Required when `installable` is false. */
  readonly notInstallableReason?: string;
  /** Executable this runtime puts on PATH. Absent when not installable. */
  readonly binary?: string;
  /** Install command, argv form. Absent when not installable. */
  readonly installArgv?: readonly string[];
  /** User the install runs as inside the container. */
  readonly installUser?: "root" | "sandbox";
  /** Presence check, run inside the container. Absent when not installable. */
  readonly verifyArgv?: readonly string[];
  /**
   * Post-install self-check. `msb self doctor` per #805's acceptance list.
   * Run for its exit code only; a non-zero result downgrades the success
   * message rather than failing the install, because the install itself
   * succeeded and the doctor is diagnosing the host.
   */
  readonly doctorArgv?: readonly string[];
  /** Requirements, all of which must pass before an install is attempted. */
  readonly preflight: readonly PreflightCheck[];
  /** Repo-relative doc path, printed in list/status output. */
  readonly docsPath: string;
  /** Where this runtime's open work is tracked. Absent when there is none. */
  readonly tracking?: string;
}

/**
 * Every runtime the harness has measured, in tier order.
 *
 * DOCKER IS LISTED FIRST AND IS NOT A PLACEHOLDER. It is what the sandbox runs
 * on right now, and it is checked exactly like the others — `oh runtime status`
 * measures whether the daemon answers rather than assuming it does. A table
 * that showed only the runtimes you cannot use would answer "what could I move
 * to" while silently skipping "what am I on, and is it healthy".
 *
 * THREE ENTRIES ON PURPOSE, though only one is installable. A one-entry table
 * would encode a false singleton and force a schema change the moment gVisor's
 * adoption decision lands (#806).
 */
export const RUNTIME_CATALOG: readonly RuntimeEntry[] = Object.freeze([
  Object.freeze({
    id: "docker",
    title: "Docker container",
    tier: "container",
    state: "active",
    installable: false,
    notInstallableReason:
      "Docker is the runtime the sandbox already runs on — there is nothing to install. `oh sandbox` starts the container; `oh runtime status docker` checks the daemon.",
    // Host-scope: the daemon lives on the machine holding the `oh` binary, not
    // inside the container. Asking inside would answer about the wrong kernel.
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
    docsPath: ".oh/docs/runtimes/docker.md",
  }),
  Object.freeze({
    id: "microsandbox",
    title: "MicroSandbox",
    tier: "microvm",
    state: "blocked",
    installable: true,
    binary: "msb",
    // Two steps, from `next-tasks.md` on #803. Kept as one `bash -lc` literal
    // because the second step consumes the first step's file.
    installArgv: Object.freeze([
      "bash",
      "-lc",
      "curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh && sh /tmp/get-msb.sh",
    ]),
    // The installer places `msb` under the invoking user's home, so this runs
    // as `sandbox` — the user every interactive session is. See the CAVEAT in
    // `.oh/docs/runtimes/microsandbox.md`: whether the container or the host is
    // the intended target is NOT settled by #805, and container-side is chosen
    // here because it is the only side `ExecutionTarget` can reach.
    installUser: "sandbox",
    // Presence only. `msb --version` is unverified in this harness — no binary
    // has ever existed here to confirm the flag — so the check asks the shell,
    // which cannot be wrong about PATH.
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
          ".devcontainer/Dockerfile pins debian:bookworm-slim (glibc 2.36). Tracked in #805; the base-image upgrade in #807 also clears it.",
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
    docsPath: ".oh/docs/runtimes/microsandbox.md",
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
    // No preflight, deliberately: nothing is implemented to probe. Declaring a
    // check for an unimplemented runtime would report a readiness the harness
    // cannot act on. An empty list is the honest answer, not a missing one.
    preflight: Object.freeze([]),
    docsPath: ".oh/docs/runtimes/overview.md",
    tracking: "#806",
  }),
]);

/** Look up one runtime by the name the user typed. */
export function findRuntime(id: string): RuntimeEntry | undefined {
  return RUNTIME_CATALOG.find((r) => r.id === id);
}

/** Every known runtime id, in catalog order. */
export function runtimeIds(): string[] {
  return RUNTIME_CATALOG.map((r) => r.id);
}

/**
 * The runtime `oh runtime install` picks when given no name.
 *
 * NOT `docker`, even though docker is the active one: `install` means "add a
 * runtime this harness does not have", and docker is already here. The only
 * installable entry is the sensible default.
 */
export const DEFAULT_RUNTIME = "microsandbox";

/**
 * Compare two `major.minor` version strings. Returns <0, 0, or >0.
 *
 * Deliberately numeric per component: a lexical compare puts "2.9" above
 * "2.39", which is exactly the floor this file cares about.
 */
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

/**
 * Pull the glibc version out of `ldd --version`'s first line.
 *
 * The line varies by distribution:
 *   `ldd (Ubuntu GLIBC 2.35-0ubuntu3.11) 2.35`
 *   `ldd (Debian GLIBC 2.36-9+deb12u7) 2.36`
 * The trailing bare `major.minor` is the stable part, so the LAST match wins —
 * taking the first would read the packaging string inside the parentheses.
 *
 * Returns `undefined` when nothing matches, which callers must render as
 * "unknown" rather than "too old": failing to read a version is not evidence
 * that the version is bad.
 */
export function parseGlibcVersion(output: string): string | undefined {
  const matches = output.match(/\d+\.\d+/g);
  return matches ? matches[matches.length - 1] : undefined;
}
