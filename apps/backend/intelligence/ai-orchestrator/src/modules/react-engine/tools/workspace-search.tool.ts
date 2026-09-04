import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { getAuthServiceUrl } from '../../../config/service-endpoints';

@Injectable()
@Tool({
  name: 'workspace_search',
  description: '在工作空间（个人盘、部门盘、公共盘）中按关键词或正则表达式搜索文档内容，返回匹配文件及带行号的上下文片段。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '检索的目标关键词或短语，如 "SWE-CI"、"wp-common"、"架构"',
        required: true,
      },
      workspaceId: {
        type: 'string',
        description: '可选，限定在指定工作空间内搜索',
        required: false,
      },
    },
    required: ['query'],
  },
  isDefault: true,
})
export class WorkspaceSearchTool extends BaseTool {
  constructor() {
    super(
      'workspace_search',
      '在工作空间（个人盘、部门盘、公共盘）中按关键词搜索文档内容，返回匹配文件及带行号的上下文片段。',
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '检索的目标关键词或短语',
            required: true,
          },
          workspaceId: {
            type: 'string',
            description: '可选指定工作空间 ID',
            required: false,
          },
        },
        required: ['query'],
      }
    );
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const query = String(params.query || '').trim();
    if (!query) {
      return {
        success: false,
        output: '缺少检索关键词 (query)',
        data: { error: 'missing_query' },
      };
    }

    const authUrl = getAuthServiceUrl();
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const userId = context.userId || 'system';

    const headers: Record<string, string> = {
      ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
      'x-user-id': userId,
      'x-user-role': 'admin',
    };

    try {
      let url = `${authUrl}/workspaces/search-content?q=${encodeURIComponent(query)}`;
      if (params.workspaceId) {
        url += `&workspaceId=${encodeURIComponent(String(params.workspaceId))}`;
      }

      const res = await axios.get(url, { headers, timeout: 6000 });
      const results = Array.isArray(res.data) ? res.data : [];

      if (results.length === 0) {
        return {
          success: true,
          output: `在工作空间中未找到与 "${query}" 匹配的内容。`,
          data: { query, count: 0, results: [] },
        };
      }

      const formatted = results.slice(0, 5).map((item: any) => {
        const snippets = (item.matches || [])
          .slice(0, 3)
          .map((m: any) => `  - 第 ${m.line} 行: ${m.snippet}`)
          .join('\n');
        return `📄 文件: ${item.name} (ID: ${item.id}, 空间ID: ${item.workspaceId})\n命中片段:\n${snippets}`;
      });

      return {
        success: true,
        output: `检索到 ${results.length} 个相关文件：\n\n${formatted.join('\n\n')}`,
        data: {
          query,
          count: results.length,
          files: results.map((r: any) => ({
            id: r.id,
            name: r.name,
            workspaceId: r.workspaceId,
            matchCount: r.matches?.length || 0,
          })),
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `工作空间搜索失败: ${err.message}`,
        data: { error: err.message },
      };
    }
  }
}
