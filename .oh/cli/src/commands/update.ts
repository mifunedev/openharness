import {
  existsSync,
  statSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { loadManifest } from '../lib/manifest.js';
import { copyOhPayload, assertDestInTarget, type CopyReport } from '../lib/vendor.js';

// `assertDestInTarget` now lives in lib/vendor.ts (shared by init + update); it
// is re-exported here so existing importers (src/__tests__/update.test.ts) keep
// working unchanged.
export { assertDestInTarget };

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

  // AC-4 / AC-6: overlay via the shared copier. update preserves its
  // always-overwrite behavior by NOT passing `skipExisting`.
  const manifest = loadManifest(fromOh);
  if (manifest === null) {
    io.stdout(
      dryPrefix +
        'oh update: no .oh/manifest.json in source; overlaying all of .oh/ (legacy mode)\n',
    );
  }

  let created = 0;
  let overwritten = 0;

  const report: CopyReport = (action, rel) => {
    switch (action) {
      case 'create':
        io.stdout(dryPrefix + 'create ' + rel + '\n');
        created++;
        break;
      case 'overwrite':
        io.stdout(dryPrefix + 'overwrite ' + rel + '\n');
        overwritten++;
        break;
      case 'skip-volatile':
        io.stdout(dryPrefix + 'skip ' + rel + ' (volatile)\n');
        break;
      case 'skip-not-in-payload':
        io.stdout(dryPrefix + 'skip ' + rel + ' (not in payload)\n');
        break;
      case 'skip-exists':
        // update never passes skipExisting, so this is unreachable; handled for
        // exhaustiveness.
        io.stdout(dryPrefix + 'skip ' + rel + ' (exists)\n');
        break;
    }
  };

  const { skipped } = copyOhPayload(fromOh, targetOh, manifest, { force, dryRun }, report);

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
