import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { WorkspaceNoteService } from '../src/modules/workspace/workspace-note.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { STORAGE_DRIVER } from '../src/modules/workspace/storage/storage-driver.interface';
import { WorkspaceContentIndexerService } from '../src/modules/workspace/workspace-content-indexer.service';
import { WorkspaceDigestService } from '../src/modules/workspace/workspace-digest.service';

jest.mock('axios');

describe('WorkspaceNoteService', () => {
  let service: WorkspaceNoteService;
  let mockPrisma: any;
  let mockStorage: any;
  let mockIndexer: any;
  let mockDigest: any;

  beforeEach(async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: {
        response: JSON.stringify({
          title: '精炼标题',
          tags: ['标签'],
          summary: '摘要',
          refinedContent: '正文',
        }),
      },
    });

    mockPrisma = {
      workspace: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      workspaceNode: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => ({
          ...args.data,
          id: args.data.id || 'generated-id',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockStorage = {
      putFile: jest.fn().mockResolvedValue(undefined),
      getFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    mockIndexer = {
      extractText: jest.fn().mockResolvedValue('Extracted Text'),
      cacheExtractedText: jest.fn().mockResolvedValue(undefined),
    };

    mockDigest = {
      generateAndSaveDigest: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceNoteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_DRIVER, useValue: mockStorage },
        { provide: WorkspaceContentIndexerService, useValue: mockIndexer },
        { provide: WorkspaceDigestService, useValue: mockDigest },
      ],
    }).compile();

    service = module.get<WorkspaceNoteService>(WorkspaceNoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should format Markdown note with FrontMatter and save node to personal workspace', async () => {
    const userId = 'user-123';
    const personalWorkspace = {
      id: 'ws-personal-1',
      name: '我的空间',
      type: 'personal',
      ownerUserId: userId,
      quotaBytes: BigInt(1000000),
      usedBytes: BigInt(100),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.workspace.findFirst.mockResolvedValue(personalWorkspace);
    mockPrisma.workspaceNode.findFirst.mockResolvedValue(null);
    mockPrisma.workspaceNode.create.mockImplementation((args: any) => ({
      ...args.data,
      id: args.data.id || 'generated-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.saveTextNote(userId, {
      title: '上海天气预报',
      content: '今日上海多云转阵雨，气温 30°C。',
      userQuery: '查看上海的天气',
      tags: ['天气', '生活'],
      type: 'task_result',
      sessionId: 'sess-1',
      messageId: 'msg-1',
      executionId: 'exec-1',
      rawResultData: { tempC: '30', condition: 'rain' },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('上海天气预报.md');
    expect(result.type).toBe('file');
    expect(mockStorage.putFile).toHaveBeenCalled();

    const [storageKey, buffer] = mockStorage.putFile.mock.calls[0];
    expect(storageKey).toContain('personal/ws-personal-1');
    const storedText = buffer.toString('utf-8');
    expect(storedText).toContain('status: "candidate"');
    expect(storedText).toContain('title: "上海天气预报"');
    expect(storedText).toContain('execution_id: "exec-1"');
    expect(storedText).toContain('## 📌 提问背景');
    expect(storedText).toContain('> 查看上海的天气');
    expect(storedText).toContain('## 🔍 原始佐证与执行详情');
    expect(storedText).toContain('"tempC": "30"');
    expect(storedText).toContain('## 📝 知识核验与批注');
  });

  it('should throw BadRequestException if title is missing', async () => {
    await expect(
      service.saveTextNote('user-1', {
        title: '',
        content: 'some content',
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if quota is exceeded', async () => {
    const userId = 'user-123';
    const personalWorkspace = {
      id: 'ws-personal-1',
      name: '我的空间',
      type: 'personal',
      ownerUserId: userId,
      quotaBytes: BigInt(50),
      usedBytes: BigInt(50),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.workspace.findFirst.mockResolvedValue(personalWorkspace);

    await expect(
      service.saveTextNote(userId, {
        title: '巨大文档',
        content: '这是一段很长的内容'.repeat(10),
      })
    ).rejects.toThrow('工作空间存储配额已满');
  });

  it('should call LLM and refine document in background', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        response: JSON.stringify({
          title: '2026-09-04 上海气象预警与出行建议',
          tags: ['气象', '上海', '出行'],
          summary: '今日上海多云转阵雨，体感34度。',
          refinedContent: '精炼正文内容',
        }),
      },
    });

    await service.refineNoteWithAi(
      'node-1',
      'storage/key/1.md',
      'old.md',
      {
        title: '初始标题',
        content: '初始正文',
        userQuery: '查看上海天气',
      },
      'user-123'
    );

    expect(mockStorage.putFile).toHaveBeenCalled();
    expect(mockPrisma.workspaceNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'node-1' },
        data: expect.objectContaining({
          name: '2026-09-04 上海气象预警与出行建议.md',
        }),
      })
    );
  });
});
