import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl, getControlPlaneApiUrl } from '../../config/service-endpoints';

export interface MultiSourceRetrievalParams {
  query: string;
  workspaceSearch: boolean;
  webSearch: boolean;
  userId?: string;
  userRole?: string;
  authToken?: string;
}

export interface MultiSourceRetrievalResult {
  workspacePrompt: string;
  webPrompt: string;
  combinedSystemPromptAddition: string;
  workspaceDocsCount: number;
  workspaceInjectedCount?: number;
  webResultsCount: number;
  completionThought?: string;
}

const DEFAULT_WORKSPACE_SEARCH_TIMEOUT_MS = 8_000;
const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 15_000;
const DEFAULT_WORKSPACE_SEARCH_MAX_DOCS = 5;
const DEFAULT_WEB_SEARCH_MAX_RESULTS = 5;
const DEFAULT_MAX_SNIPPETS_PER_DOC = 8;
const DEFAULT_MAX_WEB_SNIPPET_LENGTH = 500;
const DEFAULT_FALLBACK_USER_ROLE = 'employee';

const getBoundedInt = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

@Injectable()
export class ChatKnowledgeRetrievalService {
  private readonly logger = new Logger(ChatKnowledgeRetrievalService.name);

  cleanQuery(raw: string): string {
    let text = raw.replace(/^\/doc\s*/i, '').trim();
    const prefixRegex =
      /^(?:请问|请帮我|帮我|查找|查阅|搜索|关于|有什么|介绍一下|解释一下|总结|查看|了解|学习|查询|搜搜|查查)\s*/i;
    while (prefixRegex.test(text)) {
      const next = text.replace(prefixRegex, '').trim();
      if (next === text || !next) break;
      text = next;
    }
    const suffixRegex =
      /(?:分别是什么|分别有哪些|分别是多少|是什么|是多少|有哪些|有哪些内容|请附资料来源|请附来源|附资料来源|附来源|请列出|请给出)[？?！!。.\s]*$/i;
    while (suffixRegex.test(text)) {
      const next = text.replace(suffixRegex, '').trim();
      if (next === text || !next) break;
      text = next;
    }
    return text || raw;
  }

  async retrieveWorkspaceKnowledge(
    cleanQuery: string,
    params: { userId?: string; userRole?: string; authToken?: string }
  ): Promise<{ prompt: string; count: number; injectedCount: number; docs: any[] }> {
    try {
      const authUrl = getAuthServiceUrl();
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET ||
        process.env.INTERNAL_API_SECRET ||
        process.env.JWT_SECRET;
      const timeoutMs = getBoundedInt(
        process.env.WORKSPACE_SEARCH_TIMEOUT_MS,
        DEFAULT_WORKSPACE_SEARCH_TIMEOUT_MS,
        1_000,
        30_000
      );
      const maxDocs = getBoundedInt(
        process.env.WORKSPACE_SEARCH_MAX_DOCS,
        DEFAULT_WORKSPACE_SEARCH_MAX_DOCS,
        1,
        10
      );
      const maxSnippets = getBoundedInt(
        process.env.WORKSPACE_SEARCH_MAX_SNIPPETS,
        DEFAULT_MAX_SNIPPETS_PER_DOC,
        1,
        10
      );

      const res = await axios.get<any[]>(
        `${authUrl}/workspaces/search-content?q=${encodeURIComponent(cleanQuery)}`,
        {
          headers: {
            ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
            'x-user-id': params.userId || 'system',
            'x-user-role': params.userRole || DEFAULT_FALLBACK_USER_ROLE,
            ...(params.authToken ? { Authorization: params.authToken } : {}),
          },
          timeout: timeoutMs,
        }
      );
      const searchResults = Array.isArray(res.data) ? res.data : [];
      if (searchResults.length === 0) {
        return { prompt: '', count: 0, injectedCount: 0, docs: [] };
      }

      const docExcerpts = searchResults
        .slice(0, maxDocs)
        .map((item, idx) => {
          const title = item.name;
          const spaceName = item.workspaceName || '工作空间';
          const tab = item.workspaceType || 'personal';
          const fileUrl = `/workspaces?tab=${encodeURIComponent(tab)}&fileId=${encodeURIComponent(item.id)}&workspaceId=${encodeURIComponent(item.workspaceId)}`;

          const parts: string[] = [];
          parts.push(`【参考文档 ${idx + 1}】[${title}](${fileUrl})（所属空间: ${spaceName}）`);

          if (item.digest?.summary) {
            parts.push(`  - 文档核心摘要: ${item.digest.summary}`);
          }
          if (Array.isArray(item.digest?.keyTopics) && item.digest.keyTopics.length > 0) {
            parts.push(`  - 核心实体与关键词: ${item.digest.keyTopics.join(', ')}`);
          }
          if (item.digest?.extractedData && typeof item.digest.extractedData === 'object' && Object.keys(item.digest.extractedData).length > 0) {
            const dataStr = Object.entries(item.digest.extractedData)
              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join('; ');
            parts.push(`  - 关键业务数据与指标: ${dataStr}`);
          }
          if (item.digest?.cleanedContent) {
            parts.push(`  - AI精炼核心正文:\n${item.digest.cleanedContent}`);
          }

          if (item.fullTextPreview) {
            parts.push(`  - 完整文档正文:\n${item.fullTextPreview}`);
          } else {
            const snippets = (item.matches || [])
              .slice(0, maxSnippets)
              .map((m: any) => `  - 第 ${m.line} 行: ${m.snippet}`)
              .join('\n');
            if (snippets) {
              parts.push(`  - 文本匹配摘录:\n${snippets}`);
            }
          }

          return parts.join('\n');
        })
        .join('\n\n');

      const injectedCount = Math.min(searchResults.length, maxDocs);

      return {
        prompt: `\n\n【工作空间内部知识库检索结果】：\n${docExcerpts}`,
        count: searchResults.length,
        injectedCount,
        docs: searchResults,
      };
    } catch (err: any) {
      this.logger.warn(`Workspace search failed during LLM native execution: ${err.message}`);
      return { prompt: '', count: 0, injectedCount: 0, docs: [] };
    }
  }

