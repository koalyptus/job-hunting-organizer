import { spawn } from 'node:child_process';

const proc = spawn('node', ['bin/jho-mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });

let resolved = false;
const settle = (ok: boolean, reason?: string) => {
  if (resolved) return;
  resolved = true;
  if (!ok) {
    console.error(`mcp ping failed: ${reason}`);
    process.exitCode = 1;
  } else {
    console.log('mcp ping ok');
  }
  proc.kill('SIGTERM');
};

const timeout = setTimeout(() => settle(false, 'timed out waiting for initialize response'), 1500);

proc.on('error', (err) => {
  clearTimeout(timeout);
  settle(false, String(err));
});

let stdout = '';
proc.stdout.on('data', (data) => {
  stdout += data.toString();
  if (stdout.includes('"jsonrpc":"2.0"')) {
    clearTimeout(timeout);
    settle(true);
  }
});

proc.on('exit', (code) => {
  clearTimeout(timeout);
  if (!resolved) {
    settle(false, `process exited with code ${code ?? 'null'}`);
  }
});

const initialize = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'ci-ping', version: '0.0.0' },
  },
}) + '\n';

proc.stdin.write(initialize);
proc.stdin.end();
