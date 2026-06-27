import {
  existsSync,
  statSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { loadManifest, shouldShip } from '../lib/manifest.js';

export interface UpdateIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export interface UpdateOptions {
  targetDir: string;
  fromDir: string;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Throws unless `dest` is `targetOh` itself or strictly inside it.
 * This is the path-escape safety invariant — never weaken it.
 */
export function assertDestInTarget(dest: string, targetOh: string, sep: string): void {
  if (dest === targetOh || dest.startsWith(targetOh + sep)) {
    return;
  }
  throw new Error('oh update: refusing to write outside target .oh: ' + dest);
}

/**
 * Recurse `dir` (anchored at `root`), pushing POSIX relpaths of every REAL file.
 * Symlinks (file AND dir) are skipped and never followed, so a source `.oh/`
 * symlink can never pull external content into the target.
 */
function walkFiles(root: string, dir: string, acc: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.resolve(dir, entry.name);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(root, abs, acc);
    } else if (st.isFile()) {
      acc.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  }
}

/** Parse a semver-ish string into a 3-segment numeric tuple (pre-release/build stripped). */
function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.');
  while (parts.length < 3) {
    parts.push('0');
  }
  const seg = (s: string): number => {
    const base = (s ?? '').split(/[-+]/)[0];
    const n = parseInt(base, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  return [seg(parts[0]), seg(parts[1]), seg(parts[2])];
}

/** -1 if a<b, 0 if equal, 1 if a>b — segment-by-segment numeric compare. */
function compareVersions(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

/** Read the `version` string from a cli/package.json, defaulting to '0.0.0'. */
function readCliVersion(ohDir: string): string {
  const pkgPath = path.resolve(ohDir, 'cli', 'package.json');
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (parsed && typeof parsed.version === 'string') {
      return parsed.version;
    }
  } catch {
    // missing / unparseable → fall through
  }
  return '0.0.0';
}

export async function runUpdate(opts: UpdateOptions, io: UpdateIO): Promise<number> {
  const { targetDir, fromDir, force, dryRun } = opts;
  const dryPrefix = dryRun ? '[dry-run] ' : '';

  // AC-2(a): source preconditions
  const fromOh = path.resolve(fromDir, '.oh');
  if (!existsSync(fromOh) || !statSync(fromOh).isDirectory()) {
    io.stderr(
      'oh update: update source not found at ' +
        fromOh +
        '. Pass --from <built-OpenHarness-checkout>; remote-fetch is deferred (#531).\n',
    );
    return 1;
  }

  // AC-2(b): target preconditions
  const targetOh = path.resolve(targetDir, '.oh');
  if (!existsSync(targetOh) || !statSync(targetOh).isDirectory()) {
    io.stderr(
      'oh update: not an OpenHarness-equipped repo (no .oh/ at ' +
        targetDir +
        '). Run `oh init` / vendor .oh/ first.\n',
    );
    return 1;
  }

  // AC-2(c): same .oh
  if (fromOh === targetOh) {
    io.stderr('oh update: source and target are the same .oh; nothing to update.\n');
    return 1;
  }

  // AC-3: version gate
  const available = readCliVersion(fromOh);
  const current = readCliVersion(targetOh);
  const cmp = compareVersions(available, current);

  if (cmp > 0) {
    io.stdout(dryPrefix + 'updating .oh: ' + current + ' -> ' + available + '\n');
  } else if (cmp === 0) {
    if (!force) {
      io.stdout(dryPrefix + 'oh update: already up to date (v' + current + ')\n');
      return 0;
    }
    io.stdout(dryPrefix + 'oh update: re-overlay (v' + current + ', --force)\n');
  } else {
    // available < current
    if (!force) {
      io.stderr(
        'oh update: refusing downgrade (current v' +
          current +
          ' > source v' +
          available +
          '); pass --force to override\n',
      );
      return 1;
    }
    io.stdout(
      dryPrefix + 'oh update: downgrading .oh: ' + current + ' -> ' + available + ' (--force)\n',
    );
  }

  // AC-4 / AC-6: overlay
  const relpaths: string[] = [];
  walkFiles(fromOh, fromOh, relpaths);
  relpaths.sort();

  const manifest = loadManifest(fromOh);
  if (manifest === null) {
    io.stdout(
      dryPrefix +
        'oh update: no .oh/manifest.json in source; overlaying all of .oh/ (legacy mode)\n',
    );
  }

  let created = 0;
  let overwritten = 0;
  let skipped = 0;

  for (const rel of relpaths) {
    const segments = rel.split('/');
    if (segments.includes('node_modules') || segments.includes('dist')) {
      io.stdout(dryPrefix + 'skip ' + rel + ' (volatile)\n');
      skipped++;
      continue;
    }

    if (manifest && !shouldShip(rel, manifest)) {
      io.stdout(dryPrefix + 'skip ' + rel + ' (not in payload)\n');
      skipped++;
      continue;
    }

    const dest = path.resolve(targetOh, rel);
    assertDestInTarget(dest, targetOh, path.sep);

    const exists = existsSync(dest);
    if (exists) {
      io.stdout(dryPrefix + 'overwrite ' + rel + '\n');
      overwritten++;
    } else {
      io.stdout(dryPrefix + 'create ' + rel + '\n');
      created++;
    }

    if (!dryRun) {
      const src = path.resolve(fromOh, rel);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  }

  io.stdout(
    dryPrefix +
      'oh update: ' +
      created +
      ' created, ' +
      overwritten +
      ' overwritten, ' +
      skipped +
      ' skipped\n',
  );

  return 0;
}
