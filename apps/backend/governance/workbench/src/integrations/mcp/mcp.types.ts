import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { normalizeMcpEndpoint } from './mcp-endpoint-policy';

export interface McpActor { userId: string; orgId: string | null; role: string; orgAdmin: boolean }
export interface McpConfig {
  transport: 'streamable_http'; endpoint: string; authType: 'none' | 'bearer' | 'api_key'; headerName: string;
  authLocation?: 'header' | 'query'; queryParameter?: string;
  privateHosts: string[]; timeoutMs: number;
}
export const MCP_PURPOSE = 'mcp_transport';
export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertId(id: string) { if (!idPattern.test(id || '')) throw new BadRequestException('无效的记录标识'); }
export function configFrom(input: any, organization: boolean): McpConfig {
  if (input.transport && input.transport !== 'streamable_http') throw new BadRequestException('当前仅支持 Streamable HTTP；尚未支持 stdio 或旧版 SSE');
  let url: URL;
  try { url = new URL(String(input.endpoint || '')); } catch { throw new BadRequestException('请输入有效的服务地址'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new BadRequestException('服务地址不能包含凭证、查询参数或片段；如需 ?key=…，请选择 API Key 的查询参数方式，并单独设置本人凭证');
  }
  url = normalizeMcpEndpoint(url);
  const privateHosts = organization && Array.isArray(input.privateHosts)
    ? [...new Set<string>(input.privateHosts.map((s: any) => String(s).trim().toLowerCase()))] : [];
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const operator = (process.env.MCP_PRIVATE_HOST_ALLOWLIST || '').split(',').map(s => s.trim().toLowerCase());
  if (privateHosts.some(s => !operator.includes(s) || s !== host)) throw new BadRequestException('内网目标需要运维允许名单');
  const authType = input.authType === 'none' ? 'none' : input.authType === 'api_key' ? 'api_key' : input.authType === 'bearer' ? 'bearer' : null;
  if (!authType) throw new BadRequestException('当前支持无需认证、Bearer Token 和 API Key 认证');
  const authLocation = input.authLocation ?? 'header';
  if (!['header', 'query'].includes(authLocation) || (authLocation === 'query' && authType !== 'api_key')) {
    throw new BadRequestException('仅 API Key 支持查询参数认证');
  }
  const queryParameter = authLocation === 'query' ? String(input.queryParameter || '').trim() : undefined;
  if (queryParameter !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(queryParameter)) {
    throw new BadRequestException('请输入有效的 API Key 参数名（字母开头，最多 64 位字母、数字、下划线或连字符）');
  }
  const headerName = authType === 'bearer' ? 'Authorization' : String(input.headerName || 'X-API-Key');
  if (!/^(authorization|x-api-key|api-key)$/i.test(headerName)) throw new BadRequestException('不支持该认证请求头');
  return { transport: 'streamable_http', endpoint: url.href, authType, headerName, authLocation, ...(queryParameter ? { queryParameter } : {}), privateHosts, timeoutMs: Math.min(Math.max(Number(input.timeoutMs) || 15000, 1000), 60000) };
}