  async retrieveWebKnowledge(
    cleanQuery: string,
    params: { userId?: string; userRole?: string; authToken?: string }
  ): Promise<{ prompt: string; count: number; results: any[]; error?: string }> {
    try {
      const controlPlaneUrl = getControlPlaneApiUrl();
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET ||
        process.env.INTERNAL_API_SECRET ||
        process.env.JWT_SECRET;
      const timeoutMs = getBoundedInt(
        process.env.WEB_SEARCH_TIMEOUT_MS,
        DEFAULT_WEB_SEARCH_TIMEOUT_MS,
        1_000,
        30_000
      );
      const maxResults = getBoundedInt(
        process.env.WEB_SEARCH_MAX_RESULTS,
        DEFAULT_WEB_SEARCH_MAX_RESULTS,
        1,
        10
      );
      const maxSnippetLength = getBoundedInt(
        process.env.WEB_SEARCH_MAX_SNIPPET_LENGTH,
        DEFAULT_MAX_WEB_SNIPPET_LENGTH,
        100,
        2_000
      );
      const safeRole = params.userRole === 'manager' ? 'manager' : 'employee';

      const res = await axios.post<{
        success?: boolean;
        output?: {
          results?: Array<{ title?: string; url?: string; snippet?: string }>;
          resultCount?: number;
        };
        results?: Array<{ title?: string; url?: string; snippet?: string }>;
      }>(
        `${controlPlaneUrl}/internal/search/web`,
        { query: cleanQuery, maxResults },
        {
          headers: {
            ...(internalSecret ? { 'x-internal-auth': internalSecret } : {}),
            'x-user-id': params.userId || 'system',
            'x-user-role': safeRole,
            ...(params.authToken ? { Authorization: params.authToken } : {}),
          },
          timeout: timeoutMs,
        }
      );

      const results =
        res.data?.output?.results ||
        (Array.isArray(res.data?.results) ? res.data.results : []);

      if (!results || results.length === 0) {
        return { prompt: '', count: 0, results: [] };
      }

      const webExcerpts = results
        .slice(0, maxResults)
        .map((item, idx) => {
          const title = item.title || '网页资料';
          const url = item.url || '';
          const snippet = (item.snippet || '').trim().slice(0, maxSnippetLength);
          return `【参考网页 ${idx + 1}】[${title}](${url})\n  - 摘录: ${snippet}`;
        })
        .join('\n\n');

      return {
        prompt: `\n\n【全网实时检索结果】：\n${webExcerpts}`,
        count: results.length,
        results,
      };
    } catch (err: any) {
      this.logger.warn(`Web search failed during LLM native execution: ${err.message}`);
      return { prompt: '', count: 0, results: [], error: err.message };
    }
  }

