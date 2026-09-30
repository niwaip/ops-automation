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
              comments: [
                {
                  id: 'cmt-1',
                  author: '张三',
                  text: '请注意违约金条款',
                  clauseIndex: 1,
                  selectedText: '卖方应保证',
                },
              ],
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
                  comments: [
                    {
                      id: 'cmt-1',
                      author: '张三',
                      text: '请注意违约金条款',
                      clauseIndex: 1,
                      selectedText: '卖方应保证',
                    },
                  ],
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
        // Verify Stage 3 receives the forwarded comments in input
        expect(data.input?.comments).toBeDefined();
        expect(data.input.comments).toHaveLength(1);
        expect(data.input.comments[0].id).toBe('cmt-1');

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

    // Comments forwarded in output
    expect(result.output.comments).toHaveLength(1);
    expect(result.output.clauses[1].comments).toHaveLength(1);

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

  it('injects candidate rules in Prompt and post-hydrates findings with server rule catalog metadata', async () => {
    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-review/parse')) {
        return {
          data: {
            output: {
              fileName: '保密协议.docx',
              contractType: 'nda',
              contractTypeName: '商业保密协议 (NDA)',
              myPosition: 'seller',
              ruleSetInfo: {
                ruleSetId: 'contract-review/nda',
                ruleSetVersion: '1.0.0',
                ruleSetDigest: 'sha256-nda-v1.0.0',
                ruleSetName: '商业保密与反泄密合规规则集',
              },
              parsedClauses: [
                {
                  clauseIndex: 0,
                  clauseNumber: '第一条',
                  title: '保密期限条款',
                  originalContent: '接收方承担的保密义务自披露之日起永久有效，不因本协议终止而失效。',
                  matchedRules: [
                    {
                      id: 'nda_perpetual_duration',
                      elementCode: 'NDA-01',
                      title: '保密期限永久且未区分一般信息与商业秘密',
                      category: 'CONFIDENTIALITY',
                      severity: 'HIGH',
                      riskSummary: '对全部一般商业信息要求无期限/永久承担保密义务。',
                      legalAdvice: '建议落实双轨区分：一般商业信息限制为合理期限（2~3 年）。',
                      recommendedRevision: '自披露之日起算，有效期为 3 年。',
                    },
                  ],
                },
              ],
              missingClauses: [],
            },
          },
        } as any;
      }

      if (url.includes('/ai/model/call')) {
        // Verify prompt contains candidate rules and defensive stance
        expect(data.prompt).toContain('【我方立场】: 卖方/服务商/开发方/接收方');
        expect(data.prompt).toContain('NDA-01');
        expect(data.prompt).toContain('候选合规要件摘要');

        return {
          data: {
            result: JSON.stringify([
              {
                clauseIndex: 0,
                riskLevel: 'HIGH',
                findings: [
                  {
                    ruleId: 'NDA-01',
                    verdict: 'MATCHED',
                    evidenceQuote: '保密义务自披露之日起永久有效',
                    reason: '一般保密信息约定为永久有效，未区分法定商业秘密',
                  },
                ],
              },
            ]),
          },
        } as any;
      }

      if (url.includes('/internal/document/contract-review/render-report')) {
        return {
          data: {
            output: {
              summary: 'NDA 审查完成',
              htmlReport: '<html>NDA Report</html>',
              artifact: { id: 'art-nda', name: 'nda.html' },
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractReviewOrchestration(
      { ...baseRequest, input: { fileName: '保密协议.docx' } },
      'idemp-nda-1',
      logger
    );

    expect(result.success).toBe(true);
    expect(result.output.myPosition).toBe('seller');
    expect((result.output as any).ruleSetInfo?.ruleSetId).toBe('contract-review/nda');
    const clause0 = result.output.clauses[0];
    expect(clause0.riskLevel).toBe('HIGH');
    expect(clause0.findings).toHaveLength(1);
    expect(clause0.findings[0].category).toBe('CONFIDENTIALITY');
    expect(clause0.findings[0].evidenceQuote).toBe('保密义务自披露之日起永久有效');
    expect(clause0.findings[0].recommendedRevision).toBe('自披露之日起算，有效期为 3 年。');
  });

  it('decouples candidateRules from matchedRules: sends candidateRules to LLM and hydrates findings even when matchedRules is empty', async () => {
    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-review/parse')) {
        return {
          data: {
            output: {
              fileName: '保密协议_未命中硬正则.docx',
              contractType: 'nda',
              contractTypeName: '商业保密协议 (NDA)',
              myPosition: 'seller',
              positionSource: 'default',
              ruleSetInfo: {
                ruleSetId: 'contract-review/nda',
                ruleSetVersion: '1.0.0',
              },
              availableRules: [
                {
                  id: 'nda_perpetual_duration',
                  elementCode: 'NDA-01',
                  title: '保密期限永久且未区分一般信息与商业秘密',
                  category: 'CONFIDENTIALITY',
                  severity: 'HIGH',
                  riskSummary: '对全部一般商业信息要求无期限/永久承担保密义务。',
                  legalAdvice: '建议落实双轨区分：一般商业信息限制为合理期限（2~3 年）。',
                  recommendedRevision: '自披露之日起算，有效期为 3 年。',
                },
              ],
              parsedClauses: [
                {
                  clauseIndex: 0,
                  clauseNumber: '第五条',
                  title: '保密期限',
                  originalContent: '双方在此明确，保密协议签署后长期有效，无论合作终止与否均持续受保密约束。',
                  matchedRules: [], // Crucial: matchedRules is empty (no regex hard match)!
                  candidateRules: [
                    {
                      id: 'nda_perpetual_duration',
                      elementCode: 'NDA-01',
                      title: '保密期限永久且未区分一般信息与商业秘密',
                      category: 'CONFIDENTIALITY',
                      severity: 'HIGH',
                      riskSummary: '对全部一般商业信息要求无期限/永久承担保密义务。',
                      legalAdvice: '建议落实双轨区分：一般商业信息限制为合理期限（2~3 年）。',
                      recommendedRevision: '自披露之日起算，有效期为 3 年。',
                    },
                  ],
                },
              ],
              missingClauses: [],
            },
          },
        } as any;
      }

      if (url.includes('/ai/model/call')) {
        // Must contain candidate rule NDA-01 in prompt even though matchedRules is []
        expect(data.prompt).toContain('NDA-01');
        expect(data.prompt).toContain('保密期限永久且未区分一般信息与商业秘密');

        return {
          data: {
            result: JSON.stringify([
              {
                clauseIndex: 0,
                riskLevel: 'HIGH',
                findings: [
                  {
                    ruleId: 'NDA-01',
                    verdict: 'MATCHED',
                    evidenceQuote: '长期有效，无论合作终止与否均持续受保密约束',
                    reason: '实质构成无限期保密，缺乏普通商业信息生命周期限制',
                  },
                ],
              },
            ]),
          },
        } as any;
      }

      if (url.includes('/internal/document/contract-review/render-report')) {
        return {
          data: {
            output: {
              summary: '审查完成',
              htmlReport: '<html>Report</html>',
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const result = await executeContractReviewOrchestration(
      { ...baseRequest, input: { fileName: '保密协议_未命中硬正则.docx' } },
      'idemp-nda-empty-matched',
      logger
    );

    expect(result.success).toBe(true);
    expect(result.output.positionSource).toBe('default');
    const clause0 = result.output.clauses[0];
    expect(clause0.riskLevel).toBe('HIGH');
    expect(clause0.elementCode).toBe('NDA-01');
    expect(clause0.elementId).toBe('nda_perpetual_duration');
    expect(clause0.matchedCheckpoints).toContain('CONFIDENTIALITY：保密期限永久且未区分一般信息与商业秘密');
    expect(clause0.findings).toHaveLength(1);
    expect(clause0.findings[0].ruleCode).toBe('NDA-01');
    expect(clause0.findings[0].legalAdvice).toBe('建议落实双轨区分：一般商业信息限制为合理期限（2~3 年）。');
  });

  it('audits batch LLM invocations via ModelInvocationLedgerService', async () => {
    const mockModelLedger = {
      record: jest.fn().mockResolvedValue({ id: 'ledger-1', promptSnapshotId: 'snap-1' }),
    };

    mockedAxios.post.mockImplementation(async (url: string, data: any) => {
      if (url.includes('/internal/document/contract-review/parse')) {
        return {
          data: {
            output: {
              fileName: '保密协议.docx',
              contractType: 'nda',
              contractTypeName: '商业保密协议',
              myPosition: 'seller',
              positionSource: 'default',
              sourceDocumentVersion: 'sha256:abc123docversion',
              ruleSetInfo: {
                ruleSetId: 'contract-review/nda',
                ruleSetVersion: '1.0.0',
                ruleSetDigest: 'sha256:rulesetdigest789',
              },
              parsedClauses: [
                {
                  clauseIndex: 0,
                  clauseNumber: '第一条',
                  title: '保密期限',
                  originalContent: '本协议保密期限永久有效。',
                  matchedRules: [],
                  candidateRules: [
                    {
                      id: 'nda_perpetual_duration',
                      elementCode: 'NDA-01',
                      title: '保密期限永久且未区分一般信息与商业秘密',
                      severity: 'HIGH',
                    },
                  ],
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
                clauseIndex: 0,
                riskLevel: 'HIGH',
                riskSummary: '保密期限无限期',
                findings: [
                  {
                    ruleId: 'NDA-01',
                    verdict: 'MATCHED',
                    evidenceQuote: '保密期限永久有效',
                    reason: '实质构成无限期保密',
                  },
                ],
              },
            ]),
            usage: {
              prompt_tokens: 350,
              completion_tokens: 120,
              total_tokens: 470,
              prompt_tokens_details: { cached_tokens: 50 },
            },
            debug: {
              modelId: 'deepseek-v3',
            },
          },
        } as any;
      }

      if (url.includes('/internal/document/contract-review/render-report')) {
        return {
          data: {
            output: {
              summary: '审查完成',
              htmlReport: '<html>Report</html>',
            },
          },
        } as any;
      }

      throw new Error(`Unexpected POST url: ${url}`);
    });

    const validUuidRequest = {
      ...baseRequest,
      executionId: 'e7fce333-a8f4-4097-9a53-f0a4c729da46',
      stepId: 'f79c9cc7-f358-4e92-a787-ea19c058ffdd',
      traceContext: {
        userId: 'e7fce333-a8f4-4097-9a53-f0a4c729da46',
        traceId: 'trace-test-123',
      },
    };

    const result = await executeContractReviewOrchestration(
      validUuidRequest,
      'idemp-audit-test',
      logger,
      mockModelLedger as any
    );

    expect(result.success).toBe(true);
    expect(result.output.sourceDocumentVersion).toBe('sha256:abc123docversion');
    expect(mockModelLedger.record).toHaveBeenCalledTimes(1);
    expect(mockModelLedger.record).toHaveBeenCalledWith(
      'e7fce333-a8f4-4097-9a53-f0a4c729da46',
      expect.objectContaining({
        executionId: 'e7fce333-a8f4-4097-9a53-f0a4c729da46',
        stepId: 'f79c9cc7-f358-4e92-a787-ea19c058ffdd',
        traceId: 'trace-test-123',
        purpose: 'llm_operation',
        modelId: 'deepseek-v3',
        inputTokens: 350,
        outputTokens: 120,
        cachedTokens: 50,
        currency: 'CNY',
        estimatedCost: expect.any(Number),
        modelPolicyDigest: expect.any(String),
        generationParameters: expect.objectContaining({
          batchIndex: 1,
          totalBatches: 1,
          batchSize: 1,
          temperature: 0.1,
          seed: 42,
          responseFormat: 'json_array',
        }),
      })
    );
  });
});
