import { McpCallError } from './errors';
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { invokeMcp, Invocation } from './client';

const secret = process.env.MCP_RUNNER_SECRET;
if (!secret || secret.length < 32) throw new Error('MCP_RUNNER_SECRET must contain at least 32 characters');
const seen = new Map<string, number>();
let active = 0;
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health' && req.method === 'GET') { res.end('{"status":"ok"}'); return; }
  if (req.method !== 'POST' || req.url !== '/internal/invoke') { res.writeHead(404).end('{}'); return; }
  try {
    if (active >= 32) { res.writeHead(429).end('{"code":"MCP_BUSY"}'); return; }
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 512 * 1024) throw new Error('MCP_INPUT_TOO_LARGE');
    }
    const timestamp = String(req.headers['x-mcp-timestamp'] || '');
    const nonce = String(req.headers['x-mcp-nonce'] || '');
    const signature = String(req.headers['x-mcp-signature'] || '');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    const now = Date.now();
    for (const [key, expires] of seen) if (expires < now) seen.delete(key);
    if (Math.abs(now - Number(timestamp)) > 30000 || !/^\d+$/.test(timestamp) || !/^[a-zA-Z0-9-]{20,80}$/.test(nonce)
        || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || seen.has(nonce)) {
      res.writeHead(401).end('{"code":"MCP_RUNNER_UNAUTHORIZED"}'); return;
    }
    if (seen.size >= 10000) { res.writeHead(429).end('{"code":"MCP_BUSY"}'); return; }
    seen.set(nonce, now + 60000);
    active++;
    try { res.end(JSON.stringify({ success: true, result: await invokeMcp(JSON.parse(body) as Invocation) })); }
    finally { active--; }
  } catch (error) {
    const failure = error instanceof McpCallError ? { phase: error.phase, category: error.category } : { phase: 'request', category: 'invalid_request' };
    // Never echo SDK errors: remote errors and URLs can contain credentials or database contents.
    res.writeHead(502).end(JSON.stringify({ success: false, code: 'MCP_REMOTE_CALL_FAILED', failure }));
  }
});
server.requestTimeout = 70000;
server.listen(Number(process.env.PORT || 3015), '0.0.0.0');
