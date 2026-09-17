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
      fileBase64A: 'base64-payload',
      fileNameA: 'report.pdf',
    });
    const twoFiles = [
      { fileName: 'orig.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', content: 'base64-a' },
      { fileName: 'revised.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', content: 'base64-b' },
    ];
    expect(service.buildUploadedFileParams(twoFiles)).toEqual({
      fileBase64: 'base64-a',
      fileName: 'orig.docx',
      fileBase64A: 'base64-a',
      fileNameA: 'orig.docx',
      fileBase64B: 'base64-b',
      fileNameB: 'revised.docx',
    });

    const fileWithStoragePath = [
      {
        fileName: 'contract.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: 'http://localhost:5174/studio/download/test-uuid-123',
      },
    ];
    expect(service.buildUploadedFileParams(fileWithStoragePath)).toEqual({
      fileName: 'contract.docx',
      fileNameA: 'contract.docx',
      fileUrl: 'http://localhost:5174/studio/download/test-uuid-123',
      fileUrlA: 'http://localhost:5174/studio/download/test-uuid-123',
      downloadUrl: 'http://localhost:5174/studio/download/test-uuid-123',
      downloadUrlA: 'http://localhost:5174/studio/download/test-uuid-123',
    });

    const msgWithMdLink = '请审查：[保密协议.docx](http://localhost:5174/studio/download/md-uuid-456)';
    expect(service.buildUploadedFileParams([], msgWithMdLink)).toEqual({
      fileName: '保密协议.docx',
      fileNameA: '保密协议.docx',
      fileUrl: 'http://localhost:5174/studio/download/md-uuid-456',
      fileUrlA: 'http://localhost:5174/studio/download/md-uuid-456',
      downloadUrl: 'http://localhost:5174/studio/download/md-uuid-456',
      downloadUrlA: 'http://localhost:5174/studio/download/md-uuid-456',
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
