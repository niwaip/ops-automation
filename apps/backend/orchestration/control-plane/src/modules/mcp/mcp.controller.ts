import { Controller, Post, Body, Sse, MessageEvent, Req } from '@nestjs/common';
import { McpService } from './mcp.service';
import { Observable, Subject } from 'rxjs';
import { Request } from 'express';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  /**
   * MCP SSE 传输端点
   */
  @Sse('sse')
  sse(): Observable<MessageEvent> {
    // 这是一个简单的 SSE 实现
    // 实际上 MCP SSE 需要更复杂的会话管理
    const subject = new Subject<MessageEvent>();

    // 发送初始 endpoint 信息
    setTimeout(() => {
      subject.next({
        data: JSON.stringify({
          type: 'endpoint',
          url: '/mcp/message',
        }),
      });
    }, 100);

    return subject.asObservable();
  }

  /**
   * MCP 消息端点 (JSON-RPC)
   */
  @Post('message')
  async handleMessage(@Body() message: Record<string, unknown>, @Req() req: Request) {
    const { method, params, id } = message;

    switch (method) {
      case 'initialize': {
        const result = await this.mcpService.initialize();
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: await this.mcpService.listTools(req.headers) },
        };

      case 'tools/call':
        return {
          jsonrpc: '2.0',
          id,
          result: await this.mcpService.callTool(
            this.getObjectValue(params, 'name'),
            this.getObjectRecordValue(params, 'arguments'),
            req.headers
          ),
        };

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: await this.mcpService.listResources() },
        };

      case 'resources/read':
        return {
          jsonrpc: '2.0',
          id,
          result: await this.mcpService.readResource(
            this.getObjectValue(params, 'uri'),
            req.headers
          ),
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found',
          },
        };
    }
  }

  private getObjectValue(source: unknown, key: string): string {
    if (!source || typeof source !== 'object') {
      return '';
    }
    const value = (source as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }

  private getObjectRecordValue(source: unknown, key: string): Record<string, unknown> {
    if (!source || typeof source !== 'object') {
      return {};
    }
    const value = (source as Record<string, unknown>)[key];
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
