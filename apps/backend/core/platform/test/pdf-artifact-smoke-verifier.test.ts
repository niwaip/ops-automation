import axios from 'axios';
import * as crypto from 'crypto';
import {
  ARTIFACT_SMOKE_HANDLER_KEYS,
  verifyBuiltinArtifactSmoke,
} from '../src/modules/builtin-skill/provisioning/builtin-skill-artifact-smoke-verifier';

describe('PDF artifact smoke verifier', () => {
  afterEach(() => jest.restoreAllMocks());

  it('downloads every split artifact and verifies idempotent identities', async () => {
    const bytes = Buffer.from('%PDF-1.7\nsmoke');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const artifacts = [1, 2].map((page) => ({
      type: 'document',
      id: `page-${page}`,
      name: `page-${page}.pdf`,
      url: `/renders/page-${page}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      metadata: { sha256, sourcePageNumber: page },
    }));
    const result = {
      output: {
        operation: 'split',
        artifact: artifacts[0],
        artifacts,
        pageCount: 2,
        selectedPages: [1, 2],
      },
    };
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: bytes } as any);

    await expect(
      verifyBuiltinArtifactSmoke({
        handlerKey: 'document.pdf.split',
        smokeResult: result,
        rerun: jest.fn().mockResolvedValue(result),
      })
    ).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('includes every PDF artifact handler in the strict verifier gate', () => {
    expect(ARTIFACT_SMOKE_HANDLER_KEYS).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      })
    );
    for (const handlerKey of ['document.pdf.merge', 'document.pdf.split', 'document.pdf.create']) {
      expect(ARTIFACT_SMOKE_HANDLER_KEYS.has(handlerKey)).toBe(true);
    }
  });
});
