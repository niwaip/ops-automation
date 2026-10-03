import {
  extractRecoveryCheckpoint,
  sanitizeStepResultForRecovery,
  sanitizeStepOutput,
} from '../src/modules/execution/plan-runtime/recovery-checkpoint.mapper';

describe('recovery-checkpoint.mapper', () => {
  it('should strip screenshotBase64 and rawHtml from step output', () => {
    const rawOutput = {
      userField: 'value1',
      screenshotBase64: 'data:image/png;base64,' + 'A'.repeat(50000),
      rawHtml: '<html><body>' + 'x'.repeat(100000) + '</body></html>',
      nested: {
        safeField: 123,
        domSnapshot: 'large dom snapshot...',
      },
    };

    const sanitized = sanitizeStepOutput(rawOutput);
    expect(sanitized).toEqual({
      userField: 'value1',
      nested: {
        safeField: 123,
      },
    });
  });

  it('should sanitize step results and keep artifact references while dropping heavy content', () => {
    const rawStep = {
      stepId: 'step_10',
      name: '点击审批',
      action: 'click',
      target: '#approve-btn',
      attempt: 1,
      success: true,
      status: 'completed',
      outcome: 'approved',
      pageState: {
        pageUrl: 'https://erp.example.com/orders',
        pageTitle: '审批列表',
        screenshot: 'data:image/png;base64,' + 'B'.repeat(50000),
        html: '<html>...</html>',
      },
      artifacts: [
        {
          id: 'art-1',
          type: 'browser_page_screenshot',
          name: 'step10.png',
          url: '/browser/artifacts/step10.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          metadata: {
            pageId: 'page-1',
            screenshotBase64: 'data:...',
          },
        },
      ],
      output: {
        grossProfitRate: 25.5,
      },
    };

    const sanitized = sanitizeStepResultForRecovery(rawStep);
    expect(sanitized.stepId).toBe('step_10');
    expect(sanitized.action).toBe('click');
    expect(sanitized.success).toBe(true);
    expect(sanitized.pageState).toEqual({
      pageUrl: 'https://erp.example.com/orders',
      pageTitle: '审批列表',
    });
    expect(sanitized.artifacts).toEqual([
      {
        id: 'art-1',
        type: 'browser_page_screenshot',
        name: 'step10.png',
        url: '/browser/artifacts/step10.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        metadata: {
          pageId: 'page-1',
        },
      },
    ]);
    expect(sanitized.output).toEqual({
      grossProfitRate: 25.5,
    });
  });

  it('should reduce a 2.5MB simulated phase output down to under 30KB', () => {
    const heavySteps = Array.from({ length: 17 }, (_, i) => ({
      stepId: `step_${i}`,
      name: `Step ${i}`,
      action: 'action',
      attempt: 1,
      success: true,
      pageState: {
        pageUrl: 'https://erp.example.com',
        pageTitle: `Title ${i}`,
        screenshot: 'A'.repeat(80000), // ~80KB per step
        html: '<div/>'.repeat(10000), // ~50KB per step
      },
      artifacts: [
        {
          id: `art-${i}`,
          type: 'screenshot',
          url: `/browser/artifacts/art-${i}.png`,
          inlineText: 'Z'.repeat(10000),
          metadata: {
            screenshotBase64: 'B'.repeat(10000),
          },
        },
      ],
      output: {
        recordIndex: i,
        largeRaw: 'C'.repeat(10000),
      },
    }));

    const heavyNestedOutput = {
      variables: { currentBatch: '20261002' },
      runtimeEvidence: { currentLoopIteration: 2, currentStepId: 'step_9' },
      stepResults: heavySteps,
    };

    const rawJson = JSON.stringify(heavyNestedOutput);
    expect(Buffer.byteLength(rawJson, 'utf8')).toBeGreaterThan(2 * 1024 * 1024); // > 2MB

    const checkpoint = extractRecoveryCheckpoint(heavyNestedOutput);
    const checkpointJson = JSON.stringify(checkpoint);
    const checkpointBytes = Buffer.byteLength(checkpointJson, 'utf8');

    // Should be significantly smaller, well under 50KB
    expect(checkpointBytes).toBeLessThan(50 * 1024);
    expect(checkpoint.variables).toEqual({ currentBatch: '20261002' });
    expect(checkpoint.runtimeEvidence).toEqual({ currentLoopIteration: 2, currentStepId: 'step_9' });
    expect(checkpoint.previousStepResults).toHaveLength(17);
    expect(checkpoint.previousStepResults![0].stepId).toBe('step_0');
    expect(checkpoint.attemptByStepId).toEqual(expect.objectContaining({ step_0: 1 }));
  });

  it('should extract and preserve attemptByStepId from nested output or aggregate from steps', () => {
    const outputWithExplicitAttempts = {
      attemptByStepId: { step_7: 2, step_10: 1 },
      stepResults: [
        { stepId: 'step_7', attempt: 1 },
        { stepId: 'step_7', attempt: 2 },
        { stepId: 'step_10', attempt: 1 },
      ],
    };

    const checkpoint = extractRecoveryCheckpoint(outputWithExplicitAttempts);
    expect(checkpoint.attemptByStepId).toEqual({ step_7: 2, step_10: 1 });

    const outputWithoutExplicit = {
      stepResults: [
        { stepId: 'step_1', attempt: 1 },
        { stepId: 'step_1', attempt: 3 },
        { stepId: 'step_2', attempt: 1 },
      ],
    };

    const aggregated = extractRecoveryCheckpoint(outputWithoutExplicit);
    expect(aggregated.attemptByStepId).toEqual({ step_1: 3, step_2: 1 });
  });
});
