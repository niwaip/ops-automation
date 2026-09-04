import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';

describe('CapabilityReleaseSkillDraftService', () => {
  it('preserves recorder trigger keywords as deterministic browser routing aliases', () => {
    const browserRecordingService = {
      normalizeExecutionFlow: jest.fn().mockReturnValue([]),
      mergeToolsWithExecutionFlow: jest.fn().mockReturnValue(['browser_execute']),
    };
    const temporalSchemaService = {
      buildTemporalOutputParamsFromValidation: jest.fn().mockReturnValue({}),
      extractTemporalExpectedResult: jest.fn().mockReturnValue(undefined),
    };
    const service = new CapabilityReleaseSkillDraftService(
      browserRecordingService as any,
      temporalSchemaService as any
    );

    const draft = service.buildSkillDraftPayload(
      {
        id: 'release-1',
        sourceType: 'browser_recording',
        releaseVersion: 1,
      } as any,
      {
        id: 'snapshot-1',
        sourcePayload: {
          name: '打开网页 总结信息',
          triggerKeywords: ['打开网页 总结信息', '打开网页', '总结信息'],
          executionFlowKeys: ['browser_execute'],
          paramsSchema: { properties: {}, required: [] },
          executionFlow: [],
          apiEndpoints: { runtimeMetadata: { sourceType: 'browser_recording' } },
        },
      } as any,
      { id: 'validation-1', resultSnapshot: {} } as any
    );

    expect(draft.triggerKeywords).toEqual(
      expect.arrayContaining(['打开网页 总结信息', '打开网页', '总结信息', 'browser_execute'])
    );
    expect((draft.apiEndpoints as any).runtimeMetadata.routingAliases).toEqual(
      expect.arrayContaining(['打开网页', '总结信息'])
    );
  });

  it('infers 1D string array schema when description contains "列表" and runtime evidence is string array', () => {
    const service = new CapabilityReleaseSkillDraftService(
      { normalizeExecutionFlow: jest.fn(), mergeToolsWithExecutionFlow: jest.fn() } as any,
      {
        buildTemporalOutputParamsFromValidation: jest.fn().mockReturnValue({}),
        extractTemporalExpectedResult: jest.fn().mockReturnValue(undefined),
        resolveEffectiveTemporalParamsSchema: jest.fn().mockReturnValue({ properties: {}, required: [] }),
        extractTemporalWorkflowInputPolicy: jest.fn().mockReturnValue(undefined),
        extractTemporalSourceTemplate: jest.fn().mockReturnValue(undefined),
      } as any
    );

    const draft = service.buildSkillDraftPayload(
      {
        id: 'release-2',
        sourceType: 'temporal_workflow',
        releaseVersion: 1,
      } as any,
      {
        id: 'snapshot-2',
        sourcePayload: {
          name: 'EmailInboxSyncWorkflow',
          outputParams: {
            messageIds: {
              type: 'array',
              description: '已成功写入 GTD 收件箱的邮件 messageId 列表',
            },
          },
        },
      } as any,
      {
        id: 'validation-2',
        resultSnapshot: {
          businessData: {
            messageIds: ['mail_sample_001'],
          },
        },
      } as any
    );

    const outputSchema = draft.outputSchema as any;
    expect(outputSchema).toBeDefined();
    expect(outputSchema.properties.messageIds).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: '已成功写入 GTD 收件箱的邮件 messageId 列表',
    });
  });
});

