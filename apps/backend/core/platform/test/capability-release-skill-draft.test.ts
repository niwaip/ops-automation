import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BridgeRecorderExportDTO } from '../../../registry-release/release-manager/src/interfaces';
import { CapabilityReleaseSkillDraftService } from '../../../registry-release/release-manager/src/capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from '../../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';

jest.mock('axios');

describe('CapabilityReleaseSkillDraftService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  const createService = () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    const browserRecordingService = {
      normalizeExecutionFlow: jest.fn(),
      mergeToolsWithExecutionFlow: jest.fn(),
    };
    const temporalSchemaService = new CapabilityReleaseTemporalSchemaService();
    const service = new CapabilityReleaseSkillDraftService(
      browserRecordingService as any,
      temporalSchemaService
    );

    return { service, prisma, browserRecordingService, temporalSchemaService };
  };
  it('preserves document runtime mapping metadata when building execution flow skill drafts', () => {
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
      {
        sourceType: 'execution_flow_template',
        sourceId: 'tpl-tech-service',
        releaseVersion: 3,
      },
      {
        sourcePayload: {
          name: '技术服务合同流程',
          description: '生成技术服务合同',
          goal: '生成合同',
          expectedResult: '输出可下载的合同文档',
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
            },
            required: ['contract.partyA'],
          },
          executionFlowKeys: ['技术服务合同'],
          apiEndpoints: {
            runtimeMetadata: {
              mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
              workflowInputPolicy: {
                params: {
                  'contract.partyA': {
                    requiredMode: 'always',
                    templateBinding: 'contract.partyA_cn',
                  },
                },
              },
              skillGuideMarkdown: 'guide',
              dataExampleJson: {
                contract: {
                  partyA_cn: '上海链合智能科技有限公司',
                },
              },
            },
          },
        },
      },
      {
        id: 'validation-1',
      }
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'execution_flow_template',
        mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
        workflowInputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'always',
              templateBinding: 'contract.partyA_cn',
            },
          },
        },
        skillGuideMarkdown: 'guide',
        dataExampleJson: {
          contract: {
            partyA_cn: '上海链合智能科技有限公司',
          },
        },
      })
    );
  });

  it('preserves document runtime mapping metadata when building temporal workflow skill drafts', () => {
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
      {
        sourceType: 'temporal_workflow',
        sourceId: 'wf-tech-service',
        releaseVersion: 5,
      },
      {
        sourcePayload: {
          name: 'TechnicalServiceContractRenderingWorkflow',
          description: '生成技术服务合同工作流',
          goal: '生成合同',
          workflowDsl: {},
          activityDsl: {},
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
            },
            required: ['contract.partyA'],
          },
          workflowSteps: [{ id: 'step-1', name: 'render' }],
          apiEndpoints: {
            runtimeMetadata: {
              mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
              workflowInputPolicy: {
                params: {
                  'contract.partyA': {
                    requiredMode: 'always',
                    templateBinding: 'contract.partyA_cn',
                  },
                },
              },
            },
          },
        },
      },
      {
        id: 'validation-2',
      }
    );

    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'temporal_workflow',
        mappingHints: [{ parameter: 'contract.partyA', path: '{d.contract.partyA_cn}' }],
        workflowInputPolicy: {
          params: {
            'contract.partyA': {
              requiredMode: 'always',
              templateBinding: 'contract.partyA_cn',
            },
          },
        },
      })
    );
    expect(payload.executionFlowTemplateIds).toEqual(['wf-tech-service']);
  });

  it('derives temporal workflow runtime mapping metadata from workflowDsl when draft payload lacks runtime metadata', () => {
    const { service } = createService();

    const payload = (service as any).buildSkillDraftPayload(
      {
        sourceType: 'temporal_workflow',
        sourceId: 'wf-tech-service',
        releaseVersion: 6,
      },
      {
        sourcePayload: {
          name: 'TechnicalServiceContractRenderingWorkflow',
          description: '生成技术服务合同工作流',
          goal: '生成合同',
          workflowDsl: {
            inputParams: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
                required: true,
                renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
              },
              'payment.bankAccount': {
                type: 'string',
                description: '收款账号',
                required: true,
              },
            },
            inputPolicy: {
              params: {
                'payment.bankAccount': {
                  templateBinding: 'payment.bankAccount_cn',
                },
              },
            },
          },
          activityDsl: {},
          paramsSchema: {
            properties: {
              'contract.partyA': {
                type: 'string',
                description: '甲方名称',
              },
              'payment.bankAccount': {
                type: 'string',
                description: '收款账号',
              },
            },
            required: ['contract.partyA', 'payment.bankAccount'],
          },
          workflowSteps: [{ id: 'step-1', name: 'render' }],
        },
      },
      {
        id: 'validation-3',
      }
    );

    expect(payload.paramsSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          'contract.partyA': expect.objectContaining({
            renderPath: ['contract.partyA_cn', 'contract.partyA_jp'],
          }),
          'payment.bankAccount': expect.objectContaining({
            renderPath: 'payment.bankAccount_cn',
          }),
        }),
      })
    );
    expect(payload.apiEndpoints.runtimeMetadata).toEqual(
      expect.objectContaining({
        sourceType: 'temporal_workflow',
        mappingHints: expect.arrayContaining([
          { parameter: 'contract.partyA', path: 'contract.partyA_cn' },
          { parameter: 'contract.partyA', path: 'contract.partyA_jp' },
          { parameter: 'payment.bankAccount', path: 'payment.bankAccount_cn' },
        ]),
        workflowInputPolicy: {
          params: {
            'payment.bankAccount': {
              templateBinding: 'payment.bankAccount_cn',
            },
          },
        },
      })
    );
  });

});

