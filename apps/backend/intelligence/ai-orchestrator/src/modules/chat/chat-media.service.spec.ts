import { ChatMediaService } from './chat-media.service';

describe('ChatMediaService', () => {
  const createService = () => {
    const modelService = {
      getPreferredDefaultModel: jest.fn(),
      getModel: jest.fn(),
      getClient: jest.fn(),
    };

    const service = new ChatMediaService(modelService as any);

    return {
      service,
      modelService,
    };
  };

  const testUser = { userId: 'user-test-1', organizationId: 'org-test-1' };

  it('stores uploaded file and reuses it when building multimodal content', async () => {
    const { service } = createService();
    const uploadResult = service.uploadChatFile(
      {
        originalname: 'hello.txt',
        mimetype: 'text/plain',
        size: 5,
        buffer: Buffer.from('hello', 'utf-8'),
      } as Express.Multer.File,
      testUser
    );

    const content = await service.buildMessageContent(
      '请分析附件',
      [
        {
          ...uploadResult,
        },
      ],
      testUser
    );

    expect(uploadResult.fileId).toContain('file-');
    expect(content).toEqual([
      { type: 'text', text: '请分析附件' },
      { type: 'text', text: '\n【文件: hello.txt】\nhello' },
    ]);
  });

  it('hydrates canonical upload bytes for task execution without trusting client content', async () => {
    const { service } = createService();
    const uploadResult = service.uploadChatFile(
      {
        originalname: 'source.pdf',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File,
      testUser
    );

    const [resolved] = await service.resolveUploadedFiles(
      [{ ...uploadResult, content: 'untrusted-client-value' }],
      testUser
    );

    expect(resolved).toBeDefined();
    if (!resolved) throw new Error('Expected resolved upload');
    expect(resolved.content).toBe(Buffer.from([0x25, 0x50, 0x44, 0x46]).toString('base64'));
    expect(resolved.mimeType).toBe('application/pdf');
  });

  it('rejects path traversal in fileId', async () => {
    const { service } = createService();
    const maliciousFiles = [
      { fileId: '../../../../etc/passwd', originalName: 'passwd' },
      { fileId: '..\\..\\..\\windows\\system32', originalName: 'cmd.exe' },
      { fileId: 'file-123/../../secret', originalName: 'secret' },
      { fileId: 'invalid!@#$', originalName: 'bad' },
    ];

    for (const badFile of maliciousFiles) {
      const resolved = await service.resolveUploadedFiles([badFile as any], testUser);
      expect(resolved).toEqual([]);

      const content = await service.buildMessageContent('prompt', [badFile as any], testUser);
      expect(content).toEqual([{ type: 'text', text: 'prompt' }]);
    }
  });

  it('rejects path traversal in storagePath', async () => {
    const { service } = createService();
    const maliciousFiles = [
      { storagePath: '../../../../etc/passwd', originalName: 'passwd' },
      { storagePath: '/etc/shadow', originalName: 'shadow' },
      { storagePath: 'uploads/../../sensitive.key', originalName: 'key' },
    ];

    for (const badFile of maliciousFiles) {
      const resolved = await service.resolveUploadedFiles([badFile as any], testUser);
      expect(resolved).toEqual([]);
    }
  });

  it('fails closed when contextUser is missing or unauthenticated', async () => {
    const { service } = createService();
    const uploadResult = service.uploadChatFile(
      {
        originalname: 'hello.txt',
        mimetype: 'text/plain',
        size: 5,
        buffer: Buffer.from('hello', 'utf-8'),
      } as Express.Multer.File,
      testUser
    );

    const resolvedWithoutUser = await service.resolveUploadedFiles(
      [{ ...uploadResult }],
      undefined as any
    );
    expect(resolvedWithoutUser).toEqual([]);

    const resolvedEmptyUser = await service.resolveUploadedFiles(
      [{ ...uploadResult }],
      {} as any
    );
    expect(resolvedEmptyUser).toEqual([]);
  });
});
