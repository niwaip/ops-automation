import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { getAuthServiceUrl } from '../../../config/service-endpoints';

@Injectable()
@Tool({
  name: 'workspace_read',
  description: '按行号范围精准阅读工作空间文件的纯文本内容。支持指定 startLine 和 endLine 视窗阅读，防止长文档溢出上下文。',
  parameters: {
    type: 'object',
    properties: {
      workspaceId: {
        type: 'string',
        description: '工作空间 ID',
        required: true,
      },
      nodeId: {
        type: 'string',
        description: '文件节点 ID',
        required: true,
      },
      startLine: {
        type: 'number',
        description: '起始行号（从 1 开始，默认 1）',
        required: false,
      },
      endLine: {
        type: 'number',
        description: '截止行号（默认 startLine + 80 行）',
        required: false,
      },
    },
    required: ['workspaceId', 'nodeId'],
  },
  isDefault: true,
})
export class WorkspaceReadTool extends BaseTool {
  constructor() {
    super(
      'workspace_read',
      '按行号范围精准阅读工作空间文件的纯文本内容，支持视窗切片阅读。',
      {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            description: '工作空间 ID',
            required: true,
          },
          nodeId: {
            type: 'string',
            description: '文件节点 ID',
            required: true,
          },
          startLine: {
            type: 'number',
            description: '起始行号（从 1 开始）',
            required: false,
          },
          endLine: {
            type: 'number',
            description: '截止行号',
            required: false,
          },
        },
        required: ['workspaceId', 'nodeId'],
      }
    );
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const workspaceId = String(params.workspaceId || '').trim();
    const nodeId = String(params.nodeId || '').trim();

    if (!workspaceId || !nodeId) {
      return {
        success: false,
        output: '缺少必要参数 workspaceId 或 nodeId',
        data: { error: 'missing_params' },
      };
    }

    const startLine = params.startLine ? Number(params.startLine) : 1;
    // 单次最多读 120 行，防止模型上下文溢出
    const requestedEnd = params.endLine ? Number(params.endLine) : startLine + 80;
    const endLine = Math.min(requestedEnd, startLine + 120);

    const authUrl = getAuthServiceUrl();
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const userId = context.userId || 'system';

    const headers: Record<string, string> = {
      ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
      'x-user-id': userId,
      'x-user-role': 'admin',
    };

    try {
      const url = `${authUrl}/workspaces/${workspaceId}/nodes/${nodeId}/preview?startLine=${startLine}&endLine=${endLine}`;
      const res = await axios.get(url, { headers, timeout: 8000 });
      const data = res.data;

      if (!data) {
        return {
          success: false,
          output: '未读取到文件内容',
          data: { error: 'empty_content' },
        };
      }

      const isEof = data.totalLines && endLine >= data.totalLines;
      const statusNote = isEof
        ? `(已读至文件末尾，总计 ${data.totalLines} 行)`
        : `(共 ${data.totalLines} 行，如需继续请调取 startLine: ${endLine + 1})`;

      const output = [
        `📄 文件: ${data.fileName} [第 ${startLine} - ${endLine} 行] ${statusNote}:`,
        '----------------------------------------',
        data.content,
        '----------------------------------------',
      ].join('\n');

      return {
        success: true,
        output,
        data: {
          fileName: data.fileName,
          startLine,
          endLine,
          totalLines: data.totalLines,
          isEof,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `读取文件内容失败: ${err.message}`,
        data: { error: err.message },
      };
    }
  }
}
