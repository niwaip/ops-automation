// Controlled real MCP + PostgreSQL fixture. Never use production credentials or real business tables.
const http = require('node:http');
const { Pool } = require('pg');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = 'mcp_test_' + process.env.MCP_TEST_RUN.replace(/[^a-z0-9]/g, '');
const tokens = JSON.parse(process.env.MCP_TEST_TOKENS);
let calls = 0;

async function start() {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`CREATE TABLE "${schema}".entries (owner text, amount numeric)`);
  const web = http.createServer(async (req, res) => {
    if (req.url === '/health') { res.end('ok'); return; }
    if (req.url === '/stats') { res.end(JSON.stringify({ calls })); return; }
    const requested = new URL(req.url, 'http://fixture.invalid');
    const queryAuth = requested.pathname === '/query-mcp';
    const queryTokens = Object.fromEntries(Object.entries(tokens).map(([token, owner]) => [token + '/+ =?&', owner]));
    const queryToken = requested.searchParams.get('key');
    const principal = queryAuth ? (!req.headers.authorization && !req.headers['x-api-key'] && requested.searchParams.size === 1 && queryTokens[queryToken])
      : tokens[String(req.headers.authorization || '').replace(/^Bearer /, '')];
    if (!principal) { res.writeHead(401).end(); return; }
    const mcp = new McpServer({ name: 'ops-controlled-postgres-fixture', version: '1.0.0' });
    mcp.registerTool('balance', { description: 'Return the authenticated user balance' + (queryAuth ? ` (echo=${requested.search})` : ''), inputSchema: {} }, async () => {
      const r = await pool.query(`SELECT COALESCE(SUM(amount),0)::text AS total FROM "${schema}".entries WHERE owner=$1`, [principal]);
      return { content: [{ type: 'text', text: JSON.stringify({ owner: principal, total: r.rows[0].total,
        ...(queryAuth ? { credentialEcho: [queryToken, requested.search, encodeURIComponent(queryToken)] } : {}) }) }] };
    });
    mcp.registerTool('credit', { description: 'Write one ledger row for authenticated user', inputSchema: { amount: z.number().min(1).max(1000) } }, async ({ amount }) => {
      calls++;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO "${schema}".entries VALUES ($1,$2)`, [principal, amount]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      return { content: [{ type: 'text', text: JSON.stringify({ owner: principal, added: amount }) }] };
    });
    mcp.registerTool('credit_response_lost', { description: 'Commit then lose response to verify uncertain write handling', inputSchema: { amount: z.number().min(1).max(1000) } }, async ({ amount }) => {
      calls++;
      await pool.query(`INSERT INTO "${schema}".entries VALUES ($1,$2)`, [principal, amount]);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return { content: [{ type: 'text', text: 'completed' }] };
    });
    let body = '';
    for await (const chunk of req) body += chunk;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void mcp.close(); });
    await mcp.connect(transport);
    try { await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined); }
    catch { if (!res.headersSent) res.writeHead(500).end(); }
  });
  web.listen(3199, '0.0.0.0');
  process.on('SIGTERM', async () => { web.close(); await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); process.exit(0); });
}
start().catch(e => { console.error(e.message); process.exit(1); });
