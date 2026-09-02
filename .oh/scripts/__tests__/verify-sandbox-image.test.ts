import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "verify-sandbox-image.sh");

type Overrides = Partial<{
  architecture: string;
  codename: string;
  dockerSuite: string;
  uid: string;
  gid: string;
  node: string;
  pnpm: string;
  missingTool: string;
  nonVersionTool: string;
  platformWarning: string;
  bakedHarnesses: boolean;
  bakedTools: boolean;
  noHarnesses: boolean;
  noInstallableTools: boolean;
  noBakedInTools: boolean;
  missingBakedInTool: boolean;
  harnessCatalogFails: boolean;
}>;

function fixture(o: Overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-sandbox-image-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });

  const v = {
    architecture: "amd64",
    codename: "trixie",
    dockerSuite: "trixie",
    uid: "1000",
    gid: "1000",
    node: "v22.14.0",
    pnpm: "10.33.0",
    missingTool: "",
    nonVersionTool: "",
    platformWarning: "",
    bakedHarnesses: false,
    bakedTools: false,
    noHarnesses: false,
    noInstallableTools: false,
    noBakedInTools: false,
    missingBakedInTool: false,
    harnessCatalogFails: false,
    ...o,
  };

  const docker = join(bin, "docker");
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
if [ "$1" = "image" ]; then printf '%s\\n' ${JSON.stringify(v.architecture)}; exit 0; fi
cmd="\${@: -1}"
case "$cmd" in
  *VERSION_CODENAME*) printf '%s' ${JSON.stringify(v.codename)} ;;
  *docker.list*) printf 'deb [arch=amd64] https://download.docker.com/linux/debian %s stable\\n' ${JSON.stringify(v.dockerSuite)} ;;
  *"id -u sandbox"*) printf '%s\\n%s\\n' ${JSON.stringify(v.uid)} ${JSON.stringify(v.gid)} ;;
  "node --version") printf '%s\\n' ${JSON.stringify(v.node)} ;;
  "pnpm --version") printf '%s\\n' ${JSON.stringify(v.pnpm)} ;;
  *"oh harness list --json"*)
    if [ "${v.harnessCatalogFails ? "1" : "0"}" = "1" ]; then
      echo 'not an OpenHarness-equipped repo' >&2
      exit 1
    fi
    cat <<'JSON'
${
  v.noHarnesses
    ? "[]"
    : `[
  { "id": "claude-code", "binary": "claude", "kind": "installable", "installed": ${v.bakedHarnesses} },
  { "id": "t3code", "binary": "t3", "kind": "on-demand", "installed": false }
]`
}
JSON
    ;;
  *"oh tool list --json"*)
    cat <<'JSON'
${(() => {
  const rows: string[] = [];
  if (!v.noInstallableTools) {
    rows.push(`  { "id": "herdr", "binary": "herdr", "kind": "installable", "installed": ${v.bakedTools} }`);
    rows.push('  { "id": "cloudflared", "binary": "cloudflared", "kind": "installable", "installed": false }');
  }
  if (!v.noBakedInTools) {
    rows.push(`  { "id": "gh", "binary": "gh", "kind": "baked-in", "installed": ${!v.missingBakedInTool} }`);
  }
  return `[\n${rows.join(",\n")}\n]`;
})()}
JSON
    ;;
  *)
    if [ -n ${JSON.stringify(v.missingTool)} ] && [ "$cmd" = ${JSON.stringify(v.missingTool)} ]; then
      echo 'command not found' >&2
      exit 127
    fi
    if [ -n ${JSON.stringify(v.platformWarning)} ]; then
      echo "WARNING: The requested image's platform (linux/arm64) does not match the detected host platform" >&2
    fi
    if [ -n ${JSON.stringify(v.nonVersionTool)} ] && [ "$cmd" = ${JSON.stringify(v.nonVersionTool)} ]; then
      printf '%s completed successfully\\n' "$cmd"
    else
      printf '%s 1.2.3 (fake)\\n' "$cmd"
    fi
    ;;
