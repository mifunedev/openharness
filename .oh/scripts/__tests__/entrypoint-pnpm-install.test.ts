import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ENTRYPOINT = path.join(REPO_ROOT, ".devcontainer", "entrypoint.sh");

const entrypoint = readFileSync(ENTRYPOINT, "utf-8");

describe("devcontainer entrypoint pnpm install", () => {
  it("keeps the explicit SKIP_PNPM_INSTALL opt-out", () => {
    expect(entrypoint).toContain("SKIP_PNPM_INSTALL=1");
    expect(entrypoint).toContain('${SKIP_PNPM_INSTALL:-0}');
  });

  it("uses an Open Harness marker stored under node_modules", () => {
    expect(entrypoint).toContain('PNPM_INSTALL_MARKER_FILENAME=".openharness-root-pnpm-manifest.sha256"');
    expect(entrypoint).toContain('PNPM_INSTALL_MARKER="$HARNESS/node_modules/$PNPM_INSTALL_MARKER_FILENAME"');
  });

  it("keeps the pnpm_manifest_fingerprint helper contract", () => {
    expect(entrypoint).toMatch(/pnpm_manifest_fingerprint\(\) \{[\s\S]*?package\.json pnpm-lock\.yaml pnpm-workspace\.yaml/);
    expect(entrypoint).toMatch(/pnpm_manifest_fingerprint\(\) \{[\s\S]*?pnpm_workspace_package_manifest_paths "\$root"/);
    expect(entrypoint).toMatch(/pnpm_manifest_fingerprint\(\) \{[\s\S]*?\| LC_ALL=C sort -u/);
    expect(entrypoint).toMatch(/pnpm_manifest_fingerprint\(\) \{[\s\S]*?sha256sum "\$root\/\$rel"/);
    expect(entrypoint).toMatch(/pnpm_manifest_fingerprint\(\) \{[\s\S]*?\| sha256sum \| awk '\{print \$1\}'/);
  });

  it("reinstalls when manifests drift or the marker is missing", () => {
    expect(entrypoint).toMatch(/elif \[ ! -f "\$PNPM_INSTALL_MARKER" \] \|\| \[ "\$\(cat "\$PNPM_INSTALL_MARKER" 2>\/dev\/null \|\| true\)" != "\$PNPM_MANIFEST_FINGERPRINT" \]; then/);
    expect(entrypoint).toContain("manifest drift detected; reinstalling");
    expect(entrypoint).toMatch(/PNPM_INSTALL_REQUIRED=true/);
  });

  it("skips install when dependencies are current", () => {
    expect(entrypoint).toContain("dependencies current");
    expect(entrypoint).toMatch(/else\s+echo "\[entrypoint\] dependencies current"\s+fi/);
  });

  it("atomically refreshes the marker only after install succeeds", () => {
    expect(entrypoint).toMatch(/if gosu sandbox bash -c 'cd "\$1" && pnpm install --prefer-offline'/);
    expect(entrypoint).toContain('PNPM_INSTALL_MARKER_TMP="$PNPM_INSTALL_MARKER.tmp.$$"');
    expect(entrypoint).toMatch(/printf "%s\\n" "\$1" > "\$2" && mv -f "\$2" "\$3"/);
    expect(entrypoint).toMatch(/pnpm install marker refresh failed[\s\S]*exit 1/);
  });

  it("fails boot instead of swallowing a required pnpm install error", () => {
    expect(entrypoint).toContain("pnpm install failed — see /tmp/pnpm-install.log; aborting sandbox boot");
    expect(entrypoint).toMatch(/pnpm install failed[\s\S]*exit 1/);
    expect(entrypoint).not.toContain("cron-runtime and Slack Pi extension will not load");
  });
});
