import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCRIPT = join(ROOT, ".oh", "scripts", "verify-sandbox-image.sh");

const AMD64_SHA = "bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059";

type Overrides = Partial<{
  architecture: string;
  codename: string;
  dockerSuite: string;
  cloudflareSuite: string;
  uid: string;
  gid: string;
  node: string;
  pnpm: string;
  herdr: string;
  herdrSha: string;
  missingTool: string;
  nonVersionTool: string;
  platformWarning: string;
}>;

function fixture(o: Overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-sandbox-image-"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });

  const v = {
    architecture: "amd64",
    codename: "trixie",
    dockerSuite: "trixie",
    cloudflareSuite: "bookworm",
    uid: "1000",
    gid: "1000",
    node: "v22.14.0",
    pnpm: "10.33.0",
    herdr: "herdr 0.7.4",
    herdrSha: AMD64_SHA,
    missingTool: "",
    nonVersionTool: "",
    platformWarning: "",
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
  *cloudflared.list*) printf 'deb [arch=amd64] https://pkg.cloudflare.com/cloudflared %s main\\n' ${JSON.stringify(v.cloudflareSuite)} ;;
  *"id -u sandbox"*) printf '%s\\n%s\\n' ${JSON.stringify(v.uid)} ${JSON.stringify(v.gid)} ;;
  "node --version") printf '%s\\n' ${JSON.stringify(v.node)} ;;
  "pnpm --version") printf '%s\\n' ${JSON.stringify(v.pnpm)} ;;
  "herdr --version") printf '%s\\n' ${JSON.stringify(v.herdr)} ;;
  *sha256sum*) printf '%s  /usr/local/bin/herdr\\n' ${JSON.stringify(v.herdrSha)} ;;
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
    expect(result.stdout).toContain("Cloudflare apt suite is bookworm");
    expect(result.stdout).toContain("built-in sandbox user is 1000:1000");
    expect(result.stdout).toContain("node is major 22");
    expect(result.stdout).toContain("pnpm is exactly 10.33.0");
    expect(result.stdout).toContain("herdr is 0.7.4");
    expect(result.stdout).toContain("matches the amd64 (x86_64) Dockerfile checksum pin");
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
    ["a Trixie Cloudflare suite", { cloudflareSuite: "trixie" }, "Cloudflare apt suite is not bookworm"],
    ["a shifted sandbox UID", { uid: "1001" }, "built-in sandbox user is 1001:1000"],
    ["a wrong Node major", { node: "v20.19.0" }, "node major is not 22"],
    ["a drifted pnpm version", { pnpm: "10.34.0" }, "pnpm is 10.34.0"],
    ["a drifted Herdr version", { herdr: "herdr 0.7.3" }, "herdr is 'herdr 0.7.3'"],
    ["a Herdr binary that misses its pin", { herdrSha: "deadbeef" }, "does not match the amd64 pin"],
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
    "cloudflared --version",
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

  it("resolves the arm64 checksum pin from the Dockerfile", () => {
    const result = run(
      fixture({
        architecture: "arm64",
        herdrSha: "544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2",
      }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("matches the arm64 (aarch64) Dockerfile checksum pin");
  });
});
