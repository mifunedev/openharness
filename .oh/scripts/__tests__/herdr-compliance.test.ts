import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepoFile = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

const version = "0.7.4";
const commit = "50aaa2ec046ee26ff407c20f49de496f522512a8";
const commitArchiveSha = "71ce984133b50bd097d499873dc867f4f947c39d7868027146169df7aea516e4";
const bundleSha = "46978a7b059db39271124b0430b4cbe0db3e3a3dc12b264d39fcbd00be00b096";
const amd64Sha = "bc0fc02d4ba500f9cac2353a43e67fe036785ecca6eb55378e050fac3c103059";
const arm64Sha = "544e0002de42806d1ab64ccdef3a7e7414f24717b0b6b022bc9e57d2eefd26a2";
const zigAmd64Sha = "02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239";
const zigArm64Sha = "958ed7d1e00d0ea76590d27666efbf7a932281b3d7ba0c6b01b0ff26498f667f";
const highwayPackage = "N-V-__8AAGmZhABbsPJLfbqrh6JTHsXhY6qCaLAQyx25e0XE";
const uucode01Package = "uucode-0.1.0-ZZjBPj96QADXyt5sqwBJUnhaDYs_qBeeKijZvlRa0eqM";
const uucode02Package = "uucode-0.2.0-ZZjBPqZVVABQepOqZHR7vV_NcaN-wats0IB6o-Exj6m9";
const bundleName = `herdr-${version}-corresponding-source.tar.gz`;
const sourcePath = `/usr/share/src/herdr/${bundleName}`;
const packagerPath = ".oh/scripts/package-herdr-corresponding-source.sh";

const expectOrdered = (text: string, names: string[]): void => {
  const positions = names.map((name) => text.indexOf(`- name: ${name}`));
  for (const position of positions) expect(position).toBeGreaterThan(-1);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
};

const workflowRunScripts = (workflow: string): string[] => {
  const scripts: string[] = [];
  const lines = workflow.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run: \|$/.exec(lines[index]);
    if (!match) continue;
    const contentIndent = match[1].length + 2;
    const body: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === "") {
        body.push("");
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent < contentIndent) {
        index -= 1;
        break;
      }
      body.push(line.slice(contentIndent));
    }
    scripts.push(body.join("\n"));
  }
  return scripts;
};

