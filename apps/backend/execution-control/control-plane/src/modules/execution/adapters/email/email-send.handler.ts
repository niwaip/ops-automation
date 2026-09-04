import axios from 'axios';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import type { EmailSendInput } from './email-engine.types';
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

export async function executeEmailSend(
  request: RuntimeStepInvokeRequest
): Promise<BuiltinSkillHandlerResult> {
  const rawInput = (request.input || {}) as Record<string, any>;
  const prompt = typeof rawInput.prompt === 'string' ? rawInput.prompt : '';

  // 1. Normalize 'to' recipients
  let toList: Array<{ name?: string; address: string }> = [];
  if (Array.isArray(rawInput.to)) {
    toList = rawInput.to
      .map((item: any) => {
        if (typeof item === 'string') return { address: item.trim() };
        return { name: item.name, address: item.address || item.email };
      })
      .filter((item) => Boolean(item.address));
  } else if (typeof rawInput.to === 'string' && rawInput.to.trim()) {
    toList = [{ address: rawInput.to.trim() }];
  } else if (prompt) {
    const emailMatches = prompt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (emailMatches) {
      toList = emailMatches.map((addr) => ({ address: addr }));
    }
  }

  if (toList.length === 0) {
    return {
      success: false,
      errorCode: 'EMAIL_RECIPIENT_REQUIRED',
      errorMessage: '收件人邮箱地址不能为空',
    };
  }

  // 2. Normalize 'subject' and 'textBody'
  let subject = rawInput.subject;
  let textBody = rawInput.textBody || rawInput.body || rawInput.content;

  if (!textBody && prompt) {
    let cleaned = prompt.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
    cleaned = cleaned
      .replace(
        /^(?:请|帮我)?(?:给|向)?\s*(?:发(?:送)?(?:一|1)?封?邮件|发信|发Email)?\s*(?:说|内容是|告诉他|告诉她|通知|通知他|通知她|主题是)?/i,
        ''
      )
      .trim();
    if (cleaned) {
      textBody = cleaned;
    }
  }

  if (!subject) {
    if (textBody && textBody.length <= 20) {
      subject = textBody;
    } else if (textBody) {
      subject = textBody.slice(0, 20) + '...';
    } else {
      subject = '邮件通知';
    }
  }

  if (!textBody) {
    textBody = subject;
  }

  const input: EmailSendInput = {
    mailboxKey: rawInput.mailboxKey,
    mode: rawInput.mode || 'new',
    to: toList,
    cc: Array.isArray(rawInput.cc) ? rawInput.cc : undefined,
    bcc: Array.isArray(rawInput.bcc) ? rawInput.bcc : undefined,
    subject,
    textBody,
    replyToMessageRef: rawInput.replyToMessageRef,
  };

  const runtimeConfigs = await resolveEmailRuntimeConfigs(request);

  try {
    const result = await defaultEmailOrchestrator.sendMessage(input, runtimeConfigs);
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
      errorCode: 'EMAIL_SEND_FAILED',
      errorMessage: `邮件发送失败: ${rawMessage}`,
    };
  }
}
