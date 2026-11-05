import axios from 'axios';
import { createHash } from 'node:crypto';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { BuiltinHandlerFn } from '../builtin-handler-registry.service';

export const executeMcpTool: BuiltinHandlerFn = async (request, idempotencyKey) => {
  const capability = request.publishedSkillId || request.skillId || '';
  const bindingId = capability.slice('platform.mcp.'.length);
  const userId = request.traceContext?.userId;
  const secret = process.env.INTERNAL_API_SHARED_SECRET;
  if (!capability.startsWith('platform.mcp.') || !/^[0-9a-f-]{36}$/i.test(bindingId) || !userId || !secret) {
    return { success: false, errorCode: 'MCP_CONTEXT_MISSING', errorMessage: 'MCP 调用缺少可信用户或工具绑定' };
  }
  const { idempotencyKey: _key, ...args } = request.input || {};
  try {
    const response = await axios.post<any>(`${getAuthServiceUrl()}/mcp-integrations/tools/${bindingId}/invoke`, {
      mode: 'work', arguments: args, requestKey: createHash('sha256').update(idempotencyKey).digest('hex'),
    }, { headers: { 'x-internal-auth': secret, 'x-user-id': userId, 'x-user-role': 'employee' }, timeout: 70000 });
    const data = response.data;
    return { success: data.status === 'completed', output: data,
      status: data.status === 'completed' ? 'completed' : data.status === 'awaiting_confirmation' ? 'blocked' : data.status === 'outcome_unknown' ? 'unknown' : 'failed',
      requiresTakeover: data.status === 'awaiting_confirmation',
      takeoverReason: data.status === 'awaiting_confirmation' ? '在设置 → 外部工具连接确认写入后，续接本执行' : undefined,
      errorCode: data.status === 'completed' ? undefined : `MCP_${String(data.status).toUpperCase()}`,
      errorMessage: data.status === 'awaiting_confirmation' ? '请在外部工具连接页确认本次写入，再续接执行' : undefined };
  } catch (error: any) {
    if (error.response?.status === 401) return { success: false, status: 'blocked', requiresTakeover: true,
      errorCode: 'MCP_NEEDS_AUTHORIZATION', errorMessage: '请在设置 → 外部工具连接中设置本人账号，完成后续接执行' };
    return { success: false, errorCode: 'MCP_UNAVAILABLE_OR_UNAUTHORIZED', errorMessage: '请检查工作连接、本人凭证及工具权限' };
  }
};
