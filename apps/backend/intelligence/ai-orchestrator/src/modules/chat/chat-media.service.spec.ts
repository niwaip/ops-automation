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

  it('stores uploaded file and reuses it when building multimodal content', async () => {
    const { service } = createService();
    const uploadResult = service.uploadChatFile({
      originalname: 'hello.txt',
      mimetype: 'text/plain',
      size: 5,
      buffer: Buffer.from('hello', 'utf-8'),
    } as Express.Multer.File);

    const content = await service.buildMessageContent('请分析附件', [
      {
        ...uploadResult,
      },
    ]);

    expect(uploadResult.fileId).toContain('file-');
    expect(content).toEqual([
      { type: 'text', text: '请分析附件' },
      { type: 'text', text: '\n【文件: hello.txt】\nhello' },
    ]);
  });

  it('hydrates canonical upload bytes for task execution without trusting client content', () => {
    const { service } = createService();
    const uploadResult = service.uploadChatFile({
      originalname: 'source.pdf',
      mimetype: 'application/pdf',
      size: 4,
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
    } as Express.Multer.File);

    const [resolved] = service.resolveUploadedFiles([
      { ...uploadResult, content: 'untrusted-client-value' },
    ]);

    expect(resolved).toBeDefined();
    if (!resolved) throw new Error('Expected resolved upload');
    expect(resolved.content).toBe(Buffer.from([0x25, 0x50, 0x44, 0x46]).toString('base64'));
    expect(resolved.mimeType).toBe('application/pdf');
  });
});
