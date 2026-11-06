// Read-only SDK fixture, shared by transport tests and temporary Docker-to-host verification.
const { createServer } = require('node:http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

function createHttpFixture() {
  const requests = [];
  let calls = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    if (!['/', '/mcp'].includes(url.pathname)) { res.writeHead(404).end(); return; }
    requests.push({ method: req.method, query: Object.fromEntries(url.searchParams), authorization: req.headers.authorization });
    const mcp = new McpServer({ name: 'controlled-http-fixture', version: '1.0.0' });
    mcp.registerTool('fixture_status', { description: 'Read the controlled HTTP fixture status', inputSchema: {} }, async () => {
      calls++;
      return { content: [{ type: 'text', text: JSON.stringify({ fixture: true, transport: 'http' }) }] };
    });
    let body = '';
    for await (const chunk of req) body += chunk;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void mcp.close(); });
    await mcp.connect(transport);
    try { await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined); }
    catch { if (!res.headersSent) res.writeHead(500).end(); }
  });
  return { server, requests, get calls() { return calls; } };
}
module.exports = { createHttpFixture };
if (require.main === module) {
  const fixture = createHttpFixture();
  fixture.server.listen(Number(process.argv[2] || 9000), '0.0.0.0', () => console.log(JSON.stringify({ fixtureReady: true, port: fixture.server.address().port })));
  process.on('SIGTERM', () => { fixture.server.closeAllConnections(); fixture.server.close(() => process.exit(0)); });
}
