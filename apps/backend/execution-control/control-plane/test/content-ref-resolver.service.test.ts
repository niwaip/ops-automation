import { createHash } from 'crypto';
import { ContentRefResolverService } from '../src/modules/execution/content/content-ref-resolver.service';

describe('ContentRefResolverService', () => {
  it('loads verified text from a result reference in the same execution', async () => {
    const text = 'The service is healthy.';
    const prisma = { executionResultRef: { findFirst: jest.fn().mockResolvedValue({ payloadJson: { schemaVersion: 'extracted-content/v1', markdown: text } }) } };
    const service = new ContentRefResolverService(prisma as any);
    const result = await service.resolve('execution-1', {
      schemaVersion: 'content-ref/v1', contentId: 'content-1', resultRefId: 'result-1', pageId: 'page-1', sourceUrl: 'https://example.com', finalUrl: 'https://example.com', mediaType: 'text/markdown',
      extraction: { profile: 'article', method: 'semantic-main', confidence: 0.9, fallbackLevel: 0, extractedAt: '2026-08-26T00:00:00Z' },
      integrity: { sha256: createHash('sha256').update(text).digest('hex'), chars: text.length, bytes: Buffer.byteLength(text), truncated: false },
      safety: { activeContentRemoved: true, suspectedPromptInjection: false, untrustedExternalContent: true }, preview: text,
    });
    expect(result.text).toBe(text);
  });
});
