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
});
