import { BrowserStepRecoveryService } from './browser-step-recovery.service';

describe('BrowserStepRecoveryService', () => {
  const service = new BrowserStepRecoveryService();

  it('retries content-not-ready navigation once by default', () => {
    const dto = {
      action: 'navigate',
      captureProfile: { capture: { mainContent: true } },
    } as any;

    expect(service.resolveMaxAttempts(dto)).toBe(2);
    expect(
      service.shouldRetry(dto, { success: false, errorCode: 'CONTENT_NOT_READY' } as any, 1)
    ).toBe(true);
    expect(
      service.shouldRetry(dto, { success: false, errorCode: 'CONTENT_NOT_READY' } as any, 2)
    ).toBe(false);
  });

  it('does not repeat mutating non-navigation actions', () => {
    const dto = {
      action: 'click',
      captureProfile: { capture: { mainContent: true } },
    } as any;

    expect(service.resolveMaxAttempts(dto)).toBe(1);
  });

  it('honors a bounded template attempt policy', () => {
    const dto = {
      action: 'goto',
      captureProfile: {
        capture: { mainContent: true },
        readiness: { maxAttempts: 3, retryDelayMs: 0 },
      },
    } as any;

    expect(service.resolveMaxAttempts(dto)).toBe(3);
  });
});