  async retrieveMultiSourceContext(
    params: MultiSourceRetrievalParams
  ): Promise<MultiSourceRetrievalResult> {
    const { query, workspaceSearch, webSearch, userId, userRole, authToken } = params;
    if (!workspaceSearch && !webSearch) {
      return {
        workspacePrompt: '',
        webPrompt: '',
        combinedSystemPromptAddition: '',
        workspaceDocsCount: 0,
        webResultsCount: 0,
      };
    }

    const cleanQuery = this.cleanQuery(query);

    const workspacePromise = workspaceSearch
      ? this.retrieveWorkspaceKnowledge(cleanQuery, { userId, userRole, authToken })
      : Promise.resolve({ prompt: '', count: 0, injectedCount: 0, docs: [] });

    const webPromise = webSearch
      ? this.retrieveWebKnowledge(cleanQuery, { userId, userRole, authToken })
      : Promise.resolve({ prompt: '', count: 0, results: [] } as any);

    const [wsSettled, webSettled] = await Promise.allSettled([workspacePromise, webPromise]);

    const wsData =
      wsSettled.status === 'fulfilled'
        ? wsSettled.value
        : { prompt: '', count: 0, injectedCount: 0, docs: [] };
    const webData =
      webSettled.status === 'fulfilled' ? webSettled.value : ({ prompt: '', count: 0, results: [] } as any);

    let completionThought: string | undefined;

    const wsInjected = wsData.injectedCount || Math.min(wsData.count, 5);
    const wsSummary =
      wsData.count > wsInjected
        ? `${wsData.count} 篇工作空间文档（精选前 ${wsInjected} 篇核心资料）`
        : `${wsData.count} 篇工作空间文档`;
    const wsSoloSummary =
      wsData.count > wsInjected
        ? `${wsData.count} 篇相关文档（已精选前 ${wsInjected} 篇核心资料注入解答）`
        : `${wsData.count} 篇相关文档`;

    if (workspaceSearch && webSearch) {
      if (wsData.count > 0 && webData.count > 0) {
        completionThought = `已检索到 ${wsSummary}及 ${webData.count} 条全网实时资料，正在融合多源知识生成解答...`;
      } else if (wsData.count > 0) {
        completionThought = `已在工作空间中检索到 ${wsSoloSummary}，全网未检索到补充结果，正在基于内部知识生成解答...`;
      } else if (webData.count > 0) {
        completionThought = `工作空间内未检索到直接匹配文档，已从全网检索到 ${webData.count} 条实时资料，正在结合检索结果生成解答...`;
      } else {
        completionThought = `工作空间与全网均未检索到针对 "${cleanQuery}" 的直接资料，将基于通用模型知识回答...`;
      }
    } else if (workspaceSearch) {
      if (wsData.count > 0) {
        completionThought = `已在工作空间中检索到 ${wsSoloSummary}，正在结合内部知识生成解答...`;
      } else {
        completionThought = `在工作空间知识库中未检索到与 "${cleanQuery}" 直接相关的内容，将基于通用模型知识回答...`;
      }
    } else if (webSearch) {
      if (webData.count > 0) {
        completionThought = `已从全网检索到 ${webData.count} 条实时资料，正在结合检索结果生成解答...`;
      } else if ((webData as any).error) {
        completionThought = `全网实时检索通道连接受限，已转为基于模型既有知识生成解答...`;
      } else {
        completionThought = `全网检索未返回相关结果，将基于通用模型知识回答...`;
      }
    }

    let instruction = '';
    if (wsData.prompt && webData.prompt) {
      instruction = `\n\n【回答指导】：\n1. 请综合上述【工作空间内部知识库】与【全网实时检索】的双重结果，全面、严谨、准确地回答用户问题；\n2. 明确比对内部规范与外部公开/最新信息的异同（例如内部环境要求与外部官方标准）；\n3. 若资料中包含安装命令、配置步骤、代码或参数规范，请完整呈现；\n4. 请在回答末尾清晰分别标注引用的来源（直接完整复制上方参考文档标题中的链接，以及外部网页链接）。`;
    } else if (wsData.prompt) {
      instruction = `\n\n【回答指导】：\n1. 请优先基于上述工作空间检索到的真实文档资料回答用户问题，内容需详尽、准确；\n2. 若资料中包含安装命令、配置步骤、代码或参数规范，请完整呈现；\n3. 请在回答末尾以 Markdown 链接清晰标注引用的文档来源（请直接完整复制上方【参考文档】标题中的 Markdown 链接，保持具体的 fileId 与 workspaceId 参数不变）。`;
    } else if (webData.prompt) {
      instruction = `\n\n【回答指导】：\n1. 请基于上述全网实时检索到的最新资料回答用户问题，确保时效性与准确性；\n2. 若资料中包含安装命令、配置步骤、代码或参数规范，请完整呈现；\n3. 请在回答末尾以 Markdown 链接清晰标注引用的外部参考网页链接。`;
    } else if (workspaceSearch) {
      instruction = `\n\n【回答指导】：\n1. 当前工作空间内部知识库中未检索到与提问直接相关的文档；\n2. 请明确告知用户未在企业工作空间文档中找到该实体或规范；\n3. 严禁虚构任何文档超链接、文件ID或占位符引用；若未匹配到文档，绝对不要在回答中生成任何文档链接；\n4. 若提供通用技术背景，请明确向用户说明“工作空间暂无该实体内部记录，以下仅供通用技术参考”，不得将通用外部知识冒充企业内部文档。`;
    } else if (webSearch) {
      instruction = `\n\n【回答指导】：\n1. 当前全网实时检索未获取到与提问直接相关的公开资料（可能受限于网络通道或目标信息暂未收录）；\n2. 请根据您掌握的基础知识客观解答；\n3. 若用户询问的是高时效性内容（如今日/当晚实时赛事、即时天气、突发新闻等），请如实说明受限于知识库时效，无法提供实时最新排期，不要编造虚构赛程或时间，也不要提及内部模型名称或插件异常。`;
    }

    return {
      workspacePrompt: wsData.prompt,
      webPrompt: webData.prompt,
      combinedSystemPromptAddition: `${wsData.prompt}${webData.prompt}${instruction}`,
      workspaceDocsCount: wsData.count,
      workspaceInjectedCount: wsInjected,
      webResultsCount: webData.count,
      completionThought,
    };
  }
}
