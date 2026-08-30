import { BrowserRecordingRuntimeStepBuilderService } from './browser-recording-runtime-step-builder.service';

describe('BrowserRecordingRuntimeStepBuilderService per-step capture', () => {
  it('does not leak a source-step-bound capture profile to other browser steps', () => {
    const service = new BrowserRecordingRuntimeStepBuilderService({
      normalizeExecutionFlow: jest.fn().mockReturnValue([]),
    } as any);
    const profile = {
      schemaVersion: 'capture-profile/v1',
      profile: 'article',
      capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
      limits: { htmlBytes: 1000, contentChars: 1000, tableCells: 10 },
    };

    const steps = service.buildRuntimeSteps({
      runtimeMetadata: {
        executionPlan: {
          templateSteps: [
            { step_id: 'step_1', action: 'navigate' },
            { step_id: 'step_2', action: 'read_page', capture_profile: profile },
          ],
        },
        composition: {
          pageAliases: [{ alias: 'page_step_2', sourceStepId: 'step_2', match: {}, captureProfile: profile }],
        },
      },
    }, {});

    expect(steps[0].captureProfile).toBeUndefined();
    expect(steps[1].captureProfile).toEqual(profile);
  });
});