describe('CapabilityReleaseSkillDraftService — outputSchema propagation (fix ①)', () => {
  const createService = () => {
    const browserRecordingService = {
      normalizeExecutionFlow: jest.fn(),
      mergeToolsWithExecutionFlow: jest.fn(),
    };
    const temporalSchemaService = new CapabilityReleaseTemporalSchemaService();
    return new CapabilityReleaseSkillDraftService(browserRecordingService as any, temporalSchemaService);
  };

  it('carries the release output contract into the draft payload (contracts.output.schema)', () => {
    const service = createService();
    const payload = (service as any).buildSkillDraftPayload(
      { sourceType: 'temporal_workflow', sourceId: 'wf-1', releaseVersion: 1 },
      {
        sourcePayload: {
          name: 'wf',
          workflowDsl: {},
          paramsSchema: { properties: { q: { type: 'string' } }, required: [] },
          contracts: {
            output: {
              schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] },
            },
          },
        },
      },
      { id: 'v1' }
    );

    expect(payload.outputSchema).toEqual({
      type: 'object',
      properties: { result: { type: 'string' } },
      required: ['result'],
    });
  });

  it('falls back to manifest.spec.contracts.output.schema, then top-level outputSchema', () => {
    const service = createService();
    const manifest = (service as any).buildSkillDraftPayload(
      { sourceType: 'temporal_workflow', sourceId: 'wf-2', releaseVersion: 2 },
      {
        sourcePayload: {
          name: 'wf2',
          workflowDsl: {},
          manifest: {
            spec: {
              contracts: { output: { schema: { type: 'object', properties: { fromManifest: { type: 'string' } } } } },
            },
          },
        },
      },
      { id: 'v2' }
    );
    expect(manifest.outputSchema).toEqual({ type: 'object', properties: { fromManifest: { type: 'string' } } });

    const topLevel = (service as any).buildSkillDraftPayload(
      { sourceType: 'temporal_workflow', sourceId: 'wf-3', releaseVersion: 3 },
      {
        sourcePayload: {
          name: 'wf3',
          workflowDsl: {},
          outputSchema: { type: 'object', properties: { fromTop: { type: 'string' } } },
        },
      },
      { id: 'v3' }
    );
    expect(topLevel.outputSchema).toEqual({ type: 'object', properties: { fromTop: { type: 'string' } } });
  });

  it('omits outputSchema when the source payload declares none (draft stays minimal)', () => {
    const service = createService();
    const payload = (service as any).buildSkillDraftPayload(
      { sourceType: 'temporal_workflow', sourceId: 'wf-4', releaseVersion: 4 },
      { sourcePayload: { name: 'wf4', workflowDsl: {} } },
      { id: 'v4' }
    );
    expect(payload.outputSchema).toBeUndefined();
  });
});
