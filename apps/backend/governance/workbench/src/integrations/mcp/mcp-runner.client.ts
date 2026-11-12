import { BadGatewayException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { createHmac, randomUUID } from 'node:crypto';
import { McpConfig } from './mcp.types';
import { redactTransportSecret } from './mcp-secret-redaction';

@Injectable()
export class McpRunnerClient {
  async call(config: McpConfig, token: string, operation: 'discover' | 'invoke', toolName?: string, args?: Record<string, unknown>, expectedSchemaDigest?: string): Promise<any> {
    const secret = process.env.MCP_RUNNER_SECRET;
    if (!secret || secret.length < 32) throw new BadGatewayException('MCP Runner 尚未配置');
    const body = JSON.stringify({ ...config, operation, toolName, arguments: args, expectedSchemaDigest,
      auth: config.authType === 'none' ? undefined : config.authType === 'api_key' && config.authLocation === 'query'
        ? { location: 'query', parameter: config.queryParameter, value: token }
        : { location: 'header', header: config.headerName, value: config.authType === 'bearer' ? `Bearer ${token}` : token },
    });
    const timestamp = String(Date.now()); const nonce = randomUUID();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${nonce}.${body}`).digest('hex');
    try {
      const response = await axios.post<any>(`${process.env.MCP_RUNNER_URL || 'http://mcp-client-runner:3015'}/internal/invoke`, body, {
        headers: { 'Content-Type': 'application/json', 'x-mcp-timestamp': timestamp, 'x-mcp-nonce': nonce, 'x-mcp-signature': signature },
        timeout: config.timeoutMs + 5000, maxRedirects: 0, maxContentLength: 3 * 1024 * 1024, proxy: false,
      } as any);
      // Also covers discovery/catalog responses before they can be saved or shown.
      return redactTransportSecret(response.data.result, token);
    } catch (error: any) {
      const remote = error.response?.data?.failure;
      const category = ['timeout', 'network', 'authorization', 'contract', 'remote'].includes(remote?.category) ? remote.category : error.code === 'ECONNABORTED' ? 'timeout' : 'remote';
      const phase = ['connect', 'discover', 'invoke'].includes(remote?.phase) ? remote.phase : 'gateway';
      throw Object.assign(new BadGatewayException('MCP 连接或调用失败，请检查账号授权与服务状态'), { category, phase });
    }
  }
}
