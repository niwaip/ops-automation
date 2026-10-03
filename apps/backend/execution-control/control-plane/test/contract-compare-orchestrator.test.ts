import axios from 'axios';
import { Logger } from '@nestjs/common';
import { executeContractCompareOrchestration } from '../src/modules/execution/adapters/contract/contract-compare-orchestrator';
import type { RuntimeStepInvokeRequest } from '../src/modules/execution/adapters/runtime-adapter.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContractCompareOrchestrator (LLM Change Audit Pipeline)', () => {
  const logger = new Logger('TestContractCompareOrchestrator');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseRequest: RuntimeStepInvokeRequest = {
    requestId: 'req-compare-test-1',
    executionId: 'exec-compare-test-1',
    stepId: 'step-compare-1',
    runtimeType: 'workflow',
    capabilityType: 'builtin',
    action: 'execute',
    skillId: 'platform.document.contract-comparator',
    metadata: {
      definitionVersion: '1.0.2',
      handlerKey: 'document.contract.compare',
    },
    input: {
      fileNameA: 'docA.docx',
      fileNameB: 'docB.docx',
    },
  };

  it('audits MODIFIED and ADDED clauses via LLM and renders report', async () => {
    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-compare/diff')) {
        return {
          data: {
            output: {
              fileNameA: 'docA.docx',
              fileNameB: 'docB.docx',
              metrics: {
                totalClauses: 2,
                unchangedCount: 0,
                modifiedCount: 1,
                addedCount: 1,
                deletedCount: 0,
                highRiskCount: 0,
                mediumRiskCount: 0,
              },
              alignedClauses: [
                {
                  id: 'c1',
                  status: 'MODIFIED',
                  sourceClause: { clauseNumber: '第一条', title: '付款期限', content: '开票后 30 日内付款。' },
                  targetClause: { clauseNumber: '第一条', title: '付款期限', content: '开票后 90 日内付款。' },
                  similarity: 0.8,
                  aiInsight: {
                    summary: '账期被延长',
                    riskLevel: 'LOW',
                  },
                },
                {
                  id: 'c2',
                  status: 'ADDED',
                  targetClause: { clauseNumber: '第二条', title: '单方免责', content: '不可抗力时甲方免除全部责任。' },
                  similarity: 0.0,
                },
              ],
            },
          },
        } as any;
      }

      if (url.includes('/ai/model/call')) {
        return {
          data: {
            result: JSON.stringify([
              {
                clauseId: 'c1',
                riskLevel: 'MEDIUM',
                summary: '付款账期由30天单方延长至90天，严重影响现金流周转与收款确定性。',
                legalAdvice: '建议坚持30日账期，或增设逾期每日万分之五的违约金利息。',
                keyChange: '账期延长至90天',
              },
              {
                clauseId: 'c2',
                riskLevel: 'HIGH',
                summary: '新增单方免责条款，将不可抗力定义泛化，免除其核心履约与赔偿责任。',
                legalAdvice: '应严格限定不可抗力法定范畴，删除单方免责表述。',
                keyChange: '新增单方免责',
              },
            ]),
          },
        } as any;
      }

      if (url.includes('/internal/document/contract-compare/render-report')) {
        return {
          data: {
            output: {
              summary: '比对与审计完成',
              metrics: data.input?.metrics,
              alignedClauses: data.input?.alignedClauses,
              htmlReport: '<html><body>Compare Report</body></html>',
              artifact: { id: 'art-c1', name: 'compare.html' },
              artifacts: [{ id: 'art-c1', name: 'compare.html' }],
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractCompareOrchestration(baseRequest, 'idemp-compare-1', logger);

    expect(result.success).toBe(true);
    const output = result.output as any;
    expect(output.alignedClauses).toHaveLength(2);

    // Clause 1 was upgraded to MEDIUM with LLM insight
    const c1 = output.alignedClauses[0];
    expect(c1.aiInsight.riskLevel).toBe('MEDIUM');
    expect(c1.aiInsight.summary).toContain('付款账期由30天单方延长至90天');
    expect(c1.aiInsight.legalAdvice).toContain('逾期每日万分之五');

    // Clause 2 was audited by LLM as HIGH
    const c2 = output.alignedClauses[1];
    expect(c2.aiInsight.riskLevel).toBe('HIGH');
    expect(c2.aiInsight.summary).toContain('新增单方免责条款');

    // Metrics should have highRiskCount = 1, mediumRiskCount = 1
    expect(output.metrics.highRiskCount).toBe(1);
    expect(output.metrics.mediumRiskCount).toBe(1);
  });

  it('skips LLM audit when all clauses are UNCHANGED', async () => {
    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-compare/diff')) {
        return {
          data: {
            output: {
              fileNameA: 'docA.docx',
              fileNameB: 'docB.docx',
              metrics: {
                totalClauses: 1,
                unchangedCount: 1,
                modifiedCount: 0,
                addedCount: 0,
                deletedCount: 0,
                highRiskCount: 0,
                mediumRiskCount: 0,
              },
              alignedClauses: [
                {
                  id: 'c1',
                  status: 'UNCHANGED',
                  similarity: 1.0,
                },
              ],
            },
          },
        } as any;
      }

      if (url.includes('/ai/model/call')) {
        throw new Error('Should NOT call LLM when all clauses are UNCHANGED');
      }

      if (url.includes('/internal/document/contract-compare/render-report')) {
        return {
          data: {
            output: {
              summary: '完全一致',
              htmlReport: '<html>Identical</html>',
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractCompareOrchestration(baseRequest, 'idemp-compare-2', logger);
    expect(result.success).toBe(true);
    expect(result.output.summary).toBe('完全一致');
  });

  it('falls back to legacy /invoke when /diff returns 404', async () => {
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (url.includes('/internal/document/contract-compare/diff')) {
        const notFound: any = new Error('Not Found');
        notFound.response = { status: 404 };
        throw notFound;
      }

      if (url.includes('/internal/document/contract-compare/invoke')) {
        return {
          data: {
            success: true,
            output: {
              summary: 'Legacy compare output',
            },
          },
        } as any;
      }

      throw new Error(`Unexpected url: ${url}`);
    });

    const result = await executeContractCompareOrchestration(baseRequest, 'idemp-compare-3', logger);
    expect(result.success).toBe(true);
    expect(result.output.summary).toBe('Legacy compare output');
  });
});
