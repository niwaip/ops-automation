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

  it('strictly blocks department and company workspace files in personal chat mode', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'ws-comp-1', type: 'company', owner_user_id: null, department_id: null },
      ]),
    };
    const modelService = {
      getPreferredDefaultModel: jest.fn(),
      getModel: jest.fn(),
      getClient: jest.fn(),
    };
    const service = new ChatMediaService(modelService as any, undefined, prisma as any);

    const personalUser = {
      userId: 'user-test-1',
      organizationId: 'org-test-1',
      mode: 'chat' as const,
    };

    const resolved = await service.resolveUploadedFiles(
      [
        {
          fileId: 'f-1',
          fileName: 'company-doc.pdf',
          mimeType: 'application/pdf',
          size: 100,
          source: 'workspace',
          storagePath: 'company/ws-comp-1/company-doc.pdf',
        },
      ],
      personalUser
    );
    expect(resolved).toEqual([]);
  });

  it('extracts Office document text when OfficeDocumentReaderService is provided', async () => {
    const modelService = {
      getPreferredDefaultModel: jest.fn(),
      getModel: jest.fn(),
      getClient: jest.fn(),
    };
    const officeReader = {
      supports: jest.fn().mockReturnValue(true),
      extractText: jest.fn().mockResolvedValue({
        format: 'docx',
        text: '保密协议条款内容：第一条...',
        characterCount: 15,
        truncated: false,
      }),
    };
    const service = new ChatMediaService(
      modelService as any,
      undefined,
      undefined,
      officeReader as any
    );

    const uploadResult = service.uploadChatFile(
      {
        originalname: '1234 (1).docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 8,
        buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]),
      } as Express.Multer.File,
      testUser
    );

    const content = await service.buildMessageContent(
      '查看文档内容',
      [uploadResult],
      testUser
    );

    expect(officeReader.supports).toHaveBeenCalledWith(
      '1234 (1).docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(officeReader.extractText).toHaveBeenCalled();
    expect(content).toEqual([
      { type: 'text', text: '查看文档内容' },
      {
        type: 'text',
        text: '\n【文件: 1234 (1).docx（DOCX 文档提取内容，共 15 字）】\n保密协议条款内容：第一条...',
      },
    ]);
  });

  it('injects extracted page images into contentBlocks for scanned PDFs', async () => {
    const modelService = {
      getPreferredDefaultModel: jest.fn(),
      getModel: jest.fn(),
      getClient: jest.fn(),
    };
    const officeReader = {
      supports: jest.fn().mockReturnValue(true),
      extractText: jest.fn().mockResolvedValue({
        format: 'pdf',
        text: '',
        characterCount: 0,
        truncated: false,
        isScannedOrImagePdf: true,
        images: [{ mimeType: 'image/jpeg', base64: 'fake-jpeg-base64' }],
      }),
    };
    const service = new ChatMediaService(
      modelService as any,
      undefined,
      undefined,
      officeReader as any
    );

    const uploadResult = service.uploadChatFile(
      {
        originalname: '1.pdf',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File,
      testUser
    );

    const content = await service.buildMessageContent(
      '查看附件的内容',
      [uploadResult],
      testUser
    );

    expect(content).toEqual([
      { type: 'text', text: '查看附件的内容' },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/jpeg;base64,fake-jpeg-base64',
          detail: 'auto',
        },
      },
      {
        type: 'text',
        text: '\n【文件: 1.pdf（扫描版/图片型 PDF，已提取 1 页图片送入多模态视觉模型进行图文解析）】',
      },
    ]);
  });
});
