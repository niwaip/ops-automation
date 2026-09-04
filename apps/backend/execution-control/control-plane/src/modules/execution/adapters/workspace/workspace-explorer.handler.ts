import axios from 'axios';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';

interface ContentMatchSnippet {
  line: number;
  snippet: string;
}

interface ContentSearchResult {
  id: string;
  workspaceId: string;
  name: string;
  workspaceName?: string;
  workspaceType?: string;
  matches: ContentMatchSnippet[];
  digest?: {
    summary?: string;
    keyTopics?: string[];
    headings?: string[];
  };
}

export async function executeWorkspaceExplorer(
  request: RuntimeStepInvokeRequest
): Promise<BuiltinSkillHandlerResult> {
  const input = request.input || {};
  const rawQuery = typeof input.query === 'string' ? input.query.trim() : '';

  if (!rawQuery) {
    return {
      success: false,
      errorCode: 'WORKSPACE_EXPLORE_QUERY_REQUIRED',
      errorMessage: 'query 是必填参数',
    };
  }

  // 过滤提问中的噪音词以优化精确匹配
  const cleanKeyword = rawQuery
    .replace(/^(\/doc|\/workspace|\/rag)\s*/i, '')
    .replace(/^(请问|请帮我|查找|查阅|搜索|关于|有什么|介绍一下|解释一下|总结)\s*/i, '')
    .trim() || rawQuery;

  const authUrl = getAuthServiceUrl();
  const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
  const userId =
    ((request.policyContext as any)?.userId as string) ||
    (request.metadata?.userId as string) ||
    'e7fce333-a8f4-4097-9a53-f0a4c729da46';

  const headers = {
    ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
    ...(userId ? { 'x-user-id': userId } : {}),
    'x-user-role': 'admin',
  };

  try {
    // 1. 发起工作空间关键词检索
    const searchUrl = `${authUrl}/workspaces/search-content?q=${encodeURIComponent(cleanKeyword)}`;
    const searchRes = await axios.get<ContentSearchResult[]>(searchUrl, {
      headers,
      timeout: 8000,
    });

    let searchResults = Array.isArray(searchRes.data) ? searchRes.data : [];

    // 如果整句未命中，拆分实体关键词进行二级尝试（CRAG 模式）
    if (searchResults.length === 0) {
      const subTerms = cleanKeyword
        .split(/[\s，,。的关于中]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !['主要', '核心', '具体', '内容', '介绍', '详细'].includes(t));

      for (const term of subTerms) {
        try {
          const fallbackUrl = `${authUrl}/workspaces/search-content?q=${encodeURIComponent(term)}`;
          const fallbackRes = await axios.get<ContentSearchResult[]>(fallbackUrl, {
            headers,
            timeout: 5000,
          });
          if (Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
            searchResults = fallbackRes.data;
            break;
          }
        } catch {
          // ignore fallback error
        }
      }
    }

    const scannedFiles = searchResults.map((r) => r.name);
    const citations: Array<{
      fileName: string;
      workspaceName: string;
      line: number;
      snippet: string;
      fileId?: string;
      workspaceId?: string;
      url?: string;
    }> = [];

    if (searchResults.length === 0) {
      return {
        success: true,
        output: {
          query: rawQuery,
          answer: `在当前工作空间（个人盘、部门盘与公司公共盘）中未检索到包含关键词 "${cleanKeyword}" 的文档内容。建议检查文件名或更换关键词重试。`,
          citations: [],
          scannedFiles: [],
          searchedFilesCount: 0,
        },
      };
    }

    // 2. 收集各文件的关键引用段落
    const findings: string[] = [];

    for (const file of searchResults.slice(0, 4)) {
      const fileWs = file.workspaceName || '工作空间';
      const fileFindings: string[] = [];
      const fileTab = file.workspaceType || 'personal';
      const fileUrl = `/workspaces?tab=${encodeURIComponent(fileTab)}&fileId=${encodeURIComponent(file.id)}&workspaceId=${encodeURIComponent(file.workspaceId)}`;

      if (file.matches && file.matches.length > 0) {
        for (const m of file.matches.slice(0, 3)) {
          citations.push({
            fileName: file.name,
            workspaceName: fileWs,
            line: m.line,
            snippet: m.snippet,
            fileId: file.id,
            workspaceId: file.workspaceId,
            url: fileUrl,
          });
          fileFindings.push(`- 第 ${m.line} 行: \`${m.snippet}\``);
        }
      }

      const digestText = file.digest?.summary ? `> **文档摘要**：${file.digest.summary}\n` : '';
      findings.push(
        `### 📄 [[${fileWs}] ${file.name}](${fileUrl})\n` +
        `${digestText}**命中上下文**：\n${fileFindings.join('\n')}\n` +
        `- 🔗 **快速查阅**：[打开文档](${fileUrl})`
      );
    }

    const answer = `### 🔍 工作空间文档探查结果\n\n针对 **"${rawQuery}"**，在工作空间中检索到 **${searchResults.length}** 个相关文档：\n\n${findings.join('\n\n')}\n\n---\n*以上内容直接提取自物理工作空间文档。点击上方文档标题或链接可直接在线预览与下载。*`;

    return {
      success: true,
      output: {
        query: rawQuery,
        answer,
        citations,
        scannedFiles,
        searchedFilesCount: scannedFiles.length,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      errorCode: 'WORKSPACE_EXPLORER_ERROR',
      errorMessage: `工作空间探查执行异常: ${err.message}`,
    };
  }
}
