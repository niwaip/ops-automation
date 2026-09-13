import { mapExecutionListSummary } from '../src/modules/execution/query/execution-list-summary.mapper';
import { mapExecutionToDto } from '../src/modules/execution/state/execution.mapper';

describe('execution list summaries', () => {
  const createRecord = () => ({
    id: 'execution-1',
    status: 'succeeded',
    createdAt: new Date('2026-09-13T00:00:00Z'),
    updatedAt: new Date('2026-09-13T00:00:01Z'),
    inputJson: { fileBase64: 'private-attachment'.repeat(100_000) },
    normalizedInputJson: {
      user_input: '审查合同',
      fileBase64: 'private-attachment'.repeat(100_000),
    },
    resultJson: {
      summary: '审查完成\n```html\n<html>private-report</html>\n```',
      htmlReport: 'private-report'.repeat(100_000),
    },
    failureReason: 'failure'.repeat(1000),
  });

  it('bounds the response and removes every input/result compatibility alias', () => {
    const record = createRecord();
    const summary = mapExecutionListSummary(record);
    const json = JSON.stringify(summary);
    expect(json.length).toBeLessThan(4000);
    expect(json).not.toContain('private-attachment');
    expect(json).not.toContain('private-report');
    expect(summary.normalizedResult?.summary).toBe('审查完成');
    expect(summary.failureReason?.length).toBeLessThanOrEqual(600);
    expect(summary.normalizedResult?.rawResult).toBeNull();
    // Summary projection must not mutate data later used by the detail route.
    expect(mapExecutionToDto(record).inputJson).toEqual(record.inputJson);
    expect(mapExecutionToDto(record).resultJson).toEqual(record.resultJson);
  });

  it('retains timestamps and execution state for dashboard filtering', () => {
    const summary = mapExecutionListSummary(createRecord());
    expect(summary.id).toBe('execution-1');
    expect(summary.status).toBe('succeeded');
    expect(summary.createdAt).toBe('2026-09-13T00:00:00.000Z');
  });
});
