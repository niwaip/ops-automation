import axios from 'axios';
import { ChatKnowledgeRetrievalService } from './chat-knowledge-retrieval.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ChatKnowledgeRetrievalService', () => {
  let service: ChatKnowledgeRetrievalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatKnowledgeRetrievalService();
  });

  describe('cleanQuery', () => {
    it('strips /doc and conversational inquiry prefixes', () => {
      expect(service.cleanQuery('/doc 请问查看deepseek harness的安装方法')).toBe(
        'deepseek harness的安装方法'
      );
      expect(service.cleanQuery('请帮我查找关于Kubernetes的部署教程')).toBe(
        'Kubernetes的部署教程'
      );
      expect(service.cleanQuery('查看deepseek harness的安装方法')).toBe(
        'deepseek harness的安装方法'
      );
    });
  });

  describe('retrieveMultiSourceContext', () => {
    it('returns empty if both searches are disabled', async () => {
      const result = await service.retrieveMultiSourceContext({
        query: 'test query',
        workspaceSearch: false,
        webSearch: false,
      });

      expect(result.workspaceDocsCount).toBe(0);
      expect(result.webResultsCount).toBe(0);
      expect(result.combinedSystemPromptAddition).toBe('');
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('retrieves only workspace knowledge when workspaceSearch is true and webSearch is false', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          {
            id: 'doc-1',
            name: 'DeepSeek Harness部署指南.md',
            workspaceId: 'ws-1',
            workspaceName: '个人空间',
            workspaceType: 'personal',
            digest: { summary: '内部环境准备' },
            matches: [{ line: 10, snippet: 'npm install -g @deepseek-ai/dsh' }],
          },
        ],
      } as any);

      const result = await service.retrieveMultiSourceContext({
        query: '查看deepseek harness的安装方法',
        workspaceSearch: true,
        webSearch: false,
        userId: 'u1',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/search-content?q='),
        expect.any(Object)
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(result.workspaceDocsCount).toBe(1);
      expect(result.webResultsCount).toBe(0);
      expect(result.combinedSystemPromptAddition).toContain('【工作空间内部知识库检索结果】');
      expect(result.combinedSystemPromptAddition).not.toContain('【全网实时检索结果】');
      expect(result.completionThought).toContain('已在工作空间中检索到 1 篇相关文档');
    });

    it('retrieves both workspace knowledge and web knowledge when both are enabled', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          {
            id: 'doc-1',
            name: 'DeepSeek Harness部署指南.md',
            workspaceId: 'ws-1',
            workspaceName: '个人空间',
            workspaceType: 'personal',
            digest: { summary: '内部环境准备' },
            matches: [{ line: 10, snippet: 'npm install -g @deepseek-ai/dsh' }],
          },
        ],
      } as any);

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          output: {
            results: [
              {
                title: 'DeepSeek Harness 教程 | DataCamp',
                url: 'https://datacamp.com/tutorial/dsh',
                snippet: '官方使用 npx @deepseek-ai/dsh web 启动',
              },
            ],
            resultCount: 1,
          },
        },
      } as any);

      const result = await service.retrieveMultiSourceContext({
        query: '查看deepseek harness的安装方法',
        workspaceSearch: true,
        webSearch: true,
        userId: 'u1',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/search-content?q='),
        expect.any(Object)
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/internal/search/web'),
        expect.objectContaining({ query: 'deepseek harness的安装方法', maxResults: 5 }),
        expect.any(Object)
      );

      expect(result.workspaceDocsCount).toBe(1);
      expect(result.webResultsCount).toBe(1);
      expect(result.combinedSystemPromptAddition).toContain('【工作空间内部知识库检索结果】');
      expect(result.combinedSystemPromptAddition).toContain('【全网实时检索结果】');
      expect(result.combinedSystemPromptAddition).toContain('DeepSeek Harness部署指南.md');
      expect(result.combinedSystemPromptAddition).toContain('https://datacamp.com/tutorial/dsh');
      expect(result.combinedSystemPromptAddition).toContain(
        '请综合上述【工作空间内部知识库】与【全网实时检索】的双重结果'
      );
      expect(result.completionThought).toContain(
        '已检索到 1 篇工作空间文档及 1 条全网实时资料，正在融合多源知识生成解答...'
      );
    });

    it('gracefully handles web search errors while preserving workspace knowledge', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          {
            id: 'doc-1',
            name: 'DeepSeek Harness部署指南.md',
            workspaceId: 'ws-1',
            workspaceName: '个人空间',
            workspaceType: 'personal',
            digest: { summary: '内部环境准备' },
            matches: [{ line: 10, snippet: 'npm install -g @deepseek-ai/dsh' }],
          },
        ],
      } as any);

      mockedAxios.post.mockRejectedValueOnce(new Error('Search service timeout'));

      const result = await service.retrieveMultiSourceContext({
        query: '查看deepseek harness的安装方法',
        workspaceSearch: true,
        webSearch: true,
        userId: 'u1',
      });

      expect(result.workspaceDocsCount).toBe(1);
      expect(result.webResultsCount).toBe(0);
      expect(result.combinedSystemPromptAddition).toContain('【工作空间内部知识库检索结果】');
      expect(result.combinedSystemPromptAddition).not.toContain('【全网实时检索结果】');
      expect(result.completionThought).toContain('已在工作空间中检索到 1 篇相关文档');
    });
  });
});
