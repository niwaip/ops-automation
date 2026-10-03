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

  it('automatically sets skipLlmReview to true during smoke test invocations', async () => {
    const mockService = {
      reviewContract: jest.fn<any>().mockResolvedValue({} as any),
    };
    const controller = new ContractReviewController(mockService as any);

    // Case 1: definitionVersion is 0.0.0-smoke
    await controller.invoke({
      executionId: 'exec-test-1',
      definitionVersion: '0.0.0-smoke',
      input: { text: '测试合同' },
    });
    expect(mockService.reviewContract).toHaveBeenCalledWith({
      text: '测试合同',
      idempotencyKey: 'exec-test-1',
      skipLlmReview: true,
    });

    // Case 2: executionId starts with smoke-
    await controller.invoke({
      executionId: 'smoke-999999',
      definitionVersion: '1.0.0',
      input: { text: '测试合同' },
    });
    expect(mockService.reviewContract).toHaveBeenCalledWith({
      text: '测试合同',
      idempotencyKey: 'smoke-999999',
      skipLlmReview: true,
    });
  });

  it('handles parse endpoint invocation', async () => {
    const mockParseOutput = {
      contractType: 'nda',
      contractTypeName: '商业保密协议 (NDA)',
      myPosition: 'buyer',
      fileName: '保密协议.docx',
      fullText: '第一条 保密信息',
      parsedClauses: [],
      missingClauses: [],
      formIntegrityStats: { totalUnfilledVariables: 0, totalUnfilledBlanks: 0 },
      isTruncated: false,
      warnings: [],
    };
    const mockService = {
      parseContract: jest.fn<any>().mockResolvedValue(mockParseOutput),
    };
    const controller = new ContractReviewController(mockService as any);

    const result = await controller.parse(dto);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockParseOutput);
    expect(mockService.parseContract).toHaveBeenCalledWith({
      ...dto.input,
      idempotencyKey: 'exec-review-1',
    });
  });

  it('handles renderReport endpoint invocation', async () => {
    const mockRenderOutput = {
      summary: '报告摘要',
      contractType: 'nda',
      contractTypeName: '商业保密协议 (NDA)',
      myPosition: 'buyer',
      metrics: { totalClauses: 1, healthScore: 90, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, missingClausesCount: 0, passCount: 1 },
      clauses: [],
      missingClauses: [],
      artifact: { id: 'art-1', name: 'report.html', url: '/renders/art-1.html', downloadUrl: '/renders/art-1.html' },
      artifacts: [{ id: 'art-1', name: 'report.html', url: '/renders/art-1.html', downloadUrl: '/renders/art-1.html' }],
      htmlReport: '<html></html>',
    };
    const mockService = {
      renderReport: jest.fn<any>().mockResolvedValue(mockRenderOutput),
    };
    const controller = new ContractReviewController(mockService as any);

    const renderDto = {
      executionId: 'exec-review-1',
      idempotencyKey: 'key-123',
      input: {
        fileName: 'contract.docx',
        contractType: 'nda' as const,
        contractTypeName: '商业保密协议 (NDA)',
        myPosition: 'buyer' as const,
        metrics: mockRenderOutput.metrics,
        clauses: [],
        missingClauses: [],
      },
    };

    const result = await controller.renderReport(renderDto);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockRenderOutput);
    expect(result.artifacts).toEqual(mockRenderOutput.artifacts);
    expect(mockService.renderReport).toHaveBeenCalledWith(renderDto.input, 'key-123');
  });
});

