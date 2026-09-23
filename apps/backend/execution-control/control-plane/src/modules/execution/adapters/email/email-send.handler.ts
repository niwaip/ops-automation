import axios from 'axios';
import { Logger } from '@nestjs/common';
import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import {
  OUTBOUND_EFFECT_PHASE,
  computeOutboundPayloadHash,
  type OutboundEffectPhase,
} from '@ops/backend-execution-core';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import type { RuntimeStepInvokeRequest } from '../runtime-adapter.interface';
import type { OutboundEffectLedgerService } from '../../outbox/outbound-effect-ledger.service';
import type { EmailSendInput } from './email-engine.types';
import { defaultEmailOrchestrator } from './email-orchestrator';

const logger = new Logger('email-send.handler');

function isUncertainNetworkError(error: any): boolean {
  if (error?.isTimeout === true) {
    return true;
  }
  const code = String(error?.code || '').toUpperCase();
  const rawMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(code)) {
    return true;
  }
  return (
    rawMessage.includes('timeout') ||
    rawMessage.includes('timed out') ||
    rawMessage.includes('超时') ||
    rawMessage.includes('socket hang up') ||
    rawMessage.includes('connection reset') ||
    rawMessage.includes('econnreset') ||
    rawMessage.includes('esockettimedout') ||
    rawMessage.includes('etimedout')
  );
}

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
  request: RuntimeStepInvokeRequest,
  idempotencyKey?: string,
  ledger?: OutboundEffectLedgerService
): Promise<BuiltinSkillHandlerResult> {
  const rawInput = (request.input || {}) as Record<string, any>;
  const prompt = typeof rawInput.prompt === 'string' ? rawInput.prompt : '';

  const effectiveIdempotencyKey =
    idempotencyKey ||
    (request as any).idempotencyKey ||
    (request.metadata?.idempotencyKey as string) ||
    (rawInput.idempotencyKey as string) ||
    '';

  const rawPhase = (
    (request.metadata as Record<string, any> | undefined)?.outboundEffect?.phase ||
    request.metadata?.phase ||
    rawInput.phase ||
    OUTBOUND_EFFECT_PHASE.DIRECT
  ) as string;

  if (
    rawPhase !== OUTBOUND_EFFECT_PHASE.PREPARE &&
    rawPhase !== OUTBOUND_EFFECT_PHASE.COMMIT &&
    rawPhase !== OUTBOUND_EFFECT_PHASE.DIRECT
  ) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'INVALID_EFFECT_PHASE',
      errorMessage: `Unsupported outbound effect phase '${rawPhase}'`,
    };
  }
  const phase: OutboundEffectPhase = rawPhase as OutboundEffectPhase;

  if (phase === OUTBOUND_EFFECT_PHASE.DIRECT) {
    if (process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE !== 'true') {
      return {
        success: false,
        status: 'failed',
        errorCode: 'DIRECT_EXTERNAL_WRITE_FORBIDDEN',
        errorMessage:
          "Direct execution of external_write capability 'platform.email.send' is forbidden without two-phase approval (set ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE=true to override for legacy testing)",
      };
    }
  }

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
      status: 'failed',
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

  if (!subject && !textBody) {
    return {
      success: false,
      status: 'failed',
      errorCode: 'EMAIL_CONTENT_REQUIRED',
      errorMessage: '邮件主题或正文内容不能为空',
    };
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

  // 3. Compute immutable payload hash for outbound effect ledger & two-phase protocol
  const canonicalPayload = {
    mailboxKey: rawInput.mailboxKey || null,
    mode: rawInput.mode || 'new',
    to: toList,
    cc: Array.isArray(rawInput.cc) ? rawInput.cc : [],
    bcc: Array.isArray(rawInput.bcc) ? rawInput.bcc : [],
    subject,
    textBody,
    replyToMessageRef: rawInput.replyToMessageRef || null,
  };
  const payloadHash = computeOutboundPayloadHash(canonicalPayload);

  // Phase: PREPARE
  if (phase === OUTBOUND_EFFECT_PHASE.PREPARE) {
    if (!ledger || !effectiveIdempotencyKey) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'OUTBOUND_EFFECT_LEDGER_UNAVAILABLE',
        errorMessage: 'Outbound effect ledger or idempotencyKey is unavailable for prepare phase',
        payloadHash,
      };
    }

    const capabilityKey = request.publishedSkillId || request.skillId || 'platform.email.send';
    const tenantId = (request.metadata?.tenantId as string) || 'default';
    const record = await ledger.prepare({
      tenantId,
      capabilityKey,
      idempotencyKey: effectiveIdempotencyKey,
      canonicalPayload,
      payloadHash,
    });
    const ledgerId = record.id;

    return {
      success: true,
      status: 'prepared',
      payloadHash,
      output: {
        phase: OUTBOUND_EFFECT_PHASE.PREPARE,
        idempotencyKey: effectiveIdempotencyKey,
        payloadHash,
        canonicalPayload,
        ledgerId,
      },
    };
  }

  // Phase: COMMIT — verify caller payloadHash matches computed hash (fail-closed)
  let commitRecord: any;
  if (phase === OUTBOUND_EFFECT_PHASE.COMMIT) {
    const providedPayloadHash = (
      (request.metadata as Record<string, any> | undefined)?.outboundEffect?.approvedPayloadHash ||
      (request.metadata as Record<string, any> | undefined)?.outboundEffect?.payloadHash ||
      request.metadata?.approvedPayloadHash ||
      request.metadata?.payloadHash ||
      rawInput.payloadHash ||
      ''
    ) as string;

    if (!providedPayloadHash || !providedPayloadHash.trim()) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'PAYLOAD_HASH_REQUIRED',
        errorMessage: 'Commit phase requires a non-empty approved payloadHash',
        payloadHash,
      };
    }

    if (providedPayloadHash !== payloadHash) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'PAYLOAD_HASH_MISMATCH',
        errorMessage: `Provided payloadHash '${providedPayloadHash}' does not match computed payloadHash '${payloadHash}'`,
        payloadHash,
      };
    }

    if (!ledger || !effectiveIdempotencyKey) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'OUTBOUND_EFFECT_LEDGER_UNAVAILABLE',
        errorMessage: 'Outbound effect ledger or idempotencyKey is unavailable for commit phase',
        payloadHash,
      };
    }

    const capabilityKey = request.publishedSkillId || request.skillId || 'platform.email.send';
    const tenantId = (request.metadata?.tenantId as string) || 'default';
    try {
      commitRecord = await ledger.acquireCommit({
        tenantId,
        capabilityKey,
        idempotencyKey: effectiveIdempotencyKey,
        payloadHash,
      });
    } catch (err: any) {
      if (err.message?.includes('OUTBOUND_EFFECT_IN_UNKNOWN_STATE')) {
        return {
          success: false,
          status: 'unknown',
          errorCode: 'OUTBOUND_EFFECT_UNKNOWN',
          errorMessage: err.message,
          payloadHash,
        };
      }
      return {
        success: false,
        status: 'failed',
        errorCode: err.message.includes('OUTBOUND_EFFECT_')
          ? err.message.split(':')[0].trim()
          : 'COMMIT_ACQUISITION_FAILED',
        errorMessage: err.message,
        payloadHash,
      };
    }
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
    clientRequestKey: effectiveIdempotencyKey || undefined,
  };

  const runtimeConfigs = await resolveEmailRuntimeConfigs(request);

  try {
    const result = await defaultEmailOrchestrator.sendMessage(input, runtimeConfigs);

    if (result.state === 'unknown') {
      if (ledger && commitRecord?.id) {
        try {
          await ledger.markUnknown({
            id: commitRecord.id,
            errorClassification: 'OUTBOUND_EFFECT_UNKNOWN',
            resolutionReason: 'Provider returned uncertain state',
          });
        } catch {
          // ignore error to return structured unknown result
        }
      }
      return {
        success: false,
        status: 'unknown',
        errorCode: 'OUTBOUND_EFFECT_UNKNOWN',
        errorMessage: '邮件外发结果不确定，待人工对账或 Provider 确认',
        payloadHash,
        output: result as unknown as Record<string, unknown>,
      };
    }

    if (ledger && commitRecord?.id) {
      try {
        await ledger.markCommitted({
          id: commitRecord.id,
          provider: (result as any).provider || 'smtp',
          providerRequestId: (result as any).deliveryId,
          providerMessageId: (result as any).deliveryId,
        });
      } catch (err: any) {
        logger.error(`Failed to mark outbound effect ${commitRecord.id} as COMMITTED: ${err.message}`);
        return {
          success: false,
          status: 'unknown',
          errorCode: 'OUTBOUND_EFFECT_UNKNOWN',
          errorMessage: `邮件发送请求已被 Provider 处理，但效果账本提交落库失败 (${err.message})，转入人工接管`,
          payloadHash,
          output: {
            ...(result as any),
            ledgerError: err.message,
            ledgerRecordId: commitRecord.id,
          },
        };
      }
    }

    return {
      success: true,
      status: 'completed',
      payloadHash,
      output: result as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);

    if (isUncertainNetworkError(error)) {
      if (ledger && commitRecord?.id) {
        try {
          await ledger.markUnknown({
            id: commitRecord.id,
            errorClassification: 'OUTBOUND_EFFECT_UNKNOWN',
            resolutionReason: rawMessage,
          });
        } catch {}
      }
      return {
        success: false,
        status: 'unknown',
        errorCode: 'OUTBOUND_EFFECT_UNKNOWN',
        errorMessage: `邮件外发状态不确定 (网络超时或连接重置): ${rawMessage}`,
        payloadHash,
      };
    }

    if (ledger && commitRecord?.id) {
      try {
        await ledger.markFailed({
          id: commitRecord.id,
          errorClassification: rawMessage.includes('未配置') ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED',
          resolutionReason: rawMessage,
        });
      } catch {}
    }

    if (rawMessage.includes('未配置')) {
      return {
        success: false,
        status: 'failed',
        errorCode: 'EMAIL_NOT_CONFIGURED',
        errorMessage: rawMessage,
        payloadHash,
      };
    }

    return {
      success: false,
      status: 'failed',
      errorCode: 'EMAIL_SEND_FAILED',
      errorMessage: `邮件发送失败: ${rawMessage}`,
      payloadHash,
    };
  }
}
