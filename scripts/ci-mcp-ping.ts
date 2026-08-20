import { spawn } from 'node:child_process';

/** MCP protocol version advertised by the CI smoke-test client. */
const MCP_PROTOCOL_VERSION = '2025-03-26';

/** Max time to wait for the MCP server's `initialize` response before failing. */
const MCP_PING_TIMEOUT_MS = 5000;

const proc = spawn('node', ['bin/jho-mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });

let resolved = false;
const settle = (ok: boolean, reason?: string) => {
  if (resolved) {
    return;
  }
  resolved = true;
  if (!ok) {
    console.error(`mcp ping failed: ${reason}`);
    process.exitCode = 1;
  } else {
    console.warn('mcp ping ok');
  }
  proc.kill('SIGTERM');
};

const timeout = setTimeout(
  () => settle(false, 'timed out waiting for initialize response'),
  MCP_PING_TIMEOUT_MS,
);

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

const initialize =
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'ci-ping', version: '0.0.0' },
    },
  }) + '\n';

proc.stdin.write(initialize);
proc.stdin.end();
