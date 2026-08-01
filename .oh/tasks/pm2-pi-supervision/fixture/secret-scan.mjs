#!/usr/bin/env node
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const rules = Object.freeze([
  { id: 'credential-assignment', regex: /\b(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|AUTH|CREDENTIAL|COOKIE|PRIVATE_KEY|PI_SLACK|OPENAI|ANTHROPIC|GOOGLE|AWS|AZURE|GITHUB|GH_TOKEN)\b\s*[:=]\s*["']?(?!<|none\b|null\b|redacted\b|synthetic\b)[A-Za-z0-9_+/.=-]{8,}/gi },
  { id: 'private-key-block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'github-token', regex: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { id: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'openai-key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { id: 'personal-email', regex: /\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
]);

function filesUnder(root) {
  const out = [];
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symlink evidence is prohibited: ${path}`);
    if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    else if (stat.isFile()) out.push(path);
  };
  visit(root);
  return out;
}

export function scan(rootPath) {
  const root = realpathSync(resolve(rootPath));
  const findings = [];
  let fileCount = 0;
  for (const path of filesUnder(root)) {
    const size = lstatSync(path).size;
    if (size > MAX_FILE_BYTES) {
      findings.push({ rule: 'oversized-evidence-file', path: path.slice(root.length + 1), size });
      continue;
    }
    fileCount += 1;
    const content = readFileSync(path, 'utf8');
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(content))) {
        findings.push({ rule: rule.id, path: path.slice(root.length + 1), line: content.slice(0, match.index).split('\n').length });
        if (match.index === rule.regex.lastIndex) rule.regex.lastIndex += 1;
      }
    }
  }
  return { status: findings.length ? 'FAIL' : 'PASS', fileCount, findingCount: findings.length, findings };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.length !== 3) {
    process.stderr.write('usage: secret-scan.mjs <evidence-root>\n');
    process.exit(64);
  }
  try {
    const result = scan(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(result.status === 'PASS' ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', error: String(error.message) })}\n`);
    process.exit(1);
  }
}
