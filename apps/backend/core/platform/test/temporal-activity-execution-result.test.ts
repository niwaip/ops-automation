import {
  normalizeDocumentExecutionResult,
} from '../src/modules/temporal-workflow/runtime-bridge/temporal-activity-execution-result.utils';

describe('Temporal Activity execution result normalization', () => {
  it('does not reinterpret a generic HTTP url as a document downloadUrl', () => {
    const input = {
      status: 'success',
      url: 'https://api.example.test/items/1',
      body: { id: 1 },
    };

    expect(normalizeDocumentExecutionResult(input)).toEqual(input);
  });

  it('still promotes an explicit nested document downloadUrl', () => {
    expect(
      normalizeDocumentExecutionResult({
        status: 'success',
        result: { downloadUrl: '/studio/download/report.docx' },
      })
    ).toEqual(
      expect.objectContaining({
        downloadUrl: expect.stringContaining('/studio/download/report.docx'),
      })
    );
  });
});
