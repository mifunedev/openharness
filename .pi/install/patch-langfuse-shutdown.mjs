#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PI_LANGFUSE_VERSION = "1.5.9";
export const PI_LANGFUSE_INTEGRITY =
  "sha512-DfR09qKC3iMgDaV34v7H/wH/058rW16OO+8tAiAcIe1CRHpVnHGZvPd7vzUj3P+ShJIW/9mrxsowqDC/y80qRg==";
export const PATCH_MARKER = "Open Harness: classify pi-langfuse shutdown AbortError";
export const SOURCE_RELATIVE_PATH = "src/langfuse.ts";

export const VULNERABLE_SHUTDOWN_BLOCK = `    } catch (e) {
      rememberRuntimeError("runtime shutdown", e);
      console.warn("📊 Langfuse: Failed to flush/shutdown cleanly", e);
    }`;

export const PATCHED_SHUTDOWN_BLOCK = `    } catch (e) {
      // ${PATCH_MARKER} as an expected bounded timeout.
      const isExpectedShutdownAbort =
        controller.signal.aborted &&
        e === controller.signal.reason &&
        e instanceof Error &&
        e.name === "AbortError";
      if (isExpectedShutdownAbort) {
        debugLog("📊 Langfuse: Shutdown deadline reached before telemetry completed");
      } else {
        rememberRuntimeError("runtime shutdown", e);
        console.warn("📊 Langfuse: Failed to flush/shutdown cleanly", e);
      }
    }`;

// This fingerprints the reviewed shutdown branch without vendoring the external
// package. npm's lockfile verifies the package tarball; this guard verifies the
// exact source region that Open Harness is allowed to modify.
const EXPECTED_VULNERABLE_BLOCK_SHA256 =
  "eef539f04a884e812afa5bf254a7b722601b2602f09f0bc0cb751b7d56b77119";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countOccurrences(source, fragment) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(fragment, offset);
    if (index === -1) {
      return count;
    }
    count += 1;
    offset = index + fragment.length;
  }
}

function packageError(message) {
  return new Error(`pi-langfuse shutdown patch: ${message}`);
}

export function patchLangfusePackage(packageRoot) {
  const root = resolve(packageRoot);
  const packageJsonPath = join(root, "package.json");
  const sourcePath = join(root, SOURCE_RELATIVE_PATH);
  const packageLockPath = join(root, "..", "..", "package-lock.json");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw packageError(`cannot read ${packageJsonPath}: ${error.message}`);
  }

  if (manifest.name !== "pi-langfuse" || manifest.version !== PI_LANGFUSE_VERSION) {
    throw packageError(
      `expected pi-langfuse@${PI_LANGFUSE_VERSION}, found ${manifest.name ?? "unknown"}@${manifest.version ?? "unknown"}`,
    );
  }

  let lockfile;
  try {
    lockfile = JSON.parse(readFileSync(packageLockPath, "utf8"));
  } catch (error) {
    throw packageError(`cannot read ${packageLockPath}: ${error.message}`);
  }
  const lockEntry = lockfile.packages?.["node_modules/pi-langfuse"];
  if (
    lockEntry?.version !== PI_LANGFUSE_VERSION ||
    lockEntry?.integrity !== PI_LANGFUSE_INTEGRITY
  ) {
    throw packageError(
      `npm lockfile does not contain the reviewed pi-langfuse@${PI_LANGFUSE_VERSION} tarball integrity`,
    );
  }

  let source;
  try {
    source = readFileSync(sourcePath, "utf8");
  } catch (error) {
    throw packageError(`cannot read ${sourcePath}: ${error.message}`);
  }

  if (source.includes(PATCH_MARKER)) {
    if (countOccurrences(source, PATCHED_SHUTDOWN_BLOCK) !== 1) {
      throw packageError("patch marker exists but the expected patched shutdown branch is not unique");
    }
    return { changed: false, sourcePath };
  }

  const vulnerableBlockOffset = source.indexOf(VULNERABLE_SHUTDOWN_BLOCK);
  if (countOccurrences(source, VULNERABLE_SHUTDOWN_BLOCK) !== 1) {
    throw packageError(
      "installed source does not match the reviewed shutdown branch; refusing to patch an unknown package",
    );
  }
  const installedVulnerableBlock = source.slice(
    vulnerableBlockOffset,
    vulnerableBlockOffset + VULNERABLE_SHUTDOWN_BLOCK.length,
  );
  if (sha256(installedVulnerableBlock) !== EXPECTED_VULNERABLE_BLOCK_SHA256) {
    throw packageError("installed shutdown branch checksum does not match the reviewed source");
  }

  const patchedSource = source.replace(VULNERABLE_SHUTDOWN_BLOCK, PATCHED_SHUTDOWN_BLOCK);
  const mode = statSync(sourcePath).mode & 0o777;
  const temporaryPath = `${sourcePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, patchedSource, { mode });
    chmodSync(temporaryPath, mode);
    renameSync(temporaryPath, sourcePath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write error.
    }
    throw packageError(`cannot atomically write ${sourcePath}: ${error.message}`);
  }

  return { changed: true, sourcePath };
}

function main() {
  const [packageRoot] = process.argv.slice(2);
  if (!packageRoot) {
    throw packageError(`usage: node ${process.argv[1]} <pi-langfuse-package-root>`);
  }

  const result = patchLangfusePackage(packageRoot);
  console.log(`${result.changed ? "Patched" : "Already patched"} ${result.sourcePath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
