import { ContractCompareController } from './contract-compare.controller';
import type { BuiltinContractCompareInvokeDto, ContractCompareOutput } from './contract-compare.types';

describe('ContractCompareController', () => {
  const dto: BuiltinContractCompareInvokeDto = {
    executionId: 'exec-compare-1',
    stepId: 'step-compare-1',
    capabilityKey: 'platform.document.contract-comparator',
    definitionVersion: '1.0.0',
    input: {
      textA: '第一条 项目内容',
      textB: '第一条 项目内容',
      fileNameA: 'docA.docx',
      fileNameB: 'docB.docx',
    },
  };

  it('successfully invokes comparison and returns structured output with artifacts', async () => {
    const mockOutput: ContractCompareOutput = {
      summary: '比对完成',
      metrics: {
        totalClauses: 1,
        unchangedCount: 1,
        modifiedCount: 0,
        addedCount: 0,
        deletedCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
      },
      alignedClauses: [],
      artifact: {
        type: 'document',
        id: 'artifact-1',
        name: '合同比对报告.html',
        url: '/renders/artifact-1.html',
        mimeType: 'text/html; charset=utf-8',
        sizeBytes: 1024,
      },
      artifacts: [
        {
          type: 'document',
          id: 'artifact-1',
          name: '合同比对报告.html',
          url: '/renders/artifact-1.html',
          mimeType: 'text/html; charset=utf-8',
          sizeBytes: 1024,
        },
      ],
      htmlReport: '<html></html>',
    };

    const mockService = {
      compareContracts: jest.fn().mockResolvedValue(mockOutput),
    };

    const controller = new ContractCompareController(mockService as any);
    const result = await controller.invoke(dto);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockOutput);
    expect(result.artifacts).toEqual(mockOutput.artifacts);
    expect(mockService.compareContracts).toHaveBeenCalledWith({
      ...dto.input,
      idempotencyKey: 'exec-compare-1',
    });
  });
});
