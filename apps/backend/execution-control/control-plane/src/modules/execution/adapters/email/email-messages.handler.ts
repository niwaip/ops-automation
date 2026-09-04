import axios from 'axios';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import type { EmailMessagesInput } from './email-engine.types';
import { defaultEmailOrchestrator } from './email-orchestrator';

async function resolveEmailRuntimeConfigs(
  request: RuntimeStepInvokeRequest
): Promise<Record<string, string | undefined>> {
  const fromMetadata = (request.metadata?.runtimeConfigs || {}) as Record<string, string | undefined>;
  if (fromMetadata.EMAIL_ADDRESS) {
    return fromMetadata;
  }

  const internalSecret =
    process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;

  try {
    const authUrl = getAuthServiceUrl();
    const userId = (request.metadata?.userId as string) || '';
    const executionId = request.executionId || '';
    const res = await axios.get<{ values?: Record<string, string> }>(
      `${authUrl}/internal/user-connections/email/runtime-config`,
      {
        params: { userId, executionId },
        headers: {
          ...(internalSecret ? { 'x-internal-secret': internalSecret } : {}),
          ...(userId ? { 'x-user-id': userId } : {}),
          ...(executionId ? { 'x-execution-id': executionId } : {}),
        },
        timeout: 4000,
      }
    );
    const fetched = res.data?.values || {};
    return { ...fromMetadata, ...fetched };
  } catch {
    return fromMetadata;
  }
}

function sanitizeEmailSearchQuery(rawQuery?: string): string | undefined {
  if (!rawQuery || typeof rawQuery !== 'string') return undefined;
  let q = rawQuery.trim();
  q = q.replace(/^[「“"']+|[」”"']+$/g, '').trim();
  let stripped = q
    .replace(/(?:收到的|发送的|所有的|我的)?(?:的)?(?:邮件|信件|email|emails|mail|mails)$/i, '')
    .replace(/^(?:帮我)?(?:查一下|查看|搜索|查找|查询|看下|看看|列出|获取|读取)?/i, '')
    .replace(/^(?:关于|来自)?/i, '')
    .replace(/的$/i, '')
    .trim();

  // 过滤数量与排序限制词（如 "最新10封", "最新的10封", "前10封", "10封", "10条"）
  stripped = stripped.replace(/^(?:最新|最近|前)?(?:的)?\s*\d+\s*(?:封|条|个|份)?$/i, '').trim();

  const genericTimeOrFiller =
    /^(今天|今日|昨天|昨日|最近|最新|近几天|这几天|近期的|近来|现在的|收到的|所有的|所有|我的|全部|未读|有什[么麼]|哪些)?$/i;

  if (!stripped || genericTimeOrFiller.test(stripped)) {
    return undefined;
  }

  return stripped;
}

export async function executeEmailMessages(
  request: RuntimeStepInvokeRequest
): Promise<BuiltinSkillHandlerResult> {
  const rawInput = (request.input || {}) as Record<string, any>;
  const prompt = typeof rawInput.prompt === 'string' ? rawInput.prompt : '';
  let selector = rawInput.selector;

  let rawSearchTerm = rawInput.text || rawInput.query || rawInput.keyword || rawInput.search;
  if (!rawSearchTerm && prompt) {
    const quoteMatch = prompt.match(/[「“"']([^」”"']{2,})[」”"']/);
    if (quoteMatch) {
      rawSearchTerm = quoteMatch[1].trim();
    } else {
      const aboutMatch = prompt.match(/(?:关于|主题为|搜索)([^，,。！!]{2,})(?:的?邮件)/);
      if (aboutMatch) {
        rawSearchTerm = aboutMatch[1].trim();
      }
    }
  }

  const text = sanitizeEmailSearchQuery(rawSearchTerm);

  let unreadOnly = Boolean(rawInput.unreadOnly);
  if (!unreadOnly && prompt && /未读/.test(prompt)) {
    unreadOnly = true;
  }

  let detail = rawInput.detail;
  if ((!detail || detail === 'summary') && prompt) {
    if (/完整|正文|全文|详细|详情|detail|full/i.test(prompt)) {
      detail = 'full';
    }
  }

  let since = rawInput.since;
  let until = rawInput.until;

  if (!since && prompt) {
    const now = new Date();
    if (/(?:今天|今日)/.test(prompt)) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      since = todayStart.toISOString();
    } else if (/(?:昨天|昨日)/.test(prompt)) {
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      since = yesterdayStart.toISOString();
      until = yesterdayEnd.toISOString();
    } else if (/(?:近|最近|过去)?(?:3|三)天/.test(prompt)) {
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      since = threeDaysAgo.toISOString();
    } else if (/(?:近|最近|过去)?(?:7|七)天/.test(prompt)) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      since = sevenDaysAgo.toISOString();
    } else if (/(?:本周|这周)/.test(prompt)) {
      const day = now.getDay() || 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0, 0);
      since = monday.toISOString();
    }
  }

  if (!selector || typeof selector !== 'object') {
    if (text) {
      selector = {
        kind: 'search',
        text: String(text),
        unreadOnly,
        folder: rawInput.folder || 'inbox',
        filters: {
          since,
          until,
          unreadOnly,
        },
      };
    } else {
      selector = {
        kind: 'recent',
        folder: rawInput.folder || 'inbox',
        unreadOnly,
        since,
        until,
      };
    }
  }

  let limit = typeof rawInput.limit === 'number' && rawInput.limit > 0 ? rawInput.limit : undefined;
  if (!limit && prompt) {
    const limitMatch = prompt.match(/(?:最近|最新|前)?\s*(\d+)\s*(?:封|条|个|份)/);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
    }
  }
  if (!limit || limit <= 0) {
    limit = text ? 20 : 10;
  }

  const input: EmailMessagesInput = {
    mailboxKey: rawInput.mailboxKey,
    selector,
    detail: detail || 'summary',
    limit,
  };

  const runtimeConfigs = await resolveEmailRuntimeConfigs(request);

  try {
    const result = await defaultEmailOrchestrator.listMessages(input, runtimeConfigs);
    return {
      success: true,
      output: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    if (rawMessage.includes('未配置')) {
      return {
        success: false,
        errorCode: 'EMAIL_NOT_CONFIGURED',
        errorMessage: rawMessage,
      };
    }

    return {
      success: false,
      errorCode: 'EMAIL_FETCH_FAILED',
      errorMessage: `邮件读取失败: ${rawMessage}`,
    };
  }
}
