import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The declared `.oh/` payload contract: an allowlist of glob patterns to ship
 * (`include`) minus an explicit denylist (`exclude`). All patterns are POSIX
 * `/`-separated and relative to `.oh/`. `exclude` always wins over `include`.
 */
export interface Manifest {
  include: string[];
  exclude: string[];
}

/** Regex-special characters that must be backslash-escaped to match literally. */
const REGEX_SPECIAL = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

/**
 * Translate a POSIX glob into an anchored (`^...$`) RegExp with these EXACT,
 * documented semantics (US-003 unit-tests them directly):
 *
 *  - a `**\/` token translates to `(?:.*\/)?` — matches zero-or-more leading
 *    segments, so a leading `**\/` ALSO matches zero leading segments
 *    (`**\/node_modules\/**` matches BOTH `node_modules/x` and `cli/node_modules/x`);
 *  - a standalone `**` (not followed by `/`) translates to `.*` (cross-segment,
 *    includes `/`);
 *  - a single `*` translates to `[^/]*` (within one segment, excludes `/`);
 *  - every regex-special char among `.+?^${}()|[]\` is backslash-escaped;
 *  - a literal `/` stays `/`.
 *
 * A pattern with NO wildcard is therefore an EXACT match
 * (e.g. `README.md` -> /^README\.md$/, matching 'README.md' but NOT 'cli/README.md').
 *
 * The glob is processed left-to-right via an index walk so the two-char `**`
 * token is detected before the one-char `*` (a sequential String.replace could
 * double-translate `**` -> `.*` -> ...).
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
    } else if (glob.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else {
      const ch = glob[i];
      out += REGEX_SPECIAL.has(ch) ? '\\' + ch : ch;
      i += 1;
    }
  }
  return new RegExp('^' + out + '$');
}

/**
 * True IFF `relpath` matches at least one `manifest.include` pattern AND zero
 * `manifest.exclude` patterns (exclude WINS over include). `relpath` is a POSIX
 * `/`-separated path relative to `.oh/` (e.g. 'cli/src/cli.ts', 'manifest.json').
 */
export function shouldShip(relpath: string, manifest: Manifest): boolean {
  const included = manifest.include.some((pattern) => globToRegExp(pattern).test(relpath));
  if (!included) {
    return false;
  }
  const excluded = manifest.exclude.some((pattern) => globToRegExp(pattern).test(relpath));
  return !excluded;
}

/**
 * Read `<fromOh>/manifest.json` (via readFileSync + JSON.parse inside try/catch).
 *
 * Returns `null` (-> caller back-compat legacy-mode) when the file is ABSENT,
 * unparseable, its parsed value lacks an array `include`, OR `include` is an
 * EMPTY array. (An empty allowlist would make `shouldShip` return false for
 * everything and silently ship NOTHING — a hollow-out footgun; treating it as
 * 'no manifest' instead surfaces the caller's legacy-mode warning.)
 *
 * On success returns `{ include, exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [] }`
 * (a missing `exclude` is tolerated as `[]`). NEVER throws.
 */
export function loadManifest(fromOh: string): Manifest | null {
  try {
    const manifestPath = path.resolve(fromOh, 'manifest.json');
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.include) || parsed.include.length === 0) {
      return null;
    }
    return {
      include: parsed.include,
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [],
    };
  } catch {
    return null;
  }
}
