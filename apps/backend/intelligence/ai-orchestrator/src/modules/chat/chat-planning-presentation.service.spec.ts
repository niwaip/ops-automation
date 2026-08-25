import { ChatPlanningPresentationService } from './chat-planning-presentation.service';

describe('ChatPlanningPresentationService', () => {
  it('exposes prompt snapshots only to admins when debug is enabled', () => {
    const service = new ChatPlanningPresentationService({
      isPromptDebugEnabled: jest.fn().mockReturnValue(true),
    } as any);
    expect(service.canExposePromptDebug({ userRoles: ['employee'] } as any)).toBe(false);
    expect(service.canExposePromptDebug({ userRoles: ['admin'] } as any)).toBe(true);
  });

  it('keeps PDF content in system-collected params and out of the planning request', () => {
    const service = new ChatPlanningPresentationService({
      isPromptDebugEnabled: jest.fn().mockReturnValue(false),
    } as any);
    const files = [
      { fileName: 'report.pdf', mimeType: 'application/pdf', content: 'base64-payload' },
    ];
    expect(service.buildUploadedFileParams(files)).toEqual({
      fileBase64: 'base64-payload',
      fileName: 'report.pdf',
    });
    const request = service.buildPlanningRequest('总结附件', files);
    expect(request).toContain('用户已上传 PDF 附件');
    expect(request).not.toContain('base64-payload');
  });

  it('does not mutate deterministic nodes while formatting', () => {
    const service = new ChatPlanningPresentationService({} as any);
    const nodes = [
      {
        kind: 'skill',
        sequence: 2,
        title: 'B',
        skillId: 'b',
        skillVersion: '1',
        runtimeType: 'api',
      },
      {
        kind: 'skill',
        sequence: 1,
        title: 'A',
        skillId: 'a',
        skillVersion: '1',
        runtimeType: 'api',
      },
    ] as any;
    expect(service.formatDeterministicPlanNodes(nodes)).toContain('1. A');
    expect(nodes[0].sequence).toBe(2);
  });
});
