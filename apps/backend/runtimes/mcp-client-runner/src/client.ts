import { createHash } from 'node:crypto';
import { McpCallError, McpPhase, classifyMcpError } from './errors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createProtectedFetch } from './network-policy';
import { resolveTransportAuth, TransportAuth } from './transport-auth';

export interface Invocation {
  endpoint: string;
  auth?: TransportAuth;
  privateHosts?: string[];
  operation: 'discover' | 'invoke';
  toolName?: string;
  arguments?: Record<string, unknown>;
  timeoutMs?: number;
  expectedSchemaDigest?: string;
}

export async function invokeMcp(input: Invocation): Promise<unknown> {
  const timeout = Math.min(Math.max(input.timeoutMs || 15000, 1000), 60000);
  const auth = resolveTransportAuth(input.auth);
  const network = createProtectedFetch(input.endpoint, input.privateHosts, auth.query);
  const client = new Client({ name: 'ops-automation-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(input.endpoint), {
    requestInit: { headers: auth.headers }, fetch: network.fetch,
  });
  // Fresh client per invocation: no cross-user transport/session/cache reuse.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void client.close().catch(() => undefined); }, timeout);
  let phase: McpPhase = 'connect';
  try {
    await client.connect(transport, { timeout });
    if (input.operation === 'discover' || input.expectedSchemaDigest) {
      phase = 'discover';
      const tools = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const result = await client.listTools({ cursor }, { timeout });
        tools.push(...result.tools);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      if (cursor) throw new Error('MCP_CATALOG_TOO_LARGE');
      if (input.operation === 'discover') return { tools };
      const remote = tools.find(t => t.name === input.toolName);
      const actual = remote && createHash('sha256').update(JSON.stringify({ input: remote.inputSchema, output: remote.outputSchema || null })).digest('hex');
      if (actual !== input.expectedSchemaDigest) throw Object.assign(new Error('MCP_CONTRACT_CHANGED'), { code: 'MCP_CONTRACT_CHANGED' });
    }
    if (!input.toolName) throw new Error('MCP_TOOL_REQUIRED');
    phase = 'invoke';
    return await client.callTool({ name: input.toolName, arguments: input.arguments || {} }, undefined, { timeout });
  } catch (error) {
    throw new McpCallError(phase, timedOut ? 'timeout' : classifyMcpError(error));
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => undefined);
    await network.close();
  }
}
