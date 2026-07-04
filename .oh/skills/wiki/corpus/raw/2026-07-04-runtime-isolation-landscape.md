# Source: https://manveerc.substack.com/p/ai-agent-sandboxing-guide

Capture date: 2026-07-04 (UTC). Primary fetched page below, plus the multi-source
2026 landscape corpus the `runtime-isolation-landscape.md` wiki entry synthesizes.

## Canonical source URLs
- Isolation strategies (primary): https://manveerc.substack.com/p/ai-agent-sandboxing-guide
- Sandbox infra comparison: https://agentmarketcap.ai/blog/2026/04/07/ai-agent-sandbox-infrastructure-e2b-modal-daytona-fly-machines-secure-code-execution
- Best sandbox for AI agents (2026): https://northflank.com/blog/best-code-execution-sandbox-for-ai-agents
- Daytona vs E2B (2026): https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes
- Cloudflare Sandbox SDK docs: https://developers.cloudflare.com/sandbox/
- Cloudflare Dynamic Workers (isolate sandboxing): https://blog.cloudflare.com/dynamic-workers/
- Cloudflare Sandboxes GA (InfoQ): https://www.infoq.com/news/2026/04/cloudflare-sandboxes-ga/

## Fetched body — isolation strategies (2026)

### 1. gVisor (user-space kernel)
A user-space application intercepts and re-implements syscalls, so the sandboxed
program never talks to the real kernel. **Level 2** isolation — stronger than
containers, weaker than hardware virtualization. Not all syscalls are perfectly
emulated (compatibility trade-offs). Used by Google (Agent Sandbox on GKE) and Modal.

### 2. Firecracker microVMs
Each workload gets its own dedicated kernel on KVM hardware virtualization, preventing
kernel exploits from compromising the host or peer VMs. **Level 3** — the "current gold
standard for untrusted code." Boots in **~125ms with ~5MB memory overhead**. Powers AWS
Lambda, E2B, and Vercel Sandbox.

### 3. Kata Containers
Full Docker/OCI image compatibility while providing microVM-level isolation underneath
— a key advantage over raw Firecracker. Isolation depth **Level 3** (dedicated kernel
per sandbox via hardware virtualization). Offered by Northflank and Daytona.

### 4. Plain containers (Docker / runc / namespaces)
Processes share the host kernel, separated by namespaces + cgroups. **Level 1** — a
kernel vulnerability in one container can compromise all others. "Sufficient for
trusted, internally-written code. Insufficient for anything an LLM generates."

### 5. Cold-start & trade-offs
Firecracker ~125ms baseline; Daytona claims sub-90ms (fastest cited). At high
concurrency (~400 parallel starts) CNI plugin / virtual-switch setup becomes the
bottleneck, raising startup latency by as much as 263% (a 125ms VM boot → multi-second).
Categorization: Primitives (Firecracker/gVisor) for teams running their own fleet;
embeddable Runtimes (E2B, microsandbox); Managed Platforms (Modal/Northflank/Daytona)
for data-heavy/GPU/zero-ops.

## Corpus notes (from parallel 2026 search results)
- **E2B** — Firecracker microVMs, ~150ms cold start; embeddable code-exec runtime.
- **Daytona** — sub-90ms cold start; Docker containers by default (weaker) with an
  optional Kata path for microVM-grade depth.
- **Modal** — Python-native serverless; GPU (A100/H100); autoscaling; gVisor isolation.
- **Fly Machines** — Firecracker-based; general compute.
- **Cloudflare (two-tier):** *Dynamic Workers* = V8 isolates, ~100× faster/cheaper than
  containers, ms cold starts, but no full OS (not a substrate). *Sandboxes/Containers*
  (GA 2026) = persistent isolated Linux with PTY, snapshot recovery, filesystem watch,
  code interpreter, egress-proxy credential injection — the container tier for full-OS
  agent workloads.
