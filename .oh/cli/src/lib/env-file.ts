import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { loadEnvInto } from "./env.js";

/**
 * `.devcontainer/.env` access for the CLI — the ONE place that reads a config
 * value, seeds the file, or edits an `INSTALL_*` flag.
 *
 * Replaces `lib/harness-yaml.ts`. `harness.yaml` was removed because every key
 * it mapped already existed as a compose env var with a default, and because it
 * was invisible on the VS Code "Reopen in Container" path — that path names
 * `.devcontainer/docker-compose.yml` directly, so compose auto-loads
 * `.devcontainer/.env` and nothing in `harness.yaml` ever applied. `.env` is now
 * the one surface, on EVERY path, and this module is the one writer.
 *
 * READS DO NOT ADD A PARSER. `readEnvValue` goes through `loadEnvInto`
 * (`./env.ts`), the existing reader compose-argv construction already uses, so
 * the CLI and the shell wrapper agree on the grammar by construction.
 *
 * THE GRAMMAR THE WRITER MUST RESPECT (Docker Compose env-file format):
 *   - a key is `KEY=value` at column 0, no `export`,
 *   - a full-line comment (first non-space char `#`) is ignored,
 *   - the value runs to end of line; `#` in a value is NOT a comment.
 *
 * Every optional key ships COMMENTED in `.devcontainer/.example.env`:
 *
 *     # INSTALL_OPENCODE=false        # OpenCode CLI (build arg)
 *
 * so enabling one means UNCOMMENTING THAT LINE IN PLACE — not appending a
 * second `INSTALL_OPENCODE=`, which would leave two keys the parser reads
 * first-wins and a diff no reviewer can follow.
 */

/** The env file, relative to the project root. */
const ENV_FILE = ".devcontainer/.env";
/** The tracked template the env file is seeded from. */
const ENV_EXAMPLE = ".devcontainer/.example.env";

/**
 * Path-escape guard for every writer in this module: the resolved destination
 * MUST be inside the project root. Moved verbatim from `harness-yaml.ts`, where
 * it guarded the harness.yaml seed; `setInstallFlag` reuses the same invariant.
 */
export function assertInRoot(dest: string, root: string): void {
  if (!(dest === root || dest.startsWith(root + sep))) {
    throw new Error(`refusing to write outside the project root: ${dest}`);
  }
}

/** Absolute path to `<root>/.devcontainer/.env`. */
export function envFilePath(root: string): string {
  return resolve(root, ENV_FILE);
}

/**
 * Copy `.devcontainer/.example.env` → `.devcontainer/.env` when the example
 * exists and the target is missing.
 *
 * Returns `true` only when it wrote, so the caller emits exactly one
 * operation-log line and stays silent otherwise.
 */
export function seedEnvFile(root: string): boolean {
  const dest = envFilePath(root);
  const example = resolve(root, ENV_EXAMPLE);
  assertInRoot(dest, root);
  if (existsSync(dest) || !existsSync(example)) return false;
  copyFileSync(example, dest);
  return true;
}

/**
 * Read one key from `.devcontainer/.env`, or `undefined` when it is unset,
 * empty, or the file is absent.
 *
 * The env-file path is derived from `root`, never from the CWD — the same
 * invariant `readConfigValue` documented in `harness-yaml.ts`. A CWD-relative
 * lookup would make every value look unset from a nested directory.
 */
export function readEnvValue(root: string, key: string): string | undefined {
  const file = envFilePath(root);
  if (!existsSync(file)) return undefined;
  const env: Record<string, string | undefined> = {};
  loadEnvInto(file, env);
  const value = env[key]?.trim();
  return value === undefined || value === "" ? undefined : stripQuotes(value);
}

/** Strip one layer of matching enclosing quotes, as compose does. */
function stripQuotes(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** The `INSTALL_*` env var an install key maps to (`grok_build` → `INSTALL_GROK_BUILD`). */
export function installEnvKey(key: string): string {
  return `INSTALL_${key.toUpperCase()}`;
}

/** Whether `INSTALL_<KEY>` currently reads as truthy. */
export function isInstallFlagEnabled(root: string, key: string): boolean {
  return readEnvValue(root, installEnvKey(key)) === "true";
}

/** What a write did, so the caller can report it precisely. */
export type InstallFlagOutcome =
  /** The key already held the value; the file was not touched. */
  | "already-set"
  /** A commented template line was uncommented in place. */
  | "uncommented"
  /** An existing key's value was changed. */
  | "updated"
  /** A new key line was appended. */
  | "added";

/**
 * Enable `INSTALL_<KEY>=true` in `<root>/.devcontainer/.env` with the smallest
 * possible diff, and report which of the four cases applied.
 *
 * Idempotent: calling it on an already-`true` key returns `already-set` and
 * writes nothing.
 */
export function setInstallFlag(root: string, key: string): InstallFlagOutcome {
  return setEnvValue(root, installEnvKey(key), "true");
}

/**
 * Set one key in `<root>/.devcontainer/.env`, seeding the file from the
 * template first when it does not exist yet.
 *
 * Resolution order:
 *
 *   1. a live `KEY=<value>` line       → rewrite the value (or `already-set`)
 *   2. a commented `# KEY=<value>` line → UNCOMMENT IN PLACE, keeping the line
 *      index and any trailing prose, so the diff is one character class
 *   3. neither                          → append the key
 */
export function setEnvValue(root: string, key: string, value: string): InstallFlagOutcome {
  const file = envFilePath(root);
  assertInRoot(file, root);
  seedEnvFile(root);
  const original = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { content, outcome } = setKeyInEnv(original, key, value);
  if (content !== original) writeFileSync(file, content, { mode: 0o600 });
  return outcome;
}

/** The result of a content-level write: the new text and what happened. */
export interface SetKeyResult {
  content: string;
  outcome: InstallFlagOutcome;
}

/**
 * THE ONE `.env` LINE EDITOR. Pure — takes file text, returns file text — so
 * both the file-level writer (`setEnvValue`) and `oh init`'s wizard, which
 * batches several keys through one read/write pair and must also support
 * `--dry-run`, share exactly one implementation of the grammar.
 *
 * Idempotent: a key already holding `value` returns `already-set` with the
 * content unchanged.
 */
export function setKeyInEnv(content: string, key: string, value: string): SetKeyResult {
  const lines = content.split("\n");
  const live = new RegExp(`^${escapeRegExp(key)}=(.*)$`);
  // The commented template form: `# INSTALL_OPENCODE=false   # OpenCode CLI`.
  const commented = new RegExp(`^[ \\t]*#[ \\t]*${escapeRegExp(key)}=(.*)$`);

  for (let i = 0; i < lines.length; i++) {
    const m = live.exec(lines[i]);
    if (m) {
      if (stripQuotes(m[1].trim()) === value) return { content, outcome: "already-set" };
      lines[i] = `${key}=${value}`;
      return { content: lines.join("\n"), outcome: "updated" };
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (commented.test(lines[i])) {
      // Uncomment in place: same line index, so the file keeps its line count
      // and the surrounding prose still reads correctly.
      lines[i] = `${key}=${value}`;
      return { content: lines.join("\n"), outcome: "uncommented" };
    }
  }

  // Named nowhere — append, keeping exactly one trailing newline on the file.
  const body = content.replace(/\n+$/, "");
  return {
    content: body === "" ? `${key}=${value}\n` : `${body}\n${key}=${value}\n`,
    outcome: "added",
  };
}

/** Escape a literal for embedding in a RegExp — keys are `[A-Z_]`, but do not assume. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
