import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { LifecycleRunner } from "./execution/runner.js";

/**
 * `harness.yaml` access for the CLI — the ONE place that reads a config value,
 * seeds the file, or edits an `install:` flag.
 *
 * Extracted from `../commands/lifecycle.ts` (issue: `oh harness`), where
 * `seedHarnessYaml`, `assertInRoot`, and `configuredContainerName` were private
 * and would otherwise have been copied. The precedent for extract-and-re-export
 * is `execution/runner.ts`, pulled out of `lifecycle.ts` the same way; that
 * module re-exports its types for back-compat and so does this one's caller.
 *
 * READS NEVER PARSE YAML HERE. `.oh/scripts/harness-config.sh` is the vendored
 * parser and stays the single source of truth for the grammar; this module
 * shells out to it. The one thing the script deliberately cannot do is WRITE —
 * its modes are `env|compose-overrides|get`, read-only by design — so
 * `setKeyInSection` is the minimal-diff line editor that fills that gap without
 * adding a `set` mode to the script or re-implementing its parser in TS. It is
 * the ONLY writer — `oh init`'s wizard calls it too, rather than carrying the
 * second, section-blind regex editor it used to have.
 *
 * THE GRAMMAR THE WRITER MUST RESPECT (from harness-config.sh's awk program):
 *   - a section header is `name:` at COLUMN 0 with no value,
 *   - a key is at EXACTLY 2-space indent: `  opencode: true`,
 *   - a full-line comment (first non-space char `#`) is ignored,
 *   - a trailing ` # comment` is stripped from the value.
 *
 * Every `install:` key ships COMMENTED in `harness.yaml.example`:
 *
 *     install:
 *       # opencode: false            # INSTALL_OPENCODE — OpenCode CLI (build arg)
 *
 * so enabling one means UNCOMMENTING THAT LINE IN PLACE and preserving its
 * trailing comment — not appending a second `opencode:` key, which would leave
 * two keys the parser reads last-wins and a diff no reviewer can follow.
 */

/** The `harness.yaml` filename, relative to the project root. */
const HARNESS_YAML = "harness.yaml";
/** The tracked template `harness.yaml` is seeded from. */
const HARNESS_YAML_EXAMPLE = "harness.yaml.example";

/**
 * Path-escape guard for every writer in this module: the resolved destination
 * MUST be inside the project root. Moved verbatim from `lifecycle.ts`, where it
 * guarded the harness.yaml seed; `setInstallFlag` reuses the same invariant.
 */
export function assertInRoot(dest: string, root: string): void {
  if (!(dest === root || dest.startsWith(root + sep))) {
    throw new Error(`refusing to write outside the project root: ${dest}`);
  }
}

/** Absolute path to `<root>/harness.yaml`. */
export function harnessYamlPath(root: string): string {
  return resolve(root, HARNESS_YAML);
}

/**
 * Copy `harness.yaml.example` → `harness.yaml` when the example exists and the
 * target is missing — parity with `make harness-config` for source-repo-style
 * checkouts. `oh init`-equipped repos already have harness.yaml, so this is a
 * no-op there.
 *
 * Returns `true` only when it wrote, so the caller emits exactly one
 * operation-log line and stays silent otherwise.
 */
export function seedHarnessYaml(root: string): boolean {
  const dest = harnessYamlPath(root);
  const example = resolve(root, HARNESS_YAML_EXAMPLE);
  assertInRoot(dest, root);
  if (existsSync(dest) || !existsSync(example)) return false;
  copyFileSync(example, dest);
  return true;
}

/**
 * Read one `section.key` through the vendored parser, or `undefined` when it is
 * unset, the file is absent, or the script is missing.
 *
 * The harness.yaml path argument is MANDATORY AND EXPLICIT. `harness-config.sh
 * get` defaults to a CWD-relative `harness.yaml` and silently exits 0 with no
 * output when that file is absent, so from a nested cwd an implicit path would
 * make every value look unset. This is the same contract `configuredContainerName`
 * documents in `lifecycle.ts`.
 */
export function readConfigValue(
  root: string,
  key: string,
  run: LifecycleRunner,
): string | undefined {
  const script = join(root, ".oh", "scripts", "harness-config.sh");
  const file = harnessYamlPath(root);
  if (!existsSync(script) || !existsSync(file)) return undefined;
  const r = run("sh", [script, "get", key, file], { stdio: "capture" });
  if (r.error || r.status !== 0) return undefined;
  const value = (r.stdout ?? "").trim();
  return value === "" ? undefined : value;
}

/** Whether `install.<key>` currently reads as truthy. */
export function isInstallFlagEnabled(root: string, key: string, run: LifecycleRunner): boolean {
  return readConfigValue(root, `install.${key}`, run) === "true";
}

/** What a write did, so the caller can report it precisely. */
export type InstallFlagOutcome =
  /** The key already read `true`; the file was not touched. */
  | "already-set"
  /** A commented template line was uncommented in place. */
  | "uncommented"
  /** An existing key's value was changed to `true`. */
  | "updated"
  /** A new key line was added under an existing `install:` section. */
  | "added"
  /** The `install:` section did not exist and was appended with the key. */
  | "section-added";

