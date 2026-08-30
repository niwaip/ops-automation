import { BrowserLegacyOutputAdapter } from './browser-legacy-output.adapter';
import { BrowserRunOutputMaterializerService } from './browser-run-output-materializer.service';
import { CapabilityReleaseBrowserRuntimeResultService } from '../capability-release-browser-runtime-result.service';

describe('CapabilityReleaseBrowserRuntimeResultService', () => {
  const oldFlag = process.env.BROWSER_RUN_OUTPUT_V2_ENABLED;
  const oldDualWriteFlag = process.env.BROWSER_RUN_OUTPUT_V2_DUAL_WRITE;

  afterEach(() => {
    process.env.BROWSER_RUN_OUTPUT_V2_ENABLED = oldFlag;
    process.env.BROWSER_RUN_OUTPUT_V2_DUAL_WRITE = oldDualWriteFlag;
  });

  it('dual-writes declared outputs and the legacy envelope for opted-in recordings', () => {
    process.env.BROWSER_RUN_OUTPUT_V2_ENABLED = 'true';
    process.env.BROWSER_RUN_OUTPUT_V2_DUAL_WRITE = 'true';
    const service = new CapabilityReleaseBrowserRuntimeResultService(
      new BrowserRunOutputMaterializerService(),
      new BrowserLegacyOutputAdapter()
    );
    const payload = service.buildRuntimePayload({
      runtimeSessionId: 'session-1',
      runtimeExecutionId: 'execution-1',
      backend: 'cli',
      runtimeTrace: {},
      planValidation: {
        valid: true, errors: [], degradedMode: false, degradeReason: null,
        executionPlanVersion: 'browser-recording-ir/v1', trace: {},
        outputNames: ['browserRunOutput', 'pageState'], browserRunOutputV2: true,
      },
      state: {
        preserveRuntimeSession: false, startedAt: '2026-08-26T00:00:00.000Z',
        captureOrdinal: 0, attemptByStepId: {}, currentPageUrl: 'https://example.com',
        variables: {}, runtimeEvidence: {}, warnings: [], logs: [],
        stepResults: [{ stepId: 'open', action: 'goto', success: true, pageState: { pageUrl: 'https://example.com' } }],
      },
    });

    expect(payload.browserRunOutput).toBeDefined();
    expect(payload.pageState).toEqual(expect.objectContaining({ url: 'https://example.com' }));
    expect(payload.stepResults).toHaveLength(1);
  });

  it('binds cleaned content to the declared source browser step', () => {
    process.env.BROWSER_RUN_OUTPUT_V2_ENABLED = 'true';
    const service = new CapabilityReleaseBrowserRuntimeResultService(
      new BrowserRunOutputMaterializerService(),
      new BrowserLegacyOutputAdapter()
    );
    const payload = service.buildRuntimePayload({
      runtimeSessionId: 'session-1', runtimeExecutionId: 'execution-1', backend: 'cli', runtimeTrace: {},
      planValidation: {
        valid: true, errors: [], degradedMode: false, degradeReason: null,
        executionPlanVersion: 'browser-recording-ir/v1', trace: {}, outputNames: [], browserRunOutputV2: true,
        composition: {
          pageAliases: [{ alias: 'target', sourceStepId: 'step_2', match: {} }],
          outputDeclarations: [{ name: 'step_2_clean_content', sourcePageAlias: 'target', kind: 'content' }],
        },
      },
      state: {
        preserveRuntimeSession: false, startedAt: '2026-08-26T00:00:00.000Z', captureOrdinal: 0,
        attemptByStepId: {}, variables: {}, runtimeEvidence: {}, warnings: [], logs: [], stepResults: [],
        contentCandidates: [
          { sourceStepId: 'step_1', text: 'wrong page' },
          { sourceStepId: 'step_2', text: 'selected page' },
        ],
      },
    });

    expect(payload.step_2_clean_content).toEqual(expect.objectContaining({ text: 'selected page' }));
    expect((payload.step_2_clean_content as any).text).not.toBe('wrong page');
  });
});
