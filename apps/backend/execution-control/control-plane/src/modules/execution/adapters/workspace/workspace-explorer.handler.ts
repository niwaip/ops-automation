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
    ((request as any)?.initiatedBy as string) ||
    (request.metadata?.userId as string) ||
    process.env.DEFAULT_ADMIN_USER_ID ||
    '00000000-0000-0000-0000-000000000000';

  const headers = {
    ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
    ...(userId ? { 'x-user-id': userId } : {}),
    'x-user-role': 'admin',
  };

  try {
    // 1. 识别是否属于“泛意图空间文件概览”需求（非特定关键词搜索，而是想了解空间里有哪些文档或概况）
    const strippedTerms = cleanKeyword
      .replace(/(本地|当前|我的|企业|公司|工作空间|知识空间|知识库|文档库|空间|盘|资料库|内部资料|这里|里面)/g, '')
      .trim();

    const isOverviewQuery =
      !strippedTerms ||
      /^(查看|看看|列出|展示|浏览|获取|有哪些|有什么|所有|全部|概览|清单|列表|目录|文件树|东西|内容|资料|文件|文档)+$/i.test(
        strippedTerms
      );

    if (isOverviewQuery) {
      const listUrl = `${authUrl}/workspaces/search?q=`;
      const listRes = await axios.get<any[]>(listUrl, {
        headers,
        timeout: 8000,
      });
      const allFiles = Array.isArray(listRes.data) ? listRes.data : [];
      const fileNames = allFiles.map((f) => f.name);

      if (allFiles.length === 0) {
        return {
          success: true,
          output: {
            query: rawQuery,
            answer:
              '### 📂 工作空间知识库全貌概览\n\n当前工作空间（个人盘、部门盘与公司公共盘）中暂无已上传或归档的文档。您可以在工作空间中上传相关资料，或通过执行任务自动归档成果。',
            citations: [],
            scannedFiles: [],
            searchedFilesCount: 0,
          },
        };
      }

      const fileItems = allFiles.slice(0, 15).map((f) => {
        const tab = f.workspaceType || 'personal';
        const fileUrl = `/workspaces?tab=${encodeURIComponent(tab)}&fileId=${encodeURIComponent(f.id)}&workspaceId=${encodeURIComponent(f.workspaceId)}`;
        const sizeKb = f.fileSize ? ` (${(Number(f.fileSize) / 1024).toFixed(1)} KB)` : '';
        return `- 📄 **[${f.name}](${fileUrl})**${sizeKb} · *${f.workspaceName || '空间'}*`;
      });

      const answer = `### 📂 工作空间知识库全貌概览\n\n在您当前的工作空间中，共检测到 **${allFiles.length}** 个可用文档与交付成果：\n\n${fileItems.join('\n')}${allFiles.length > 15 ? `\n- *...及其他 ${allFiles.length - 15} 个文档*` : ''}\n\n---\n💡 **快速搜索提示**：输入具体关键词（例如 \`/doc 合同\` 或 \`/doc 五子棋\`）可进行跨文档全文研读与高亮行定位。`;

      return {
        success: true,
        output: {
          query: rawQuery,
          answer,
          citations: [],
          scannedFiles: fileNames,
          searchedFilesCount: allFiles.length,
        },
      };
    }

    // 2. 发起工作空间关键词检索
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
      let totalFilesCount = 0;
      let availableHints = '';
      try {
        const listUrl = `${authUrl}/workspaces/search?q=`;
        const listRes = await axios.get<any[]>(listUrl, { headers, timeout: 5000 });
        if (Array.isArray(listRes.data) && listRes.data.length > 0) {
          totalFilesCount = listRes.data.length;
          const topNames = listRes.data.slice(0, 5).map((f) => `\`${f.name}\``).join('、');
          availableHints = `\n\n当前工作空间共有 **${totalFilesCount}** 个文档（包括 ${topNames} 等），建议检查关键词是否准确或尝试更换相关业务术语。`;
        }
      } catch {
        // ignore list fallback error
      }

      return {
        success: true,
        output: {
          query: rawQuery,
          answer: `在当前工作空间（个人盘、部门盘与公司公共盘）的 **${totalFilesCount || '多'}** 个文档中，未检索到包含关键词 "${cleanKeyword}" 的内容。${availableHints || '建议检查文件名或更换关键词重试。'}`,
          citations: [],
          scannedFiles: [],
          searchedFilesCount: totalFilesCount,
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
