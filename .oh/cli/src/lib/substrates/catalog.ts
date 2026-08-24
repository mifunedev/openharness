/**
 * The isolation-substrate catalog — the single source of truth `oh substrate`
 * reads.
 *
 * A SUBSTRATE IS NOT A HARNESS. `../harnesses/catalog.ts` lists agent CLIs that
 * run *inside* the sandbox; this file lists the isolation tiers the sandbox
 * could itself run *on*. They are deliberately separate tables: a harness is a
 * package, a substrate is a kernel boundary, and conflating them would put
 * `msb` in the same list as `claude`.
 *
 * WHY THIS TABLE DECLARES NO `harness.yaml` KEY, AND NO DOCKERFILE BUILD ARG:
 *
 *  - No config key. Issue #806 § B1 records an OPEN decision — the substrate
 *    plan (#802 P4) proposes `sandbox.substrate` while the EPIC #731 sysbox
 *    slice proposes `sandbox.runtime`. One decision needs one selector, and
 *    #806 states that settling it outside #731 forks the `ExecutionTarget` seam
 *    at `../execution/index.ts`. So `oh substrate` writes NOTHING. It installs
 *    a tool and reports host readiness; it does not select a runtime. Selection
 *    is #731's, and this command stays correct whichever name wins.
 *
 *  - No build arg. `.devcontainer/Dockerfile` pins `debian:bookworm-slim`
 *    (glibc 2.36) and the MicroSandbox installer floors at glibc 2.39 (#805).
 *    A build arg would bake a guaranteed-failing install into every image.
 *
 * Consequently `oh substrate install` is LIVE-ONLY by construction. The
 * persist-first ordering that `oh harness install` uses does not apply here,
 * because there is nothing durable to persist.
 *
 * SHELL-STRING RULE, inherited from the harness catalog: argv arrays only.
 * The MicroSandbox installer is genuinely a two-step pipeline, so its argv is
 * `["bash", "-lc", "<constant>"]` where the string is a LITERAL in this file
 * with zero interpolation. Nothing derived from a user-supplied name ever
 * reaches a shell.
 *
 * PROVENANCE: every command below is copied from
 * `.oh/tasks/microsandbox-substrate/next-tasks.md` on PR #803 — the P0 spike
 * record. None is invented. MicroSandbox has never produced a binary in this
 * harness, so there is no local round trip to derive them from, and guessing an
 * installer flag would be worse than citing the spike.
 */

/** Isolation depth. Not a ranking — a description of the boundary. */
export type SubstrateTier =
  /** One real kernel per sandbox, KVM-backed. */
  | "microvm"
  /** A userspace kernel intercepts syscalls. No KVM needed. */
  | "syscall-interposition";

/** How far a substrate has got in this harness. */
export type SubstrateState =
  /** Measured, and measured to NOT work here yet. Blockers are known. */
  | "blocked"
  /** Measured green elsewhere, but no adoption decision. Not installable. */
  | "planned";

/**
 * One host requirement, probed inside the container through `ExecutionTarget`.
 *
 * A discriminated union rather than a free-form predicate so the catalog stays
 * data: `__tests__/substrate-catalog.test.ts` asserts the declared floor, and a
 * probe asserts the checks exist at all.
 */
export type PreflightCheck =
  | {
      readonly id: "glibc";
      readonly label: string;
      /** Minimum acceptable `major.minor`. */
      readonly minVersion: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    }
  | {
      readonly id: "device";
      readonly label: string;
      /** Device path that must exist. */
      readonly path: string;
      readonly probeArgv: readonly string[];
      readonly remediation: string;
    };

