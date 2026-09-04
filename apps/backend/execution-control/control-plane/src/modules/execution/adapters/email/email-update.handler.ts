import axios from 'axios';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import { EmailUpdateInput } from './email-engine.types';
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

export async function executeEmailUpdate(
  request: RuntimeStepInvokeRequest
): Promise<BuiltinSkillHandlerResult> {
  const rawInput = (request.input || {}) as Record<string, any>;
  const prompt = typeof rawInput.prompt === 'string' ? rawInput.prompt : '';

  let isRead = rawInput.isRead !== false;
  if (prompt && /未读/.test(prompt) && !/已读/.test(prompt)) {
    isRead = false;
  }

  let messageRefs: string[] = [];
  if (Array.isArray(rawInput.messageRefs)) {
    messageRefs = rawInput.messageRefs.map(String);
  } else if (typeof rawInput.messageRef === 'string') {
    messageRefs = [rawInput.messageRef];
  }

  let selector = rawInput.selector;
  if (!selector || typeof selector !== 'object') {
    let since = rawInput.since;
    let until = rawInput.until;
    const now = new Date();

    if (!since && prompt) {
      if (/(?:今天|今日|这两|这几|刚才|上面|这些|这封|这份)/.test(prompt)) {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      } else if (/(?:昨天|昨日)/.test(prompt)) {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).toISOString();
        until = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString();
      } else if (!/(?:所有|全部|历史)/.test(prompt)) {
        // Safe default: today
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      }
    } else if (!since) {
      // Safe default: today
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    }

    selector = {
      kind: 'recent',
      folder: rawInput.folder || 'inbox',
      unreadOnly: true,
      since,
      until,
    };
  }

  const input: EmailUpdateInput = {
    mailboxKey: rawInput.mailboxKey,
    messageRefs: messageRefs.length > 0 ? messageRefs : undefined,
    isRead,
    selector,
    prompt,
  };

  const runtimeConfigs = await resolveEmailRuntimeConfigs(request);

  try {
    const result = await defaultEmailOrchestrator.updateMessages(input, runtimeConfigs);
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
      errorCode: 'EMAIL_UPDATE_FAILED',
      errorMessage: `邮件状态更新失败: ${rawMessage}`,
    };
  }
}
