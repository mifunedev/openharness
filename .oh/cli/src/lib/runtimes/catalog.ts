export type RuntimeTier = "container" | "microvm";

export type RuntimeState = "active" | "planned";

export interface RuntimeEntry {
  readonly id: string;
  readonly title: string;
  readonly tier: RuntimeTier;
  readonly state: RuntimeState;
  readonly provisionable: boolean;
  readonly notProvisionableReason?: string;
  readonly docsPath: string;
}

export const RUNTIME_CATALOG: readonly RuntimeEntry[] = Object.freeze([
  Object.freeze({
    id: "docker",
    title: "Docker container",
    tier: "container",
    state: "active",
    provisionable: true,
    docsPath: "docs/runtimes/docker.md",
  }),
  Object.freeze({
    id: "microsandbox",
    title: "MicroSandbox",
    tier: "microvm",
    state: "planned",
    provisionable: false,
    notProvisionableReason:
      "microsandbox is not a provisionable runtime yet; see docs/rfcs/rfc-runtime-support.md. Inside a sandbox run `oh tool install microsandbox`.",
    docsPath: "docs/runtimes/microsandbox.md",
  }),
]);

export function findRuntime(id: string): RuntimeEntry | undefined {
  return RUNTIME_CATALOG.find((r) => r.id === id);
}

export function runtimeIds(): string[] {
  return RUNTIME_CATALOG.map((r) => r.id);
}
