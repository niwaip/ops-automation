import axios from 'axios';
import { Logger } from '@nestjs/common';
import { executeContractReviewOrchestration } from '../src/modules/execution/adapters/contract/contract-review-orchestrator';
import type { RuntimeStepInvokeRequest } from '../src/modules/execution/adapters/runtime-adapter.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContractReviewOrchestrator (Option B Pipeline)', () => {
  const logger = new Logger('TestContractReviewOrchestrator');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseRequest: RuntimeStepInvokeRequest = {
    requestId: 'req-test-1',
    executionId: 'exec-test-1',
    stepId: 'step-review-1',
    runtimeType: 'workflow',
    capabilityType: 'builtin',
    action: 'execute',
    skillId: 'platform.document.contract-reviewer',
    metadata: {
      definitionVersion: '1.0.1',
      handlerKey: 'document.contract.review',
    },
    input: {
      fileUrl: 'http://minio/bucket/contract.docx',
      fileName: 'contract.docx',
    },
  };

  it('orchestrates 3 stages: parse -> batch LLM review -> render report', async () => {
    // Stage 1 mock response from carbone-engine /parse
    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-review/parse')) {
        return {
          data: {
            output: {
              fileName: 'contract.docx',
              contractType: 'PURCHASE',
              contractTypeName: '采购合同',
              myPosition: 'buyer',
              parsedClauses: [
                {
                  clauseIndex: 0,
                  clauseNumber: '前言',
                  title: '前言与立约背景',
                  originalContent: '买卖双方经友好协商达成如下协议。',
                  matchedRules: [],
                },
                {
                  clauseIndex: 1,
                  clauseNumber: '第一条',
                  title: '标的物与质量标准',
                  originalContent: '卖方应保证交付货物符合国家质量标准。',
                  matchedRules: [],
                },
                {
                  clauseIndex: 2,
                  clauseNumber: '附件一',
                  title: '技术规格清单',
                  originalContent: '', // Pure blank annex: should bypass LLM
                  matchedRules: [],
                },
              ],
              missingClauses: [],
              formIntegrityStats: { totalUnfilledVariables: 0, totalUnfilledBlanks: 0 },
            },
          },
        } as any;
      }

      if (url.includes('/ai/model/call')) {
        // Stage 2 mock response from ai-orchestrator
        return {
          data: {
            result: JSON.stringify([
              {
                clauseIndex: 0,
                riskLevel: 'PASS',
                riskSummary: '立约背景清晰合规',
                legalAdvice: '可按原约定保留',
              },
              {
                clauseIndex: 1,
                riskLevel: 'LOW',
                riskSummary: '建议细化验收标准与检测期',
                legalAdvice: '补充具体检验报告交付时限',
              },
            ]),
          },
        } as any;
      }

      if (url.includes('/internal/document/contract-review/render-report')) {
        // Stage 3 mock response from carbone-engine /render-report
        return {
          data: {
            output: {
              summary: '审查完成，发现 1 项高风险（空白附件）',
              chatSummary: '智能审查完成',
              htmlReport: '<html><body>Report</body></html>',
              artifact: { id: 'art-1', name: 'report.html' },
              artifacts: [{ id: 'art-1', name: 'report.html' }],
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractReviewOrchestration(baseRequest, 'idemp-1', logger);

    expect(result.success).toBe(true);
    expect(result.output.contractTypeName).toBe('采购合同');
    expect(result.output.clauses).toHaveLength(3);

    // Clause 2 (pure blank annex) bypassed LLM and was flagged as HIGH risk
    const blankAnnex = result.output.clauses[2];
    expect(blankAnnex.riskLevel).toBe('HIGH');
    expect(blankAnnex.llmReviewed).toBe(false);
    expect(blankAnnex.riskSummary).toContain('附件内容完全留白');

    // Clause 0 & 1 were evaluated via LLM
    expect(result.output.clauses[0].llmReviewed).toBe(true);
    expect(result.output.clauses[0].riskLevel).toBe('PASS');
    expect(result.output.clauses[1].llmReviewed).toBe(true);
    expect(result.output.clauses[1].riskLevel).toBe('LOW');

    // Verify Stage 3 report rendered
    expect(result.output.htmlReport).toContain('<html>');
    expect(result.artifacts).toHaveLength(1);
  });

  it('gracefully falls back to legacy /invoke when /parse returns 404', async () => {
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.includes('/internal/document/contract-review/parse')) {
        const notFoundErr: any = new Error('Not Found');
        notFoundErr.response = { status: 404 };
        throw notFoundErr;
      }

      if (url.includes('/internal/document/contract-review/invoke')) {
        return {
          data: {
            success: true,
            output: {
              summary: 'Legacy review summary',
              htmlReport: '<html>Legacy</html>',
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractReviewOrchestration(baseRequest, 'idemp-2', logger);

    expect(result.success).toBe(true);
    expect(result.output.summary).toBe('Legacy review summary');
  });
});
