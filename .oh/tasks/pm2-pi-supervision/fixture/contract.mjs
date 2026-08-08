import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const FIXTURE_PREFIX = 'pm2-pi-study-';
export const BASE_ENV_KEYS = Object.freeze([
  'PATH', 'HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME',
  'TMPDIR', 'PM2_HOME', 'LANG', 'LC_ALL', 'TZ',
]);
export const PROHIBITED_KEY = /TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|AUTH|CREDENTIAL|COOKIE|PRIVATE_KEY|PI_SLACK|OPENAI|ANTHROPIC|GOOGLE|AWS|AZURE|GITHUB|GH_TOKEN/i;
export const FIXED_ENV = Object.freeze({
  PATH: '/usr/local/bin:/usr/bin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  TZ: 'UTC',
});
export const PRODUCTION_METADATA_COMMANDS = Object.freeze([
  Object.freeze({ name: 'git-status', file: 'git', args: ['status', '--porcelain=v1'] }),
  Object.freeze({ name: 'git-diff-paths', file: 'git', args: ['diff', '--name-only'] }),
  Object.freeze({ name: 'tmux-session-identities', file: 'tmux', args: ['list-sessions', '-F', '#{session_name}\t#{session_id}\t#{session_created}\t#{session_attached}'] }),
  Object.freeze({ name: 'process-identities', file: 'ps', args: ['-eo', 'pid=,ppid=,lstart=,comm='] }),
]);

function inside(root, value) {
  const rel = relative(root, value);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function createRuntimeRoot(parent = tmpdir()) {
  const root = realpathSync(mkdtempSync(join(parent, FIXTURE_PREFIX)));
  const dirs = {
    root,
    home: join(root, 'home'),
    config: join(root, 'xdg-config'),
    state: join(root, 'xdg-state'),
    cache: join(root, 'xdg-cache'),
    tmp: join(root, 'tmp'),
    pm2: join(root, 'pm2-home'),
    run: join(root, 'run'),
  };
  for (const [name, path] of Object.entries(dirs)) {
    if (name !== 'root') mkdirSync(path, { recursive: true, mode: name === 'pm2' ? 0o700 : 0o700 });
  }
  if ((statSync(dirs.pm2).mode & 0o777) !== 0o700) throw new Error('PM2_HOME must have mode 0700');
  return Object.freeze(dirs);
}

export function buildChildEnvironment(dirs, fixtureVariables = {}) {
  const env = {
    ...FIXED_ENV,
    HOME: dirs.home,
    XDG_CONFIG_HOME: dirs.config,
    XDG_STATE_HOME: dirs.state,
    XDG_CACHE_HOME: dirs.cache,
    TMPDIR: dirs.tmp,
    PM2_HOME: dirs.pm2,
  };
  for (const [key, value] of Object.entries(fixtureVariables)) env[key] = String(value);
  validateChildEnvironment(env, dirs.root, Object.keys(fixtureVariables));
  return Object.freeze(env);
}

export function validateChildEnvironment(env, runtimeRoot, fixtureKeys = []) {
  const allowed = new Set([...BASE_ENV_KEYS, ...fixtureKeys]);
  for (const [key, value] of Object.entries(env)) {
    if (!allowed.has(key)) throw new Error(`child environment key is not allowlisted: ${key}`);
    if (PROHIBITED_KEY.test(key)) throw new Error(`prohibited child environment key: ${key}`);
    if (typeof value !== 'string') throw new Error(`child environment value must be a string: ${key}`);
    if (!['PATH', 'LANG', 'LC_ALL', 'TZ'].includes(key)) {
      const resolved = resolve(value);
      if (!inside(runtimeRoot, resolved)) throw new Error(`child environment path escapes runtime root: ${key}`);
    }
  }
  for (const key of BASE_ENV_KEYS) if (!(key in env)) throw new Error(`required child environment key missing: ${key}`);
  return true;
}

export function assertDisposableHomesEmpty(dirs) {
  for (const key of ['home', 'config', 'state', 'cache', 'tmp', 'pm2']) {
    if (readdirSync(dirs[key]).length !== 0) throw new Error(`disposable directory is not empty before setup: ${key}`);
  }
  return true;
}

export function removeRuntimeRoot(root) {
  rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
}

export function proveDeniedNetwork({ spawn = spawnSync } = {}) {
  const script = [
    "const os=require('node:os')",
    "const bad=Object.values(os.networkInterfaces()).flat().filter(Boolean).some(x=>!x.internal)",
    "process.exit(bad?41:0)",
  ].join(';');
  const args = ['--user', '--map-root-user', '--net', '--', process.execPath, '-e', script];
  const result = spawn('unshare', args, { env: FIXED_ENV, encoding: 'utf8', timeout: 5000 });
  if (result.status === 0) {
    return Object.freeze({ status: 'PROVEN', mechanism: 'fresh-user-and-network-namespace', command: ['unshare', ...args] });
  }
  return Object.freeze({
    status: 'NOT RUN',
    mechanism: 'none',
    reason: 'fresh user/network namespace unavailable; candidate launch is prohibited',
    command: ['unshare', ...args],
    probeExitCode: Number.isInteger(result.status) ? result.status : null,
  });
}

export function assertPm2Command(command, env, runtimeRoot, { ownedProcessNames = [] } = {}) {
  if (!Array.isArray(command) || command.length === 0 || basename(command[0]) !== 'pm2') throw new Error('expected an explicit PM2 command array');
  if (!env || typeof env.PM2_HOME !== 'string' || !inside(runtimeRoot, resolve(env.PM2_HOME))) throw new Error('PM2 command requires explicit fixture PM2_HOME');
  const words = command.slice(1).map(String);
  const joined = words.join(' ').toLowerCase();
  const prohibited = [
    /^delete\s+all(?:\s|$)/, /^kill(?:\s|$)/, /(?:^|\s)startup(?:\s|$)/,
    /(?:^|\s)save(?:\s|$)/, /(?:^|\s)resurrect(?:\s|$)/,
    /(?:^|\s)module(?::|\s|$)/, /(?:^|\s)install(?:\s|$)/,
  ];
  if (prohibited.some((pattern) => pattern.test(joined))) throw new Error('prohibited global/default PM2 command');
  if (words.includes('-i') || words.includes('--instances') || joined.includes('exec_mode cluster')) throw new Error('PM2 cluster mode is prohibited');
  if (words[0] === 'delete') {
    if (words.length !== 2 || !ownedProcessNames.includes(words[1])) throw new Error('PM2 deletion requires one exact registered unique process name');
  }
  return true;
}

export function snapshotProductionMetadata(repoRoot, { exec = execFileSync } = {}) {
  const rows = [];
  for (const command of PRODUCTION_METADATA_COMMANDS) {
    try {
      const output = exec(command.file, command.args, {
        cwd: repoRoot,
        env: FIXED_ENV,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
      rows.push({ name: command.name, status: 'captured', output });
    } catch (error) {
      if (command.name === 'tmux-session-identities' && error.status === 1) rows.push({ name: command.name, status: 'captured', output: '' });
      else throw error;
    }
  }
  return rows;
}
