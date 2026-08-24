import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const WORKFLOW = join(ROOT, ".github", "workflows", "release.yml");

// The exact CHANGELOG shape that broke the v0.1.0 release: a populated
// versioned section sitting under an EMPTY [Unreleased]. Both fallbacks are
// therefore unavailable, so only a correct versioned match yields notes.
const CHANGELOG = `# Changelog

Format follows Keep a Changelog.

## [Unreleased]

## [0.1.0] - 2026-08-23

### Changed
- The versioned section body.
- A second line.

## [2026.7.26] - 2026-07-26

### Added
- An older release nobody should extract.
`;

let fixture = "";

/**
 * Run an extraction expression the way the workflow does. `escapeStrings`
 * models the awk implementation: gawk drops an invalid `\[` escape inside a
 * string literal, mawk keeps it. The runner is gawk, so that is the semantics
 * a regression test must assert against — this sandbox's awk is mawk and
 * silently passes the broken expression.
 */
function extract(source: "workflow" | "legacy-dynamic-regex", version: string, gawkSemantics = true) {
  const changelog = join(fixture, "CHANGELOG.md");
  writeFileSync(changelog, CHANGELOG, "utf8");

  if (source === "workflow") {
    const program = workflowProgram();
    return execFileSync("awk", ["-v", `hdr=## [${version}] - `, program, changelog], {
      encoding: "utf8",
    });
  }

  // The pre-fix expression, with the escape resolved as the named awk would.
  const bracket = gawkSemantics ? ["[", "]"] : ["\\[", "\\]"];
  const legacy = `
    $0 ~ ("^## ${bracket[0]}" ver "${bracket[1]} - ") { in_block=1; next }
    in_block && /^## \\[/ { exit }
    in_block && /^---[[:space:]]*$/ { exit }
    in_block { print }
  `;
  return execFileSync("awk", ["-v", `ver=${version}`, legacy, changelog], { encoding: "utf8" });
}

/** Lift the awk program out of the workflow so the test cannot drift from it. */
function workflowProgram() {
  const source = readFileSync(WORKFLOW, "utf8");
  const match = /awk -v hdr="## \$\{?RELEASE_VERSION\}?\] - "?[^\n]*\n([\s\S]*?)\n\s*' CHANGELOG\.md/.exec(
    source,
  );
  // Fall back to a direct slice between the awk invocation and its closing quote.
  const begin = source.indexOf(`awk -v hdr=`);
  const end = source.indexOf("' CHANGELOG.md", begin);
  expect(begin, "workflow no longer invokes awk with an hdr variable").toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const body = match?.[1] ?? source.slice(source.indexOf("'", begin) + 1, end);
  return body;
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "release-notes-"));
});

afterEach(() => {
  rmSync(fixture, { force: true, recursive: true });
});

describe("release notes extraction", () => {
  it("extracts the versioned section when [Unreleased] is empty", () => {
    const notes = extract("workflow", "0.1.0");

    expect(notes).toContain("The versioned section body.");
    expect(notes).toContain("A second line.");
    // It must stop at the next heading, never bleed into an older release.
    expect(notes).not.toContain("An older release nobody should extract.");
  });

  it("returns nothing for a version with no section", () => {
    expect(extract("workflow", "9.9.9").trim()).toBe("");
  });

  it("matches the heading literally, so regex metacharacters cannot widen it", () => {
    // Under the broken character-class pattern `0.1.0` also matched `0`, `.`
    // and `1`; a literal prefix must reject a near-miss version outright.
    expect(extract("workflow", "0").trim()).toBe("");
    expect(extract("workflow", "1").trim()).toBe("");
  });

  // Verification by rejection: the expression this replaced must FAIL the
  // first assertion under the runner's awk. Without this, the fix is unproven.
  it("the pre-fix dynamic regex extracts nothing under gawk semantics", () => {
    expect(extract("legacy-dynamic-regex", "0.1.0", true).trim()).toBe("");
  });

  it("the pre-fix dynamic regex passes under mawk semantics, which is why it hid", () => {
    expect(extract("legacy-dynamic-regex", "0.1.0", false)).toContain("The versioned section body.");
  });

  it("the workflow builds no dynamic regex for the versioned heading", () => {
    const source = readFileSync(WORKFLOW, "utf8");
    // Strip comments: the block deliberately quotes the broken pattern to
    // explain why it was replaced, and that prose is not executable code.
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    expect(source).toContain('awk -v hdr="## [$RELEASE_VERSION] - "');
    expect(source).toContain("index($0, hdr) == 1");
    expect(code).not.toContain('("^## \\[" ver');
    expect(code).not.toMatch(/\$0 ~ \(/);
    // The [Unreleased] fallback is a regex LITERAL and stays as it is.
    expect(source).toContain("/^## \\[Unreleased\\]$/");
    expect(source).toContain("see CHANGELOG.md and commit history.");
  });
});
