import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Manifest {
  include: string[];
  exclude: string[];
  rootInclude?: string[];
}

const REGEX_SPECIAL = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

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

export function shouldShip(relpath: string, manifest: Manifest): boolean {
  return shipsUnder(relpath, manifest.include, manifest.exclude);
}

export function shouldShipFromRoot(relpath: string, manifest: Manifest): boolean {
  return shipsUnder(relpath, manifest.rootInclude ?? [], manifest.exclude);
}

function shipsUnder(relpath: string, include: string[], exclude: string[]): boolean {
  const included = include.some((pattern) => globToRegExp(pattern).test(relpath));
  if (!included) {
    return false;
  }
  const excluded = exclude.some((pattern) => globToRegExp(pattern).test(relpath));
  return !excluded;
}

export function rootPayloadDirs(manifest: Manifest): string[] {
  const dirs = new Set<string>();
  for (const pattern of manifest.rootInclude ?? []) {
    const head = pattern.split('/')[0];
    if (head && head !== '*' && head !== '**') {
      dirs.add(head);
    }
  }
  return [...dirs].sort();
}

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
      rootInclude: Array.isArray(parsed.rootInclude) ? parsed.rootInclude : [],
    };
  } catch {
    return null;
  }
}
