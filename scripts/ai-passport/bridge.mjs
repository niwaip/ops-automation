import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

// Transport-independent JSONL adapter. A BLE/ASR adapter supplies text commands.
export function createBridge({ baseUrl, token, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid API URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) throw new Error('Use HTTPS outside localhost');
  if (!token) throw new Error('OPS_ACCESS_TOKEN is required');
  const root = `${base.href.replace(/\/$/, '')}/im-channels/xiaozhi/tasks`;
  return async (command) => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Invalid command');
    let url = root;
    let body;
    if (command.type === 'task.submit') {
      if (typeof command.instruction !== 'string' || !command.instruction.trim() || command.instruction.length > 1000) throw new Error('Invalid instruction');
      if (typeof command.idempotencyKey !== 'string' || !/^[\w:-]{8,128}$/.test(command.idempotencyKey)) throw new Error('A stable idempotencyKey is required');
      body = JSON.stringify({ instruction: command.instruction, idempotencyKey: command.idempotencyKey });
    } else if (command.type === 'task.get') {
      if (typeof command.request_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.request_id)) throw new Error('Invalid request_id');
      url += `/${command.request_id}`;
    } else if (command.type !== 'task.list') throw new Error('Unsupported command');
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body } : {}), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`OPS API returned HTTP ${response.status}`);
    return { type: 'task.result', data: await response.json() };
  };
}

async function main() {
  const handle = createBridge({ baseUrl: process.env.OPS_API_URL || 'http://127.0.0.1:3001', token: process.env.OPS_ACCESS_TOKEN });
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
      if (Buffer.byteLength(line) > 16384) throw new Error('Command too large');
      process.stdout.write(`${JSON.stringify(await handle(JSON.parse(line)))}\n`);
    } catch (error) {
      // Never echo commands, tokens, or server response bodies into device output.
      process.stdout.write(`${JSON.stringify({ type: 'task.error', message: error instanceof Error && /^(Invalid|Unsupported|A stable|Command too large|OPS API)/.test(error.message) ? error.message : 'Bridge request failed; query status before retrying' })}\n`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Bridge configuration failed\n'); process.exitCode = 1; });
}