/**
 * Enable `install.<key>: true` in `<root>/harness.yaml` with the smallest
 * possible diff, and report which of the five cases applied.
 *
 * Resolution order inside the `install:` section:
 *
 *   1. a live `  <key>: <value>` line       → rewrite the value (or no-op)
 *   2. a commented `  # <key>: <value>` line → UNCOMMENT IN PLACE, keeping the
 *      trailing ` # INSTALL_X — …` comment, so the line count is unchanged and
 *      the diff is one character class
 *   3. neither                               → insert a new key line
 *   4. no `install:` section at all          → append the section plus the key
 *
 * Idempotent: calling it on an already-`true` key returns `already-set` and
 * writes nothing.
 */
export function setInstallFlag(root: string, key: string): InstallFlagOutcome {
  const file = harnessYamlPath(root);
  assertInRoot(file, root);
  if (!existsSync(file)) {
    throw new Error(`harness.yaml not found at ${file}`);
  }

  const original = readFileSync(file, "utf8");
  const { content, outcome } = setKeyInSection(original, "install", key, "true");
  if (content !== original) writeFileSync(file, content);
  return outcome;
}

/** The result of a content-level write: the new text and what happened. */
export interface SetKeyResult {
  content: string;
  outcome: InstallFlagOutcome;
}

/**
 * THE ONE `harness.yaml` LINE EDITOR. Pure — takes file text, returns file text
 * — so both the file-level writer (`setInstallFlag`) and `oh init`'s wizard,
 * which batches several keys through one read/write pair and must also support
 * `--dry-run`, share exactly one implementation of the grammar.
 *
 * It replaced a second, section-blind regex editor that lived in
 * `commands/init.ts`. The two disagreed on the missing-key case — that one
 * silently no-opped, so a wizard answer for a key absent from the template was
 * dropped without a word. This one is authoritative and always records the key.
 *
 * Resolution order, scoped to the named section:
 *
 *   1. a live `  <key>: <value>` line       → rewrite the value (or `already-set`)
 *   2. a commented `  # <key>: <value>` line → UNCOMMENT IN PLACE, keeping the
 *      trailing ` # ENV_VAR — …` comment, so the line count is unchanged and
 *      the diff is one character class
 *   3. neither                               → insert a new key line
 *   4. no such section at all                → append the section plus the key
 *
 * Idempotent: a key already holding `value` returns `already-set` with the
 * content unchanged.
 */
export function setKeyInSection(
  content: string,
  section: string,
  key: string,
  value: string,
): SetKeyResult {
  const lines = content.split("\n");

  // A section header is `name:` at column 0 with no value (harness-config.sh's
  // awk matches exactly this). Find the target section and its body extent.
  const sectionHeader = /^[a-zA-Z_][a-zA-Z0-9_]*:[ \t]*(#.*)?$/;
  const headerRe = new RegExp(`^${escapeRegExp(section)}:[ \\t]*(#.*)?$`);
  const start = lines.findIndex((l) => headerRe.test(l));

  if (start === -1) {
    // No such section. Append it with the key, keeping exactly one trailing
    // newline on the file.
    const body = content.replace(/\n+$/, "");
    return {
      content: `${body}\n\n${section}:\n  ${key}: ${value}\n`,
      outcome: "section-added",
    };
  }

  // The section ends at the next column-0 header, or at end of file.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (sectionHeader.test(lines[i])) {
      end = i;
      break;
    }
  }

  // A live key at exactly 2-space indent, capturing the value and any trailing
  // comment so the comment survives a value rewrite.
  const liveKey = new RegExp(`^  ${escapeRegExp(key)}:[ \\t]*([^#\\n]*)(#.*)?$`);
  // The commented template form: `  # opencode: false   # INSTALL_OPENCODE — …`.
  // The leading indent is whatever the template uses; the REPLACEMENT always
  // normalizes to the 2-space indent the parser requires.
  const commentedKey = new RegExp(`^[ \\t]*#[ \\t]*${escapeRegExp(key)}:[ \\t]*([^#\\n]*)(#.*)?$`);

  for (let i = start + 1; i < end; i++) {
    const live = liveKey.exec(lines[i]);
    if (live) {
      if (live[1].trim() === value) return { content, outcome: "already-set" };
      const trailing = live[2] ? `            ${live[2]}` : "";
      lines[i] = `  ${key}: ${value}${trailing}`;
      return { content: lines.join("\n"), outcome: "updated" };
    }
  }

  for (let i = start + 1; i < end; i++) {
    const commented = commentedKey.exec(lines[i]);
    if (commented) {
      // Uncomment in place: same line index, same trailing comment, so the file
      // keeps its line count and the diff is a single line.
      const trailing = commented[2] ? `            ${commented[2]}` : "";
      lines[i] = `  ${key}: ${value}${trailing}`;
      return { content: lines.join("\n"), outcome: "uncommented" };
    }
  }

  // The section exists but names this key nowhere — insert it as the first
  // entry of the section body.
  lines.splice(start + 1, 0, `  ${key}: ${value}`);
  return { content: lines.join("\n"), outcome: "added" };
}

/** Escape a literal for embedding in a RegExp — keys are `[a-z_]`, but do not assume. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
