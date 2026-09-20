import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExecutionDisplayInput,
  summarizeExecutionListInput,
} from '../../../dist/domain/executions/listHelpers.js';
import type { ExecutionDto } from '../../../dist/types/execution.types.js';

describe('extractExecutionDisplayInput', () => {
  it('filters out raw base64 data and deduplicates fileName when fileNameA is present', () => {
    const mockExecution: Partial<ExecutionDto> = {
      id: 'test-exec-1',
      status: 'succeeded',
      input: {
        fileName: 'contract_v1_baseline.docx',
        fileNameA: 'contract_v1_baseline.docx',
        fileNameB: 'contract_v2_revised.docx',
        fileBase64: 'UEsDBBQAAAAIAAA' + 'A'.repeat(300),
        fileBase64A: 'UEsDBBQAAAAIAAA' + 'A'.repeat(300),
        fileBase64B: 'UEsDBBQAAAAIAAA' + 'A'.repeat(300),
      },
    };

    const result = extractExecutionDisplayInput(mockExecution as ExecutionDto);
    assert.deepEqual(result, {
      fileNameA: 'contract_v1_baseline.docx',
      fileNameB: 'contract_v2_revised.docx',
    });
  });

  it('preserves single fileName and non-binary inputs while stripping base64', () => {
    const mockExecution: Partial<ExecutionDto> = {
      id: 'test-exec-2',
      status: 'succeeded',
      input: {
        fileName: 'single_doc.pdf',
        fileBase64: 'data:application/pdf;base64,JVBERi0xLjQ...',
        userPrompt: '请帮我总结文档',
      },
    };

    const result = extractExecutionDisplayInput(mockExecution as ExecutionDto);
    assert.deepEqual(result, {
      fileName: 'single_doc.pdf',
      userPrompt: '请帮我总结文档',
    });
  });

  it('summarizes input shape cleanly without base64 keys', () => {
    const mockExecution: Partial<ExecutionDto> = {
      id: 'test-exec-3',
      status: 'succeeded',
      input: {
        fileNameA: 'contract_v1.docx',
        fileNameB: 'contract_v2.docx',
        fileBase64A: 'UEsDB' + 'A'.repeat(250),
      },
    };

    const summary = summarizeExecutionListInput(mockExecution as ExecutionDto);
    assert.equal(summary, 'fileNameA、fileNameB');
  });
});