esac
exit 0
`,
  );
  chmodSync(docker, 0o755);
  return { bin };
}

function run(fx: { bin: string }) {
  return spawnSync("bash", [SCRIPT, "sandbox:test"], {
    cwd: ROOT,
    env: { ...process.env, PATH: `${fx.bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

describe("verify-sandbox-image", () => {
  it("passes a conforming Trixie image", () => {
    const result = run(fixture());

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("base distribution is Debian trixie");
    expect(result.stdout).toContain("Docker apt suite is trixie");
    expect(result.stdout).toContain("built-in sandbox user is 1000:1000");
    expect(result.stdout).toContain("node is major 22");
    expect(result.stdout).toContain("pnpm is exactly 10.33.0");
    expect(result.stdout).toContain("no harness is baked into the image");
    expect(result.stdout).toContain("no installable tool is baked into the image");
    expect(result.stdout).toContain("all checks passed");
  });

  it("requires an image reference", () => {
    const result = spawnSync("bash", [SCRIPT], { cwd: ROOT, encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });

  it.each<[string, Overrides, string]>([
    ["a Bookworm base", { codename: "bookworm" }, "base distribution codename is 'bookworm'"],
    ["a Bookworm Docker suite", { dockerSuite: "bookworm" }, "Docker apt suite is not trixie"],
    ["a shifted sandbox UID", { uid: "1001" }, "built-in sandbox user is 1001:1000"],
    ["a wrong Node major", { node: "v20.19.0" }, "node major is not 22"],
    ["a drifted pnpm version", { pnpm: "10.34.0" }, "pnpm is 10.34.0"],
    ["a missing required tool", { missingTool: "uv --version" }, "uv --version produced no version output"],
  ])("rejects %s", (_label, overrides, expected) => {
    const result = run(fixture(overrides));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expected);
  });

  it.each([
    "gh --version",
    "docker --version",
    "docker compose version",
    "bun --version",
    "uv --version",
  ])("rejects clean but non-version output from %s", (tool) => {
    const result = run(fixture({ nonVersionTool: tool }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${tool} exited cleanly but its version line has no numeric dotted version`,
    );
  });

  it("reports the tool's own version line, not an emulation platform warning", () => {
    const result = run(fixture({ platformWarning: "1" }));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok: gh --version -> gh --version 1.2.3 (fake)");
    expect(result.stdout).not.toContain("does not match the detected host platform");
  });

  it("rejects an unsupported architecture", () => {
    const result = run(fixture({ architecture: "riscv64" }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupported image architecture: riscv64");
  });

  it("accepts an arm64 image", () => {
    const result = run(fixture({ architecture: "arm64" }));

    expect(result.status).toBe(0);
  });

  it("passes an image that bakes no harness and no installable tool", () => {
    const result = run(fixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no harness is baked into the image");
    expect(result.stdout).toContain("no installable tool is baked into the image");
    expect(result.stdout).toContain("every baked-in tool is present");
  });

  it("rejects an image that bakes an installable harness", () => {
    const result = run(fixture({ bakedHarnesses: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the image ships baked harnesss: claude-code (claude)");
  });

  it("rejects an image that bakes an installable tool", () => {
    const result = run(fixture({ bakedTools: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the image ships baked installable tools: herdr (herdr)");
  });

  it("rejects an image whose baked-in tool is missing", () => {
    const result = run(fixture({ missingBakedInTool: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("baked-in tools are missing from the image: gh");
  });

  it.each<[string, Overrides]>([
    ["harness", { noHarnesses: true }],
    ["installable tool", { noInstallableTools: true }],
  ])("refuses to pass vacuously when the image lists no %s", (_noun, overrides) => {
    const result = run(fixture(overrides));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("would pass vacuously");
  });

  it("refuses to pass vacuously when the image declares no baked-in tool", () => {
    const result = run(fixture({ noBakedInTools: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('declares no kind:"baked-in" tool');
  });

  it("fails loudly when the harness catalog cannot be read out of the image", () => {
    const result = run(fixture({ harnessCatalogFails: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not read the harness catalog from the image");
  });
});