describe("Herdr AGPL distribution compliance", () => {
  it("builds a deterministic Rust and Zig dependency-vendored source bundle", () => {
    const packager = readRepoFile(packagerPath);
    const mode = statSync(path.join(repoRoot, packagerPath)).mode;

    expect(mode & 0o111).not.toBe(0);
    expect(packager).toContain("set -euo pipefail");
    expect(packager).toContain('mktemp -d "${TMPDIR:-/tmp}/herdr-corresponding-source.XXXXXXXX"');
    expect(packager).toContain("trap 'rm -rf \"$tmp_dir\"' EXIT HUP INT TERM");
    expect(packager).toContain(`HERDR_COMMIT=${commit}`);
    expect(packager).toContain(`HERDR_COMMIT_ARCHIVE_SHA256=${commitArchiveSha}`);
    expect(packager).toContain("CARGO_VERSION=1.96.1");
    expect(packager).toContain("ZIG_VERSION=0.15.2");
    expect(packager).toContain("ZIG_PACKAGE_COUNT=36");
    expect(packager).toContain("SOURCE_DATE_EPOCH=1784133039");
    expect(packager).toContain("python3");
    expect(packager).toContain('"refs/tags/${HERDR_TAG}^{}"');
    expect(packager).toContain('mv "$tmp_dir/herdr-${HERDR_COMMIT}" "$source_root"');
    expect(packager).toContain("cargo vendor --locked --versioned-dirs vendor/cargo > .cargo/config.toml");
    expect(packager).toContain('grep -Fq \'directory = "vendor/cargo"\'');
    expect(packager).toContain("ZIG_GLOBAL_CACHE_DIR=\"$zig_global_cache\"");
    expect(packager).toContain("ZIG_LOCAL_CACHE_DIR=\"$zig_local_cache\"");
    expect(packager).toContain("zig build --fetch=all");
    for (const flag of [
      "-Demit-lib-vt",
      "-Doptimize=ReleaseFast",
      "-Dsimd=true",
      '-Dtarget="$ZIG_TARGET"',
      '-Dversion-string="$libghostty_version"',
      "-Demit-xcframework=false",
    ]) {
      expect(packager).toContain(flag);
    }
    expect(packager).toContain('cp -a "$zig_global_cache/p" "$source_root/vendor/zig-global-cache/p"');
    expect(packager).toContain("expected != actual");
    for (const packageHash of [highwayPackage, uucode01Package, uucode02Package]) {
      expect(packager).toContain(packageHash);
    }
    expect(packager).toContain("OPENHARNESS-CORRESPONDING-SOURCE.md");
    expect(packager).toContain('export ZIG_GLOBAL_CACHE_DIR="\\$PWD/vendor/zig-global-cache"');
    expect(packager).toContain("cargo build --locked --release --offline");
    expect(packager).toContain("--sort=name");
    expect(packager).toContain('--mtime="@${SOURCE_DATE_EPOCH}"');
    expect(packager).toContain("gzip -n -9");
    expect(packager).toContain('BUNDLE_NAME="herdr-${HERDR_VERSION}-corresponding-source.tar.gz"');
    expect(packager).not.toContain('find "$source_root" -type f -exec chmod 0644');
  });

  it("tracks complete vendored source without claiming byte-identical binaries", () => {
    const notice = readRepoFile(".oh/legal/herdr/NOTICE");
    const sourceOffer = readRepoFile(".oh/legal/herdr/SOURCE-OFFER");
    const license = readRepoFile(".oh/skills/herdr/LICENSE.upstream");
    const manifest = JSON.parse(readRepoFile(".oh/manifest.json")) as { include: string[] };

    expect(manifest.include).toContain("legal/**");
    for (const text of [notice, sourceOffer]) {
      expect(text).toContain(`v${version}`);
      expect(text).toContain(commit);
      expect(text).toContain(commitArchiveSha);
      expect(text).toContain(bundleSha);
      expect(text).toContain(amd64Sha);
      expect(text).toContain(arm64Sha);
      expect(text).toContain("AGPL-3.0-or-later");
      expect(text.toLowerCase()).toContain("without warranty");
      expect(text).toContain("separate work");
      expect(text).toContain("Cargo.lock");
      expect(text).toContain("vendor/cargo");
      expect(text).toContain("vendor/zig-global-cache/p");
      expect(text).toContain("36");
      expect(text).toMatch(/Cargo\s+1\.96\.1/);
      expect(text).toMatch(/Zig\s+0\.15\.2/);
      expect(text).toMatch(/vendored\s+patched portable-pty/);
      expect(text).toMatch(/does not claim|No claim/i);
      expect(text).toMatch(/byte-identical/i);
    }
    expect(notice).toContain("unmodified Herdr v0.7.4");
    expect(sourceOffer).toContain("checksum-verifiable");
    expect(sourceOffer).toContain("not described as an\nimmutable storage guarantee");
    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  });

  it("pins the architecture-specific Zig source environment and embeds its output", () => {
    const dockerfile = readRepoFile(".devcontainer/Dockerfile");

    expect(dockerfile).toContain("FROM rust:1.96.1-bookworm AS herdr-source-packager");
    expect(dockerfile).toContain("ARG ZIG_VERSION=0.15.2");
    expect(dockerfile).toContain("python3 xz-utils");
    expect(dockerfile).toContain(zigAmd64Sha);
    expect(dockerfile).toContain(zigArm64Sha);
    expect(dockerfile).toContain('zig_arch=x86_64');
    expect(dockerfile).toContain('zig_arch=aarch64');
    expect(dockerfile).toContain('test "$(zig version)" = "$ZIG_VERSION"');
    expect(dockerfile).toContain(`COPY ${packagerPath} /usr/local/bin/package-herdr-corresponding-source`);
    expect(dockerfile).toContain("package-herdr-corresponding-source /out");
    expect(dockerfile).toContain(`ARG HERDR_VERSION=${version}`);
    expect(dockerfile).toContain(`ARG HERDR_COMMIT=${commit}`);
    expect(dockerfile).toContain(`ARG HERDR_CORRESPONDING_SOURCE_SHA256=${bundleSha}`);
    expect(dockerfile).toContain("COPY --from=herdr-source-packager");
    expect(dockerfile).toContain(`/out/${bundleName}.sha256`);
    expect(dockerfile).toContain("sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256");
    expect(dockerfile).toContain("vendor/cargo");
    expect(dockerfile).toContain("vendor/zig-global-cache/p");
    expect(dockerfile).toContain(`dev.openharness.herdr.source.path="${sourcePath}"`);
    expect(dockerfile).toContain(
      `dev.openharness.herdr.source.checksum.path="${sourcePath}.sha256"`,
    );
  });

  it("labels Open Harness provenance and actual component source metadata", () => {
    const dockerfile = readRepoFile(".devcontainer/Dockerfile");

    for (const label of [
      "org.opencontainers.image.version",
      "org.opencontainers.image.revision",
      "org.opencontainers.image.created",
      "org.opencontainers.image.source",
      "dev.openharness.herdr.version",
      "dev.openharness.herdr.license",
      "dev.openharness.herdr.commit",
      "dev.openharness.herdr.source.path",
      "dev.openharness.herdr.source.checksum.path",
      "dev.openharness.herdr.source.sha256",
      "dev.openharness.herdr.source.url",
      "dev.openharness.herdr.binary.amd64.sha256",
      "dev.openharness.herdr.binary.arm64.sha256",
      "dev.openharness.herdr.aggregate",
    ]) {
      expect(dockerfile).toContain(label);
    }
    expect(dockerfile).toContain('dev.openharness.herdr.license="AGPL-3.0-or-later"');
    expect(dockerfile).toContain(
      'dev.openharness.herdr.source.sha256="${HERDR_CORRESPONDING_SOURCE_SHA256}"',
    );
  });

  it("keeps source-first, retry-safe publication and exact five-asset comparisons", () => {
    const release = readRepoFile(".github/workflows/release.yml");

    expect(release).toContain("group: openharness-release");
    expect(release).toContain("cancel-in-progress: false");
    expect(release.match(/docker buildx build --load/g)).toHaveLength(2);
    expect(release).toContain("--target herdr-source-packager");
    expect(release).toContain("Reuse the source-packager layers from the metadata target build.");
    expect(release).toContain('docker create --name "$PACKAGER_CONTAINER" "$PACKAGER_IMAGE"');
    expect(release).toContain('docker cp "$PACKAGER_CONTAINER:/out/." "$RUNNER_TEMP/"');
    expect(release).toContain(`CANONICAL_BUNDLE_SHA=${bundleSha}`);
    expect(release).toContain('test "$BUNDLE_SHA" = "$CANONICAL_BUNDLE_SHA"');
    expect(release).toContain('--build-arg "HERDR_CORRESPONDING_SOURCE_SHA256=${{ steps.metadata.outputs.bundle_sha }}"');
    expect(release).toContain('CREATED=$(git show -s --format=%cI "$GITHUB_SHA")');
    expect(release).toContain(bundleName);
    expect(release).toContain("Existing release asset differs; refusing overwrite");
    expect(release).not.toContain("overwrite_files: true");
    expect(release).not.toContain('docker manifest inspect "$IMAGE"');
    expect(release).toContain("Distinguish a confirmed 404 from auth/network/registry failures");
    expect(release).toContain('manifest_status=$(curl --silent --show-error');
    expect(release).toContain('200)');
    expect(release).toContain('404)');
    expect(release).toContain('Indeterminate GHCR manifest response ${manifest_status}; refusing version-tag push');
    expect(release).toMatch(/404\)\n[\s\S]*?docker push "\$IMAGE"/);
    expect(release).toContain("Version tag already exists; verifying and reusing it without overwrite");
    expect(release).toContain('test "$remote_revision" = "$GITHUB_SHA"');
    expect(release).toContain('test "$remote_source_sha" = "$EXPECTED_SOURCE_SHA"');
    expect(release).toContain('docker tag "$IMAGE" "$LATEST"');
    expect(release).toContain('docker push "$LATEST"');
    expect(release).toContain('test "${version_digest#*@}" = "${latest_digest#*@}"');
    expect(release).toContain('for published_image in "$IMAGE" "$LATEST"');

    for (const artifact of ["archive", "checksum", "license", "notice", "source_offer"]) {
      expect(release).toContain(`ensure_asset "\${{ steps.metadata.outputs.${artifact} }}"`);
    }

    const prepushAssetBlock = release.slice(
      release.indexOf("- name: Verify all five Herdr assets before image push"),
      release.indexOf("- name: Reuse or push version image, then push latest from it"),
    );
    const exactCmpLines = prepushAssetBlock
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("cmp "));
    expect(exactCmpLines).toEqual([
      'cmp "$VERIFY_DIR/herdr-0.7.4-corresponding-source.tar.gz" "${{ steps.metadata.outputs.archive }}"',
      'cmp "$VERIFY_DIR/herdr-0.7.4-corresponding-source.tar.gz.sha256" "${{ steps.metadata.outputs.checksum }}"',
      'cmp "$VERIFY_DIR/herdr-0.7.4-LICENSE" "${{ steps.metadata.outputs.license }}"',
      'cmp "$VERIFY_DIR/herdr-0.7.4-NOTICE" "${{ steps.metadata.outputs.notice }}"',
      'cmp "$VERIFY_DIR/herdr-0.7.4-SOURCE-OFFER" "${{ steps.metadata.outputs.source_offer }}"',
    ]);

    expect(release).not.toMatch(/tar -tzf[^\n]*\|/);
    expect(release).toContain(`sha256sum -c ${bundleName}.sha256`);
    expectOrdered(release, [
      "Package Herdr corresponding source with pinned Docker source stage",
      "Build Docker image",
      "Smoke-test Docker image before publish",
      "Verify Herdr legal payload and image labels before publish",
      "Publish or reuse byte-identical Herdr source assets",
      "Verify all five Herdr assets before image push",
      "Reuse or push version image, then push latest from it",
      "Verify remote image and release assets",
    ]);
  });

  it("parses every release run block with bash -eo pipefail", () => {
    const scripts = workflowRunScripts(readRepoFile(".github/workflows/release.yml"));
    expect(scripts.length).toBeGreaterThanOrEqual(10);
    for (const script of scripts) {
      const result = spawnSync("bash", ["-eo", "pipefail", "-n"], {
        cwd: repoRoot,
        input: script,
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    }
  });

  it("smokes the canonical checksum and both locked dependency stores", () => {
    const smoke = readRepoFile(".oh/scripts/sandbox-boot-smoke.sh");

    expect(smoke).toContain("test -r /usr/share/doc/herdr/LICENSE");
    expect(smoke).toContain("test -r /usr/share/doc/herdr/NOTICE");
    expect(smoke).toContain("test -r /usr/share/doc/herdr/SOURCE-OFFER");
    expect(smoke).toContain(bundleSha);
    expect(smoke).toContain(`${bundleName}.sha256`);
    expect(smoke).toContain("sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256");
    expect(smoke).toContain("vendor/cargo");
    expect(smoke).toContain("vendor/zig-global-cache/p");
    expect(smoke).toContain("-eq 36");
    expect(smoke).not.toMatch(/tar -tzf[^\n]*\|/);
  });
});
