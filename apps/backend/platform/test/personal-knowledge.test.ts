import { PersonalKnowledgeService, scorePersonalKnowledge, WorkspaceContentIndexerService } from '@ops/workbench/workspace';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const original = '---\ntitle: 阿里云AI开发\ntags: ["AI网关", "MCP协议"]\n---\n# 网关实践\n这是最新的个人资料。';

describe('Personal knowledge uses workspace originals', () => {
  let service: PersonalKnowledgeService;
  let prisma: any;
  let storage: any;
  let indexer: any;
  let node: any;

  beforeEach(() => {
    node = { id: documentId, workspaceId, parentId: null, type: 'file', name: '阿里云AI开发.md',
      storagePath: `personal/${workspaceId}/note.md`, updatedAt: new Date(),
      digestJson: { keyTopics: ['旧标签'], cleanedContent: '旧副本内容' } };
    prisma = { workspace: { findFirst: jest.fn().mockResolvedValue({ id: workspaceId }) },
      workspaceNode: { findMany: jest.fn().mockImplementation(async () => [node]) } };
    storage = { getFile: jest.fn().mockResolvedValue(Buffer.from(original)) };
    indexer = { isTextFile: jest.fn().mockReturnValue(true), getExtractedText: jest.fn().mockResolvedValue('旧缓存') };
    service = new PersonalKnowledgeService(prisma, storage, indexer);
  });

  it('matches original AI网关 tag and bypasses stale digest/content caches', async () => {
    const result = await service.search('user-1', '关于ai网关呢');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({ id: documentId, tags: expect.arrayContaining(['AI网关']), content: original });
    expect(indexer.getExtractedText).not.toHaveBeenCalled();
    expect(result.documents[0].tags).toEqual(['AI网关', 'MCP协议']);
    expect((await service.search('user-1', '旧标签')).documents).toEqual([]);
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({ where: { type: 'personal', ownerUserId: 'user-1' } });
  });

  it('uses fresh bytes on every read and respects deletion without a stale fallback', async () => {
    const first = await service.read('user-1', workspaceId, documentId);
    storage.getFile.mockResolvedValue(Buffer.from(original.replace('最新', '再次更新')));
    const second = await service.read('user-1', workspaceId, documentId);
    expect(second.contentSha256).not.toBe(first.contentSha256);
    expect(second.content).toContain('再次更新');
    prisma.workspaceNode.findMany.mockResolvedValue([]);
    await expect(service.read('user-1', workspaceId, documentId)).rejects.toThrow('个人资料不存在或无权读取');
  });

  it('does not read other workspace IDs, temporary files, noncanonical paths, or cycles', async () => {
    const temp = { id: 'temp', parentId: null, name: '临时工作区 (temp)', type: 'folder' };
    prisma.workspaceNode.findMany.mockResolvedValue([temp, { ...node, parentId: 'temp' },
      { ...node, storagePath: 'company/other/private.md' },
      { ...node, id: 'cycle', parentId: 'cycle' }]);
    expect((await service.search('user-1', 'AI网关')).documents).toEqual([]);
    expect(storage.getFile).not.toHaveBeenCalled();
    await expect(service.read('user-1', 'other-workspace', documentId)).rejects.toThrow();
  });

  it('does not return unrelated generic AI content', async () => {
    expect((await service.search('user-1', '今天北京天气怎么样')).documents).toEqual([]);
    expect(scorePersonalKnowledge('AI', '任意资料', '', ['AI'], '普通正文')).toBe(0);
    expect(scorePersonalKnowledge('翻译这个PDF', 'other.pdf', '', ['PDF', 'AI'], '')).toBe(0);
  });

  it('normalizes mixed-language tag spacing and records unreadable originals', async () => {
    expect(scorePersonalKnowledge('关于AI 网关呢', '资料', '', ['AI网关'], '')).toBe(500);
    storage.getFile.mockRejectedValue(new Error('missing'));
    expect(await service.search('user-1', 'ai网关')).toMatchObject({ failedDocuments: 1, documents: [] });
  });

  it('preview reads text originals even when an old extracted cache exists', async () => {
    const files = {
      exists: jest.fn().mockResolvedValue(true),
      getFile: jest.fn().mockImplementation(async (key: string) => Buffer.from(key.endsWith('.extracted.txt') ? 'old' : original)),
    };
    const preview = new WorkspaceContentIndexerService(files as any);
    expect(await preview.getExtractedText('note.md', 'note.md')).toBe(original);
    expect(files.getFile).not.toHaveBeenCalledWith('note.md.extracted.txt');
  });

  it('rejects invalid read ranges and missing authenticated users', async () => {
    await expect(service.read('user-1', workspaceId, documentId, 0)).rejects.toThrow('行号无效');
    await expect(service.search('anonymous', 'test')).rejects.toThrow('缺少已认证用户');
  });
});
