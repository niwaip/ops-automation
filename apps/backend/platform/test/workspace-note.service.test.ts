import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import {
  WorkspaceNoteService,
  STORAGE_DRIVER,
  WorkspaceContentIndexerService,
  WorkspaceDigestService,
  WorkspaceArtifactSyncHelper,
  WorkspaceNoteAiHelper,
} from '@ops/workbench/workspace';
import { WORKBENCH_PRISMA } from '@ops/workbench';

jest.mock('axios');

describe('WorkspaceNoteService', () => {
  let service: WorkspaceNoteService;
  let artifactSyncHelper: WorkspaceArtifactSyncHelper;
  let aiHelper: WorkspaceNoteAiHelper;
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
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args: any) => ({
          ...args.data,
          id: args.data.id || 'generated-id',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        update: jest.fn().mockResolvedValue({}),
      },
      executionArtifact: {
        findMany: jest.fn().mockResolvedValue([]),
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
        WorkspaceArtifactSyncHelper,
        WorkspaceNoteAiHelper,
        { provide: WORKBENCH_PRISMA, useValue: mockPrisma },
        { provide: STORAGE_DRIVER, useValue: mockStorage },
        { provide: WorkspaceContentIndexerService, useValue: mockIndexer },
        { provide: WorkspaceDigestService, useValue: mockDigest },
      ],
    }).compile();

    service = module.get<WorkspaceNoteService>(WorkspaceNoteService);
    artifactSyncHelper = module.get<WorkspaceArtifactSyncHelper>(WorkspaceArtifactSyncHelper);
    aiHelper = module.get<WorkspaceNoteAiHelper>(WorkspaceNoteAiHelper);
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

  it('should return existing node if identical note was saved within 5 minutes (idempotency)', () => {
    mockPrisma.workspace.findFirst.mockResolvedValue({
      id: 'ws-personal-1',
      name: '我的空间',
      type: 'personal',
      ownerUserId: 'user-1',
      quotaBytes: BigInt(1000000),
      usedBytes: BigInt(100),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const now = new Date();
    // Simulate folder lookup returning null so it creates folder (1 segment: 沙盒保存内容 (saved))
    mockPrisma.workspaceNode.findFirst
      .mockResolvedValueOnce(null) // folder segment: 沙盒保存内容 (saved)
      .mockResolvedValueOnce(null) // targetFolderNode lookup
      .mockResolvedValueOnce({
        id: 'existing-node-id',
        workspaceId: 'ws-personal-1',
        name: '测试文档.md',
        type: 'file',
        fileSize: BigInt(Buffer.from(
          service['buildStructuredMarkdown']({ title: '测试文档', content: '内容' }, now),
          'utf-8'
        ).length),
        mimeType: 'text/markdown',
        storagePath: 'path/to/existing',
        createdBy: 'user-1',
        createdAt: now,
        updatedAt: now,
      });

    return service
      .saveTextNote('user-1', {
        title: '测试文档',
        content: '内容',
      })
      .then((res) => {
        expect(res.id).toBe('existing-node-id');
        expect(res.name).toBe('测试文档.md');
      });
  });

  it('should save task results into 工作任务成果 (tasks) and query execution artifacts', async () => {
    const userId = 'user-task-1';
    const personalWorkspace = {
      id: 'ws-personal-task',
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
    mockPrisma.executionArtifact.findMany.mockResolvedValue([
      {
        id: 'art-1',
        executionId: 'exec-12345',
        name: '合同合规审查报告.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        url: 'http://carbone-engine:3009/renders/contract_review.docx',
      },
    ]);

    const result = await service.saveTextNote(userId, {
      title: '合同合规审查总结',
      content: '审查已完成，详情参见报告。',
      type: 'task_result',
      executionId: 'exec-12345',
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('合同合规审查总结.md');

    // 验证目标文件夹创建为 工作任务成果 (tasks)
    expect(mockPrisma.workspaceNode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '工作任务成果 (tasks)',
          type: 'folder',
        }),
      })
    );

    // 等待异步流水线在 setImmediate 中执行
    await new Promise((resolve) => setImmediate(resolve));

    // 验证 executionArtifact.findMany 被调用
    expect(mockPrisma.executionArtifact.findMany).toHaveBeenCalledWith({
      where: { executionId: 'exec-12345' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('should create dedicated subfolder under 沙盒保存内容 (saved) with YYYYMMDD_ prefix', async () => {
    const userId = 'user-qa-1';
    const personalWorkspace = {
      id: 'ws-personal-qa',
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

    const createdNodes: any[] = [];
    mockPrisma.workspaceNode.create.mockImplementation((args: any) => {
      const node = {
        ...args.data,
        id: `node-${createdNodes.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      createdNodes.push(node);
      return node;
    });

    const result = await service.saveTextNote(userId, {
      title: '市场运营方案',
      content: '请参考附件中的营销原型与报表。',
      userQuery: '生成一份Q3市场营销推广方案',
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('市场运营方案.md');

    // 1. 验证创建了根分类文件夹 "沙盒保存内容 (saved)"
    const baseFolder = createdNodes.find((n) => n.name === '沙盒保存内容 (saved)');
    expect(baseFolder).toBeDefined();
    expect(baseFolder.type).toBe('folder');

    // 2. 验证在分类文件夹下创建了专属子文件夹 (带日期前缀)
    const instanceFolder = createdNodes.find((n) => /^\d{8}_市场运营方案/.test(n.name));
    expect(instanceFolder).toBeDefined();
    expect(instanceFolder.type).toBe('folder');
    expect(instanceFolder.parentId).toBe(baseFolder.id);

    // 3. 验证主 Markdown 文档的 parentId 正确绑定为专属子文件夹 ID
    const noteFile = createdNodes.find((n) => n.name === '市场运营方案.md');
    expect(noteFile).toBeDefined();
    expect(noteFile.type).toBe('file');
    expect(noteFile.parentId).toBe(instanceFolder.id);
  });

  it('should refine folder name and inject artifact catalog via WorkspaceNoteAiHelper', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: {
        response: JSON.stringify({
          folderName: '20260920_生活出行_上海实时天气与出行指南',
          title: '上海实时气温与出行指南',
          tags: ['天气', '生活'],
          summary: '今日上海多云转阵雨，体感34度。',
          refinedContent: '## 核心要点\n出门建议备伞。',
          artifactsDescription: [
            { fileName: 'route_map.html', description: '交互式出行路线积水点分布图' },
          ],
        }),
      },
    });

    await aiHelper.refineFolderAndNoteWithAi({
      folderNodeId: 'folder-123',
      baseFolderId: 'base-saved-dir',
      currentFolderName: '20260920_初始文件夹',
      noteNodeId: 'note-456',
      noteStorageKey: 'personal/ws-1/note-456_test.md',
      currentNoteFileName: 'test.md',
      dto: {
        title: '天气分析',
        content: '上海有雨',
        userQuery: '上海天气怎么样',
      },
      userId: 'user-1',
      workspace: { id: 'ws-1', type: 'personal' },
      syncedArtifacts: [
        {
          id: 'art-1',
          name: 'route_map.html',
          mimeType: 'text/html',
          sizeBytes: BigInt(2048),
          storagePath: 'personal/ws-1/route_map.html',
        },
      ],
    });

    // 验证专属文件夹重命名为大模型规范格式
    expect(mockPrisma.workspaceNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'folder-123' },
        data: { name: '20260920_生活出行_上海实时天气与出行指南' },
      })
    );

    // 验证更新后的 Markdown 正文中注入了交付资产清单与相对链接
    expect(mockStorage.putFile).toHaveBeenCalled();
    const storageCall = mockStorage.putFile.mock.calls.find(
      (call: any[]) => call[0] === 'personal/ws-1/note-456_test.md'
    );
    expect(storageCall).toBeDefined();
    const updatedContent = storageCall[1].toString('utf-8');
    expect(updatedContent).toContain('## 📁 交付资产与文件清单');
    expect(updatedContent).toContain('route_map.html');
    expect(updatedContent).toContain('交互式出行路线积水点分布图');
  });
});

