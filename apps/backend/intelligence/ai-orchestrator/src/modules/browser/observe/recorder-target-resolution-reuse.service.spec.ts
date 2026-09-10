import { RecorderTargetResolutionReuseService } from './recorder-target-resolution-reuse.service';

describe('RecorderTargetResolutionReuseService', () => {
  let service: RecorderTargetResolutionReuseService;

  beforeEach(() => {
    service = new RecorderTargetResolutionReuseService();
  });

  it('should record and resolve successful intent execution from cache when target is present', () => {
    const observation: any = {
      currentPageUrl: 'https://example.com/app',
      structuralHash: 'struct-123',
      candidates: [
        {
          candidateId: 'c1',
          kind: 'action',
          preferredLocator: { type: 'css', value: '#submit-btn' },
          text: '提交',
        },
      ],
      buttons: [{ text: '提交', dataTestId: 'submit-btn' }],
      inputs: [],
    };

    // Cache should miss initially
    const initial = service.tryResolveFromIntentCache({
      message: '点击提交',
      observation,
    });
    expect(initial).toBeNull();

    // Record execution
    service.recordSuccessfulIntentExecution({
      message: '点击提交',
      observation,
      commands: [{ tool: 'click', params: { target: '#submit-btn' } }],
      explanation: '点击提交按钮',
    });

    // Cache should hit now
    const cached = service.tryResolveFromIntentCache({
      message: '点击提交',
      observation,
    });
    expect(cached).not.toBeNull();
    expect(cached?.success).toBe(true);
    expect(cached?.commands).toEqual([{ tool: 'click', params: { target: '#submit-btn' } }]);
    expect(cached?.parserMetadata?.parserSource).toBe('intent-cache');
  });

  it('should invalidate cache when target element is no longer present on page', () => {
    const observationWithTarget: any = {
      currentPageUrl: 'https://example.com/app',
      structuralHash: 'struct-123',
      candidates: [
        {
          candidateId: 'c1',
          kind: 'action',
          preferredLocator: { type: 'css', value: '#submit-btn' },
        },
      ],
      buttons: [{ dataTestId: 'submit-btn' }],
      inputs: [],
    };

    service.recordSuccessfulIntentExecution({
      message: '点击提交',
      observation: observationWithTarget,
      commands: [{ tool: 'click', params: { target: '#submit-btn' } }],
    });

    // Subsequent observation where target element has disappeared
    const observationWithoutTarget: any = {
      currentPageUrl: 'https://example.com/app',
      structuralHash: 'struct-123',
      candidates: [],
      buttons: [],
      inputs: [],
    };

    const result = service.tryResolveFromIntentCache({
      message: '点击提交',
      observation: observationWithoutTarget,
    });
    expect(result).toBeNull();

    // Cache should now be purged
    const secondTry = service.tryResolveFromIntentCache({
      message: '点击提交',
      observation: observationWithoutTarget,
    });
    expect(secondTry).toBeNull();
  });

  it('should invalidate cache explicitly via invalidateIntentCache', () => {
    const observation: any = {
      currentPageUrl: 'https://example.com/app',
      structuralHash: 'struct-999',
      candidates: [{ preferredLocator: { type: 'css', value: '#btn' } }],
      buttons: [{ dataTestId: '#btn' }],
      inputs: [],
    };

    service.recordSuccessfulIntentExecution({
      message: '点击按钮',
      observation,
      commands: [{ tool: 'click', params: { target: '#btn' } }],
    });

    service.invalidateIntentCache({ structuralKey: 'struct-999', message: '点击按钮' });

    const result = service.tryResolveFromIntentCache({
      message: '点击按钮',
      observation,
    });
    expect(result).toBeNull();
  });
});