/** One isolation substrate the CLI knows how to inspect and (maybe) install. */
export interface SubstrateEntry {
  /** The name the user types. Matches `.oh/docs/substrates/<id>.md` when one exists. */
  readonly id: string;
  readonly title: string;
  readonly tier: SubstrateTier;
  readonly state: SubstrateState;
  /**
   * Can `oh substrate install <id>` do anything at all? `false` means the
   * adoption decision is unmade, not that the substrate is bad — see
   * `notInstallableReason`.
   */
  readonly installable: boolean;
  /** Why `install` refuses. Required when `installable` is false. */
  readonly notInstallableReason?: string;
  /** Executable this substrate puts on PATH. Absent when not installable. */
  readonly binary?: string;
  /** Install command, argv form. Absent when not installable. */
  readonly installArgv?: readonly string[];
  /** User the install runs as inside the container. */
  readonly installUser?: "root" | "sandbox";
  /** Presence check. Exit 0 → already installed. */
  readonly verifyArgv?: readonly string[];
  /**
   * Post-install self-check. `msb self doctor` per #805's acceptance list.
   * Run for its exit code only; a non-zero result downgrades the success
   * message rather than failing the install, because the install itself
   * succeeded and the doctor is diagnosing the host.
   */
  readonly doctorArgv?: readonly string[];
  /** Host requirements, all of which must pass before an install is attempted. */
  readonly preflight: readonly PreflightCheck[];
  /** Repo-relative doc path, printed in list/status output. */
  readonly docsPath: string;
  /** Where this substrate's open work is tracked. */
  readonly tracking: string;
}

/**
 * Every substrate the harness has measured.
 *
 * TWO ENTRIES ON PURPOSE, though only one is installable. A single-entry table
 * would encode a false singleton and force a schema change the moment gVisor's
 * adoption decision lands (#806) — and gVisor is already MEASURED GREEN, so
 * that is a when, not an if.
 */
export const SUBSTRATE_CATALOG: readonly SubstrateEntry[] = Object.freeze([
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
    // `.oh/docs/substrates/microsandbox.md`: whether the container or the host
    // is the intended target is NOT settled by #805, and container-side is
    // chosen here because it is the only side `ExecutionTarget` can reach.
    installUser: "sandbox",
    // Presence only. `msb --version` is unverified in this harness — no binary
    // has ever existed here to confirm the flag — so the check asks the shell,
    // which cannot be wrong about PATH.
    verifyArgv: Object.freeze(["bash", "-lc", "command -v msb >/dev/null"]),
    doctorArgv: Object.freeze(["msb", "self", "doctor"]),
    preflight: Object.freeze([
      Object.freeze({
        id: "glibc",
        label: "glibc",
        minVersion: "2.39",
        probeArgv: Object.freeze(["bash", "-lc", "ldd --version | head -1"]),
        remediation:
          ".devcontainer/Dockerfile pins debian:bookworm-slim (glibc 2.36). Tracked in #805; the base-image upgrade in #807 also clears it.",
      }),
      Object.freeze({
        id: "device",
        label: "/dev/kvm",
        path: "/dev/kvm",
        probeArgv: Object.freeze(["bash", "-lc", "test -e /dev/kvm"]),
        remediation:
          ".devcontainer/docker-compose.yml declares no `devices:` key, so the container reaches no KVM. Tracked in #805.",
      }),
    ]),
    docsPath: ".oh/docs/substrates/microsandbox.md",
    tracking: "#805",
  }),
  Object.freeze({
    id: "gvisor",
    title: "gVisor (runsc)",
    tier: "syscall-interposition",
    state: "planned",
    installable: false,
    notInstallableReason:
      "gVisor is a host-side Docker runtime, not a package installed inside the sandbox — `oh substrate` cannot install it. It measured GREEN (#806, draft PR #804) but the adoption decision is unmade.",
    // No preflight: nothing is probed for a substrate that cannot be installed
    // from here. An empty list is the honest answer, not a missing one.
    preflight: Object.freeze([]),
    docsPath: ".oh/docs/substrates/overview.md",
    tracking: "#806",
  }),
]);

/** Look up one substrate by the name the user typed. */
export function findSubstrate(id: string): SubstrateEntry | undefined {
  return SUBSTRATE_CATALOG.find((s) => s.id === id);
}

/** Every known substrate id, in catalog order. */
export function substrateIds(): string[] {
  return SUBSTRATE_CATALOG.map((s) => s.id);
}

/** The substrate `oh substrate install` picks when given no name. */
export const DEFAULT_SUBSTRATE = "microsandbox";

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
