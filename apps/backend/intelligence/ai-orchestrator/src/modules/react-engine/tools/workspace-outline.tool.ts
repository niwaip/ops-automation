import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { getAuthServiceUrl } from '../../../config/service-endpoints';

@Injectable()
@Tool({
  name: 'workspace_outline',
  description: '快速获取工作空间文档的结构大纲（TOC）、核心主题标签、字数及执行摘要，零开销了解文档整体脉络。',
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
    },
    required: ['workspaceId', 'nodeId'],
  },
  isDefault: true,
})
export class WorkspaceOutlineTool extends BaseTool {
  constructor() {
    super(
      'workspace_outline',
      '快速获取工作空间文档的结构大纲（TOC）、核心主题标签、字数及执行摘要。',
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

    const authUrl = getAuthServiceUrl();
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    const userId = context.userId || 'system';

    const headers: Record<string, string> = {
      ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
      'x-user-id': userId,
      'x-user-role': 'admin',
    };

    try {
      // 获取当前节点详情与 digest
      const url = `${authUrl}/workspaces/${workspaceId}/nodes`;
      const res = await axios.get(url, { headers, timeout: 5000 });
      const nodes = Array.isArray(res.data) ? res.data : [];
      const targetNode = nodes.find((n: any) => n.id === nodeId);

      if (!targetNode) {
        return {
          success: false,
          output: `未找到指定文件: ${nodeId}`,
          data: { error: 'file_not_found' },
        };
      }

      const digest = targetNode.digest;
      if (!digest) {
        return {
          success: true,
          output: `📄 文件: ${targetNode.name}\n（该文件暂无提取好的结构化摘要大纲，建议使用 workspace_read 直接阅读内容）`,
          data: { name: targetNode.name, digest: null },
        };
      }

      const outlineStr = (digest.headings || []).map((h: string) => `  - ${h}`).join('\n') || '  (无章节标题)';
      const topicsStr = (digest.keyTopics || []).map((t: string) => `#${t}`).join(' ');

      const output = [
        `📄 文件: ${targetNode.name} (${digest.charCount || 0} 字符，预估阅读 ${digest.readingTimeMinutes || 1} 分钟)`,
        `🏷️ 主题标签: ${topicsStr}`,
        `📌 核心主旨: ${digest.summary || '无'}`,
        `📑 目录章节大纲:\n${outlineStr}`,
      ].join('\n');

      return {
        success: true,
        output,
        data: {
          nodeId,
          fileName: targetNode.name,
          digest,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `获取文件大纲失败: ${err.message}`,
        data: { error: err.message },
      };
    }
  }
}
