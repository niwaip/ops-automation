import { BrowserRecordingExecutionPlanValidatorService } from '../../../registry-release/release-manager/src/validator/browser-recording-execution-plan-validator.service';

describe('BrowserRecordingExecutionPlanValidatorService', () => {
  it('drops empty legacy loopDraft during publish compatibility normalization', () => {
    const validator = new BrowserRecordingExecutionPlanValidatorService();
    const payload = {
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'browser_recording',
          executionPlan: {
            executionPlanVersion: 'browser-recording-ir/v1',
            templateSteps: [
              {
                step_id: 'step_1',
                action: 'navigate',
                params: { url: 'http://example.com/#approvals' },
                description: '打开起始页面',
              },
              {
                step_id: 'step_2',
                action: 'click',
                locator: { type: 'role', value: 'button[name="保留中"]' },
                description: '点击「保留中」筛选按钮，查看未承认的数据',
              },
            ],
            loopDraft: {
              mode: 'repeat_until',
              target: { scope: 'current_list', currentPageUrl: 'http://example.com/#approvals' },
              onNoProgress: 'takeover',
              maxIterations: 100,
            },
            outputs: [],
            executionLimits: { hasLoop: true, maxCommandCount: 2 },
            trace: { exportArtifactId: 'artifact-1' },
          },
        },
      },
    };

    const normalized = validator.normalizePayloadForCompatibility(payload);
    const runtimeMetadata = (normalized.apiEndpoints as Record<string, any>).runtimeMetadata;

    expect(runtimeMetadata.executionPlan.loopDraft).toBeUndefined();
    expect(runtimeMetadata.loopDraft).toBeUndefined();
    expect(validator.validateForPublish(normalized)).toMatchObject({
      valid: true,
      errors: [],
    });
  });
});
