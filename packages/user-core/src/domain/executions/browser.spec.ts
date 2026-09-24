import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBrowserExecutionResult } from '../../../dist/domain/executions/browser.js';

describe('extractBrowserExecutionResult', () => {
  it('should return null when runtimeType is non-browser (e.g. http or workflow)', () => {
    const input = {
      runtimeType: 'workflow',
      result: {
        stepResults: [{ action: 'execute_custom' }],
      },
    };
    assert.equal(extractBrowserExecutionResult(input), null);
  });

  it('should correctly parse browser execution with stepResults', () => {
    const input = {
      runtimeSessionId: 'sess-123',
      backend: 'playwright-cli',
      stepResults: [
        {
          stepId: 'step-1',
          action: 'click',
          target: 'button#submit',
          snapshotId: 'snap-001',
        },
      ],
    };
    const result = extractBrowserExecutionResult(input);
    assert.ok(result);
    assert.equal(result.runtimeSessionId, 'sess-123');
    assert.equal(result.backend, 'playwright-cli');
    assert.equal(result.stepResults.length, 1);
    assert.equal(result.stepResults[0].action, 'click');
    assert.equal(result.stepResults[0].target, 'button#submit');
  });

  it('should parse failed action and step information', () => {
    const input = {
      runtimeType: 'browser',
      stepResults: [
        {
          stepId: 'step-fail',
          action: 'fill',
          status: 'failed',
        },
      ],
      failedStep: 'step-fail',
      failedAction: 'fill',
    };
    const result = extractBrowserExecutionResult(input);
    assert.ok(result);
    assert.equal(result.failedStep, 'step-fail');
    assert.equal(result.failedAction, 'fill');
  });
});
