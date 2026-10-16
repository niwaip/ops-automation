import axios from 'axios';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';

interface ContentMatchSnippet {
  line: number;
  snippet: string;
  sourceKind?: 'physical_line' | 'metadata_topic' | 'metadata_summary' | 'structured_data';
}

interface ContentSearchResult {
  id: string;
  workspaceId: string;
  name: string;
  workspaceName?: string;
  workspaceType?: string;
  matches: ContentMatchSnippet[];
  fullTextPreview?: string;
  physicalVerified?: boolean;
  digest?: {
    summary?: string;
    keyTopics?: string[];
    headings?: string[];
  };
}

/**
 * 从用户提问中提取需要核对的特定业务字段列表（如“项目预算”、“负责人”、“验收口令”等）
 */
function extractVerificationTerms(cleanKeyword: string, targetTerm: string): string[] {
  let text = cleanKeyword;
  if (targetTerm) {
    text = text.replace(new RegExp(targetTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
  }

  // 必须存在多字段枚举特征（顿号，或“核对/检查/包含/字段/涵盖”引导的多词）
  const hasEnumFeature =
    text.includes('、') ||
    /(?:核对|检查|比对|提取|验证|字段|属性|包括|包含|涵盖|涉及)[:：\s]?[^,，。；;\n]+[,，]/.test(text);
  if (!hasEnumFeature) {
    return [];
  }

  const ACTION_PREFIX_REGEX =
    /^(?:请|请帮我|在|从)?(?:公司公共盘|部门盘|个人盘|工作空间|知识库|文档库|内部资料|资料库)?(?:全文|精确|模糊)?(?:检索|查找|搜索|查阅|查询|比对|核对|验证|提取|查看|获取|给出)?(?:原文|内容)?(?:核对|检查|比对|提取|给出|查看|验证)?/g;
  const NOISE_SUFFIX_REGEX =
    /(?:逐项|逐条|分别|逐个|详细)?(?:给出|列出|提供|展示)?(?:准确值|具体值|详细值|内容|结果)?(?:及|和|与)?(?:行号|引用|行号引用|出处|来源)?$/g;
  const STOP_TERMS = new Set(['命中文档', '命中原文', '原文', '文档', '结果', '内容', '行号', '引用', '出处', '信息']);

  const terms: string[] = [];

  if (text.includes('、')) {
    const segments = text.split(/[,，。；;！？!?\n]+/);
    for (const seg of segments) {
      if (seg.includes('、')) {
        const parts = seg
          .split('、')
          .map((p) =>
            p
              .replace(ACTION_PREFIX_REGEX, '')
              .replace(NOISE_SUFFIX_REGEX, '')
              .replace(/["“”'‘’]/g, '')
              .trim()
          )
          .filter((p) => p.length >= 2 && p.length <= 20 && !STOP_TERMS.has(p));
        terms.push(...parts);
      }
    }
  } else {
    const match = text.match(
      /(?:核对|检查|比对|提取|验证|字段|属性|包括|包含|涵盖|涉及)[:：\s]?([^。！？!?\n]+)/
    );
    if (match) {
      const fieldListStr = match[1];
      const parts = fieldListStr
        .split(/[,，;；\s]+/)
        .map((p) =>
          p
            .replace(ACTION_PREFIX_REGEX, '')
            .replace(NOISE_SUFFIX_REGEX, '')
            .replace(/["“”'‘’]/g, '')
            .trim()
        )
        .filter((p) => p.length >= 2 && p.length <= 20 && !STOP_TERMS.has(p));
      terms.push(...parts);
    }
  }

  return Array.from(new Set(terms)).filter((t) => t !== targetTerm && t.length >= 2);
}

/**
 * 针对文档全文扫描待核对字段的所在行，扩充并排序 matches 列表
 */
function scanLinesForTerms(
  content: string,
  terms: string[],
  existingMatches: ContentMatchSnippet[]
): ContentMatchSnippet[] {
  const result: ContentMatchSnippet[] = [...existingMatches];
  const matchedLineNumbers = new Set(existingMatches.map((m) => m.line));
  const lines = content.split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNumber = idx + 1;
    const lineText = lines[idx].trim();
    if (!lineText) continue;

    for (const term of terms) {
      if (lineText.includes(term)) {
        if (!matchedLineNumbers.has(lineNumber)) {
          matchedLineNumbers.add(lineNumber);
          result.push({
            line: lineNumber,
            snippet: lineText.length > 150 ? lineText.slice(0, 147) + '...' : lineText,
          });
        }
        break;
      }
    }
  }

  result.sort((a, b) => a.line - b.line);
  return result;
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
  const cleanKeyword =
    rawQuery
      .replace(/^(\/doc|\/workspace|\/rag)\s*/i, '')
      .replace(/^(请问|请帮我|查找|查阅|搜索|关于|有什么|介绍一下|解释一下|总结)\s*/i, '')
      .trim() || rawQuery;

  // 提取用户显式指定的引号关键词（如：标题包含“E2E_WORK_MODE_NONEXISTENT_20261014”）
  const quoteMatch = cleanKeyword.match(/["“'‘]([^"”'’]{2,})["”'’]/);
  const targetTerm = quoteMatch ? quoteMatch[1].trim() : cleanKeyword;
  const verificationTerms = extractVerificationTerms(cleanKeyword, targetTerm);

  const authUrl = getAuthServiceUrl();
  const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
  const userId =
    ((request.policyContext as any)?.userId as string) ||
    ((request.traceContext as any)?.userId as string) ||
    ((request as any)?.initiatedBy as string) ||
    (request.metadata?.userId as string) ||
    ((request.metadata as any)?.createdBy as string) ||
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
    const searchUrl = `${authUrl}/workspaces/search-content?q=${encodeURIComponent(targetTerm)}`;
    const searchRes = await axios.get<ContentSearchResult[]>(searchUrl, {
      headers,
      timeout: 8000,
    });

    let searchResults = Array.isArray(searchRes.data) ? searchRes.data : [];

    // 如果整句未命中，且用户未显式限定引号精确词，拆分实体关键词进行二级尝试（CRAG 模式）
    if (searchResults.length === 0 && !quoteMatch) {
      const STOP_WORDS = new Set([
        '主要', '核心', '具体', '内容', '介绍', '详细',
        '文档', '文件', '空间', '资料', '查找', '查阅', '搜索', '查询', '检索',
        '标题', '包含', '关于', '相关', '创建', '修改', '编辑', '删除',
        '没有', '若没有', '找到', '说明', '明确', '请问', '帮我', '一下',
        '这些', '那些', '所有', '全部', '概览', '清单', '列表', '目录',
      ]);

      const subTerms = cleanKeyword
        .split(/[\s，,。！？!?；;、"“”'‘’的关于中]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

      const accumulated = new Map<string, ContentSearchResult>();
      for (const term of subTerms) {
        try {
          const fallbackUrl = `${authUrl}/workspaces/search-content?q=${encodeURIComponent(term)}`;
          const fallbackRes = await axios.get<ContentSearchResult[]>(fallbackUrl, {
            headers,
            timeout: 5000,
          });
          if (Array.isArray(fallbackRes.data)) {
            for (const item of fallbackRes.data) {
              const existing = accumulated.get(item.id);
              if (!existing) {
                accumulated.set(item.id, { ...item, matches: [...(item.matches || [])] });
              } else if (Array.isArray(item.matches)) {
                const existingLines = new Set((existing.matches || []).map((m) => m.line));
                for (const m of item.matches) {
                  if (!existingLines.has(m.line)) {
                    existing.matches.push(m);
                  }
                }
              }
            }
          }
        } catch {
          // ignore fallback error
        }
      }
      if (accumulated.size > 0) {
        searchResults = Array.from(accumulated.values());
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
          answer: `在当前工作空间（个人盘、部门盘与公司公共盘）的 **${totalFilesCount || '多'}** 个文档中，未检索到包含关键词 "${targetTerm}" 的内容。${availableHints || '建议检查文件名或更换关键词重试。'}`,
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

      // 若用户需要核对多字段，通过文档预览全文扫描扩充命中行
      let fileContent = file.fullTextPreview;
      if (!fileContent && verificationTerms.length > 0 && file.id && file.workspaceId) {
        try {
          const previewUrl = `${authUrl}/workspaces/${encodeURIComponent(file.workspaceId)}/nodes/${encodeURIComponent(file.id)}/preview`;
          const previewRes = await axios.get<{ content?: string }>(previewUrl, { headers, timeout: 4000 });
          if (previewRes.data?.content) {
            fileContent = previewRes.data.content;
          }
        } catch {
          // ignore preview fetch error
        }
      }

      let matches = file.matches || [];
      if (fileContent && verificationTerms.length > 0) {
        matches = scanLinesForTerms(fileContent, verificationTerms, matches);
      }

      const matchLimit = verificationTerms.length > 0 ? 15 : (searchResults.length <= 2 ? 8 : 4);
      if (matches && matches.length > 0) {
        for (const m of matches.slice(0, matchLimit)) {
          citations.push({
            fileName: file.name,
            workspaceName: fileWs,
            line: m.line,
            snippet: m.snippet,
            fileId: file.id,
            workspaceId: file.workspaceId,
            url: fileUrl,
          });
          const isPhysical = m.sourceKind === 'physical_line' || (m.line > 0 && !m.sourceKind);
          const linePrefix = isPhysical
            ? `- 第 ${m.line} 行:`
            : m.sourceKind === 'metadata_topic'
              ? '- [核心主题标签]:'
              : m.sourceKind === 'structured_data'
                ? '- [结构化抽取数据]:'
                : '- [文档元数据]:';
          fileFindings.push(`${linePrefix} \`${m.snippet}\``);
        }
      }

      const isExactRawVerification = /(?:从原文|原文核对|查证|逐项|逐字段|不使用摘要|纯原文|原文检索)/i.test(rawQuery);
      const matchContext =
        fileFindings.length > 0
          ? `**${isExactRawVerification ? '命中原文行（原文查证依据）' : '命中上下文'}**：\n${fileFindings.join('\n')}\n`
          : '*(文件名匹配，正文中未包含显式关键词)*\n';

      const statusBadge =
        file.physicalVerified === true
          ? ' `[已由物理原文证实]`'
          : file.physicalVerified === false
          ? ' `[由元数据线索召回]`'
          : '';

      if (isExactRawVerification) {
        // 用户明确要求原文核对/逐项查证：优先呈现命中原文行与精确行号，将摘要降级为辅助参考
        const summaryAppendix = file.digest?.summary
          ? `> 💡 **AI提炼摘要（供对照参考）**：${file.digest.summary}\n`
          : '';
        findings.push(
          `### 📄 [[${fileWs}] ${file.name}](${fileUrl})${statusBadge}\n` +
          `${matchContext}` +
          `${summaryAppendix}` +
          `- 🔗 **快速查阅**：[打开文档](${fileUrl})`
        );
      } else {
        const digestText = file.digest?.summary ? `> **文档摘要**：${file.digest.summary}\n` : '';
        findings.push(
          `### 📄 [[${fileWs}] ${file.name}](${fileUrl})${statusBadge}\n` +
          `${digestText}${matchContext}` +
          `- 🔗 **快速查阅**：[打开文档](${fileUrl})`
        );
      }
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
