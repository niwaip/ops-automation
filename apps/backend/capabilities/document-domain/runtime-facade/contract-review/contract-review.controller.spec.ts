import { describe, it, expect, jest } from '@jest/globals';
import { ContractReviewController } from './contract-review.controller';
import type { BuiltinContractReviewInvokeDto, ContractReviewOutput } from './contract-review.types';

describe('ContractReviewController', () => {
  const dto: BuiltinContractReviewInvokeDto = {
    executionId: 'exec-review-1',
    stepId: 'step-review-1',
    capabilityKey: 'platform.document.contract-reviewer',
    definitionVersion: '1.0.0',
    input: {
      text: '第一条 保密信息范围\n本协议项下保密信息永久有效。',
      fileName: '保密协议_202605200707.docx',
    },
  };

  it('successfully invokes review and returns structured output with artifacts', async () => {
    const mockOutput: ContractReviewOutput = {
      summary: '审查完成',
      contractType: 'nda',
      contractTypeName: '商业保密协议 (NDA)',
      myPosition: 'buyer',
      metrics: {
        totalClauses: 1,
        healthScore: 75,
        highRiskCount: 1,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        missingClausesCount: 1,
        passCount: 0,
      },
      clauses: [],
      missingClauses: [],
      artifact: {
        id: 'artifact-review-1',
        name: '合同合规审查报告_保密协议.html',
        url: '/renders/artifact-review-1.html',
        downloadUrl: '/renders/artifact-review-1.html',
        mimeType: 'text/html; charset=utf-8',
      },
      artifacts: [
        {
          id: 'artifact-review-1',
          name: '合同合规审查报告_保密协议.html',
          url: '/renders/artifact-review-1.html',
          downloadUrl: '/renders/artifact-review-1.html',
          mimeType: 'text/html; charset=utf-8',
        },
      ],
      htmlReport: '<html></html>',
    };

    const mockService = {
      reviewContract: jest.fn<any>().mockResolvedValue(mockOutput),
    };

    const controller = new ContractReviewController(mockService as any);
    const result = await controller.invoke(dto);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockOutput);
    expect(result.artifacts).toEqual(mockOutput.artifacts);
    expect(mockService.reviewContract).toHaveBeenCalledWith({
      ...dto.input,
      idempotencyKey: 'exec-review-1',
    });
  });
});
