import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { validateContentRefV1, type ContentRefV1 } from '@ops/backend-browser-execution-contract';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentRefResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(executionId: string, ref: unknown, maxChars = 30_000): Promise<{
    text: string; content: ContentRefV1; truncated: boolean;
  }> {
    const validation = validateContentRefV1(ref);
    if (!validation.valid) throw contentError(`invalid ContentRef: ${validation.errors.join('; ')}`);
    const content = ref as ContentRefV1;
    const row = await this.prisma.executionResultRef.findFirst({
      where: { id: content.resultRefId, executionId },
      select: { payloadJson: true },
    });
    if (!row) throw contentError('referenced content result is not available to this execution');
    const payload = asRecord(row.payloadJson);
    const text = typeof payload?.markdown === 'string' ? payload.markdown : typeof payload?.text === 'string' ? payload.text : undefined;
    if (!text) throw contentError('content result does not contain text');
    const digest = createHash('sha256').update(text).digest('hex');
    if (digest !== content.integrity.sha256) throw contentError('content integrity digest mismatch');
    const bounded = text.slice(0, Math.max(0, maxChars));
    return { text: bounded, content, truncated: content.integrity.truncated || bounded.length < text.length };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function contentError(message: string): Error & { code: string } {
  return Object.assign(new Error(`CONTENT_REF_RESOLUTION_FAILED: ${message}`), { code: 'CONTENT_REF_RESOLUTION_FAILED' });
}
