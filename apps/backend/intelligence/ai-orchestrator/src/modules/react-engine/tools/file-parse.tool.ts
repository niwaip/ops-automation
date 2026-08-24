/**
 * File Parse Tool
 * 解析上传的文件内容
 */

import { Injectable } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, UploadedFile } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { Secure } from '../decorators/security.decorator';

@Injectable()
@Tool({
  name: 'file_parse',
  description: '解析上传的文件内容，提取文本信息用于参数提取或上下文补充。',
  parameters: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: '上传文件的ID',
        required: true,
      },
      parseType: {
        type: 'string',
        description: '解析类型：full(全部), extract(提取关键信息)',
        required: false,
      },
    },
    required: ['fileId'],
  },
  isDefault: true,
})
@Secure({
  validatePath: true,
})
export class FileParseTool extends BaseTool {
  constructor() {
    super('file_parse', '解析上传的文件内容，提取文本信息用于参数提取或上下文补充。', {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: '上传文件的ID',
          required: true,
        },
        parseType: {
          type: 'string',
          description: '解析类型：full(全部), extract(提取关键信息)',
          required: false,
        },
      },
      required: ['fileId'],
    });
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const fileId = params.fileId as string;
    const parseType = (params.parseType as string) || 'full';

    // 查找上传的文件
    const uploadedFile = context.uploadedFiles?.find((f) => f.fileId === fileId);

    if (!uploadedFile) {
      return {
        success: false,
        output: `未找到文件: ${fileId}`,
        data: { error: 'file_not_found' },
      };
    }

    try {
      // 如果文件已有解析内容，直接返回
      if (uploadedFile.parsedContent) {
        return {
          success: true,
          output: `文件内容已解析: ${uploadedFile.fileName}`,
          data: {
            content: uploadedFile.parsedContent,
            fileName: uploadedFile.fileName,
            mimeType: uploadedFile.mimeType,
          },
        };
      }

      // 根据文件类型进行解析
      const content = await this.parseFile(uploadedFile, parseType);

      return {
        success: true,
        output: `文件解析成功: ${uploadedFile.fileName}`,
        data: {
          content,
          fileName: uploadedFile.fileName,
          mimeType: uploadedFile.mimeType,
          size: uploadedFile.size,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `文件解析失败: ${errorMsg}`,
        data: { error: 'parse_error', fileName: uploadedFile.fileName },
      };
    }
  }

  /**
   * 根据文件类型解析内容
   */
  private async parseFile(file: UploadedFile, _parseType: string): Promise<string> {
    const mimeType = file.mimeType;

    // 文本文件直接返回
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      // 需要实际读取文件内容，这里返回占位符
      return `[文本文件: ${file.fileName}]`;
    }

    // PDF文件
    if (mimeType === 'application/pdf') {
      return `[PDF文件: ${file.fileName}，需要PDF解析服务]`;
    }

    // Office文档
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return `[Office文档: ${file.fileName}，需要Office解析服务]`;
    }

    // 其他类型
    return `[文件: ${file.fileName}, 类型: ${mimeType}]`;
  }
}
