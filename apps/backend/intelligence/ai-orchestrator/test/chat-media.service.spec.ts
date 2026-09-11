import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChatMediaService } from '../src/modules/chat/chat-media.service';
import type { ModelService } from '../src/modules/model/model.service';
import type { ChatUploadedFileDTO } from '../src/modules/chat/chat.dto';

describe('ChatMediaService with Durable Storage', () => {
  let service: ChatMediaService;
  let tempStorageDir: string;
  let mockModelService: Partial<ModelService>;

  beforeEach(() => {
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-media-test-'));
    process.env.CHAT_UPLOAD_STORAGE_ROOT = tempStorageDir;

    mockModelService = {
      getModel: jest.fn(),
      getPreferredDefaultModel: jest.fn(),
      getClient: jest.fn(),
    };

    service = new ChatMediaService(mockModelService as ModelService);
  });

  afterEach(() => {
    delete process.env.CHAT_UPLOAD_STORAGE_ROOT;
    if (fs.existsSync(tempStorageDir)) {
      fs.rmSync(tempStorageDir, { recursive: true, force: true });
    }
  });

  describe('uploadChatFile', () => {
    it('should persist uploaded file and metadata to disk', () => {
      const mockFile = {
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 mock pdf binary content'),
      } as Express.Multer.File;

      const res = service.uploadChatFile(mockFile);

      expect(res.fileId).toBeDefined();
      expect(res.fileName).toBe('invoice.pdf');
      expect(res.mimeType).toBe('application/pdf');
      expect(res.filePath).toBeDefined();

      // Verify file and metadata exist on disk
      expect(fs.existsSync(res.filePath!)).toBe(true);
      const metaPath = path.join(tempStorageDir, `${res.fileId}.meta.json`);
      expect(fs.existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.fileId).toBe(res.fileId);
      expect(meta.fileName).toBe('invoice.pdf');
      expect(meta.mimeType).toBe('application/pdf');
    });

    it('should throw BadRequest when no file provided', () => {
      expect(() => service.uploadChatFile(null as any)).toThrow();
    });
  });

  const defaultUser = { userId: 'user-default-1', organizationId: 'org-default-1' };

  describe('resolveUploadedFiles', () => {
    it('should resolve from memory when present in active session', async () => {
      const mockFile = {
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        size: 12,
        buffer: Buffer.from('hello world'),
      } as Express.Multer.File;

      const uploadRes = service.uploadChatFile(mockFile, defaultUser);
      const resolved = await service.resolveUploadedFiles(
        [{ fileId: uploadRes.fileId, fileName: 'notes.txt', mimeType: 'text/plain', size: 12 }],
        defaultUser
      );

      expect(resolved).toHaveLength(1);
      expect(resolved[0].content).toBe(Buffer.from('hello world').toString('base64'));
      expect(resolved[0].filePath).toBe(uploadRes.filePath);
    });

    it('should self-heal and resolve from disk after memory cache eviction or restart', async () => {
      const mockFile = {
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        size: 20,
        buffer: Buffer.from('%PDF-1.4 durable contract payload'),
      } as Express.Multer.File;

      const uploadRes = service.uploadChatFile(mockFile, defaultUser);

      // Simulate new service instance (restart / cache eviction)
      const freshService = new ChatMediaService(mockModelService as ModelService);

      const resolved = await freshService.resolveUploadedFiles(
        [{ fileId: uploadRes.fileId, fileName: 'contract.pdf', mimeType: 'application/pdf', size: 20 }],
        defaultUser
      );

      expect(resolved).toHaveLength(1);
      expect(resolved[0].fileId).toBe(uploadRes.fileId);
      expect(resolved[0].content).toBe(Buffer.from('%PDF-1.4 durable contract payload').toString('base64'));
      expect(resolved[0].filePath).toBe(uploadRes.filePath);
    });

    it('should prevent cross-tenant and cross-user file access', async () => {
      const mockFile = {
        originalname: 'secret-tenant-data.pdf',
        mimetype: 'application/pdf',
        size: 16,
        buffer: Buffer.from('%PDF-1.4 tenant-a-secrets'),
      } as Express.Multer.File;

      const userA = { userId: 'user-101', organizationId: 'org-1' };
      const userB = { userId: 'user-202', organizationId: 'org-2' };
      const adminUser = { userId: 'admin-999', organizationId: 'org-other', role: 'admin' };

      const uploadRes = service.uploadChatFile(mockFile, userA);

      // User B (different user & org) should NOT be able to resolve User A's file
      const blocked = await service.resolveUploadedFiles(
        [{ fileId: uploadRes.fileId, fileName: 'secret-tenant-data.pdf' }],
        userB
      );
      expect(blocked).toHaveLength(0);

      // User A should be able to resolve their own file
      const allowedSelf = await service.resolveUploadedFiles(
        [{ fileId: uploadRes.fileId, fileName: 'secret-tenant-data.pdf' }],
        userA
      );
      expect(allowedSelf).toHaveLength(1);
      expect(allowedSelf[0].content).toBe(Buffer.from('%PDF-1.4 tenant-a-secrets').toString('base64'));

      // Admin should be able to resolve any file
      const allowedAdmin = await service.resolveUploadedFiles(
        [{ fileId: uploadRes.fileId, fileName: 'secret-tenant-data.pdf' }],
        adminUser
      );
      expect(allowedAdmin).toHaveLength(1);
    });

    it('should verify workspace file ownership via database', async () => {
      const workspaceDir = path.join(tempStorageDir, 'ws-100');
      fs.mkdirSync(workspaceDir, { recursive: true });
      const targetFile = path.join(workspaceDir, 'report.txt');
      fs.writeFileSync(targetFile, 'workspace secret data');

      process.env.WORKSPACE_STORAGE_ROOT = tempStorageDir;

      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
          const wsId = values[0];
          if (wsId === 'ws-100') {
            return [{ id: 'ws-100', type: 'personal', owner_user_id: 'user-owner', department_id: null }];
          }
          return [];
        }),
      };

      const wsService = new ChatMediaService(
        mockModelService as ModelService,
        undefined,
        mockPrisma as any
      );

      // Non-owner user trying to access personal workspace file -> blocked
      const nonOwner = { userId: 'user-intruder', organizationId: 'org-1' };
      const blocked = await wsService.resolveUploadedFiles(
        [{ fileId: 'wsfile-1', storagePath: 'ws-100/report.txt', source: 'workspace' }],
        nonOwner
      );
      expect(blocked).toHaveLength(0);

      // Owner accessing personal workspace file -> allowed
      const owner = { userId: 'user-owner', organizationId: 'org-1' };
      const allowed = await wsService.resolveUploadedFiles(
        [{ fileId: 'wsfile-1', fileName: 'report.txt', storagePath: 'ws-100/report.txt', source: 'workspace' }],
        owner
      );
      expect(allowed).toHaveLength(1);
      expect(allowed[0].content).toBe(Buffer.from('workspace secret data').toString('base64'));

      delete process.env.WORKSPACE_STORAGE_ROOT;
    });
  });

  describe('buildMessageContent', () => {
    it('should inject extracted text if available', async () => {
      const files: ChatUploadedFileDTO[] = [
        {
          fileId: 'f-1',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 100,
          extractedText: 'Extracted plain text from doc',
        },
      ];

      const content = await service.buildMessageContent('Please review', files, defaultUser);
      expect(Array.isArray(content)).toBe(true);
      const blocks = content as any[];
      expect(blocks).toHaveLength(2);
      expect(blocks[1].text).toContain('Extracted plain text from doc');
    });

    it('should format image as image_url block', async () => {
      const base64Img = Buffer.from('fake-image-bytes').toString('base64');
      const files: ChatUploadedFileDTO[] = [
        {
          fileId: 'img-1',
          fileName: 'chart.png',
          mimeType: 'image/png',
          size: base64Img.length,
          content: base64Img,
        },
      ];

      const content = await service.buildMessageContent('Look at this', files, defaultUser);
      expect(Array.isArray(content)).toBe(true);
      const blocks = content as any[];
      expect(blocks).toHaveLength(2);
      expect(blocks[1].type).toBe('image_url');
      expect(blocks[1].image_url.url).toContain('data:image/png;base64,');
    });
  });

  describe('normalizeContentToText', () => {
    it('should normalize string and block array', () => {
      expect(service.normalizeContentToText('plain text')).toBe('plain text');
      expect(
        service.normalizeContentToText([
          { type: 'text', text: 'line 1' },
          { type: 'image_url', image_url: { url: 'data:...' } },
          { type: 'text', text: 'line 2' },
        ])
      ).toBe('line 1\n[图片]\nline 2');
    });
  });
});
