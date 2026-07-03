import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const port = Number.parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

async function commandStatus(command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 3000 });
    return stdout.trim().split('\n')[0] || 'ok';
  } catch (error) {
    return `unavailable (${error.code || error.message})`;
  }
}

function secretState(name) {
  return process.env[name] ? 'configured' : 'not configured';
}

async function statusPayload() {
  return {
    service: 'Open Harness hosted-smoke',
    mode: process.env.OPENHARNESS_HOSTED_MODE || 'railway',
    projectRoot: process.env.OH_PROJECT_ROOT || process.cwd(),
    health: 'ok',
    tools: {
      node: process.version,
      oh: await commandStatus('oh', ['--help']),
      git: await commandStatus('git', ['--version'])
    },
    secrets: {
      GH_TOKEN: secretState('GH_TOKEN')
    },
    limitations: [
      'Railway does not expose the host Docker socket used by the local Open Harness sandbox lifecycle.',
      'This hosted mode is a smoke-testable preview, not full local Docker/devcontainer parity.',
      'Use the local install path when you need make sandbox, make shell, compose overlays, or sibling containers.'
    ]
  };
}

function renderHtml(payload) {
  const limitations = payload.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Open Harness hosted-smoke</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.45; max-width: 880px; }
    code, pre { background: #f4f4f5; border-radius: 0.35rem; padding: 0.1rem 0.3rem; }
    .ok { color: #15803d; font-weight: 700; }
    .warn { color: #b45309; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Open Harness hosted-smoke</h1>
  <p class="ok">Health: ${escapeHtml(payload.health)}</p>
  <p>This Railway service booted the Open Harness repository and exposed a status endpoint.</p>
  <h2>Tools</h2>
  <ul>
    <li>Node: <code>${escapeHtml(payload.tools.node)}</code></li>
    <li>oh CLI: <code>${escapeHtml(payload.tools.oh)}</code></li>
    <li>Git: <code>${escapeHtml(payload.tools.git)}</code></li>
  </ul>
  <h2>Hosted-mode limits</h2>
  <p class="warn">Railway mode is intentionally not full local sandbox parity.</p>
  <ul>${limitations}</ul>
  <p>JSON status: <a href="/status.json">/status.json</a>. Healthcheck: <a href="/healthz">/healthz</a>.</p>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok\n');
    return;
  }

  const payload = await statusPayload();
  if (request.url === '/status.json') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(renderHtml(payload));
});

server.listen(port, host, () => {
  console.error(`Open Harness hosted-smoke status server listening on ${host}:${port}`);
});
