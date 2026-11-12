export type McpPhase = 'connect' | 'discover' | 'invoke';
export class McpCallError extends Error {
  constructor(public readonly phase: McpPhase, public readonly category: string) { super('MCP_REMOTE_CALL_FAILED'); }
}
export function classifyMcpError(error: any): string {
  const code = String(error?.code || error?.cause?.code || '');
  const name = String(error?.name || '');
  if (code === 'MCP_CONTRACT_CHANGED') return 'contract';
  if (['401', '403'].includes(code)) return 'authorization';
  if (['AbortError', 'TimeoutError'].includes(name) || /TIMEOUT|TIMEDOUT/.test(code) || code === '-32001') return 'timeout';
  if (/ECONN|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET|EHOSTUNREACH/.test(code)) return 'network';
  return 'remote';
}
