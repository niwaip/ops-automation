import axios from 'axios';
import { executeWebSearch } from '../src/modules/execution/adapters/search-web.handler';

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const mockedPost = axios.post as jest.Mock;

describe('executeWebSearch', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not call a provider without runtime credentials', async () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SEARCH_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.FIRECRAWL_KEYLESS_ENABLED;
    process.env.DUCKDUCKGO_ENABLED = 'false';
    delete process.env.SEARCH_PROVIDER_ORDER;

    const result = await executeWebSearch({ input: { query: 'OpenAI' } } as any);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'WEB_SEARCH_NOT_CONFIGURED',
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('normalizes Tavily results and keeps credentials outside the output', async () => {
    process.env.TAVILY_API_KEY = 'test-secret';
    mockedPost.mockResolvedValue({
      data: {
        answer: 'A concise answer',
        results: [
          {
            title: 'OpenAI',
            url: 'https://openai.com/',
            content: 'Official website',
            score: 0.98,
            published_date: '2026-09-01',
          },
        ],
      },
    });

    const result = await executeWebSearch({
      input: { query: ' OpenAI ', maxResults: 50, topic: 'news' },
    } as any);

    expect(result).toMatchObject({
      success: true,
      output: {
        query: 'OpenAI',
        provider: 'tavily',
        resultCount: 1,
        results: [
          {
            title: 'OpenAI',
            url: 'https://openai.com/',
            snippet: 'Official website',
            score: 0.98,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(mockedPost).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({ max_results: 10, topic: 'news', safe_search: true }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-secret' }),
      })
    );
  });

  it('distinguishes a provider-side search denial from an invalid key', async () => {
    process.env.TAVILY_API_KEY = 'test-secret';
    process.env.SEARCH_PROVIDER_ORDER = 'tavily';
    mockedPost.mockRejectedValueOnce({ response: { status: 403 } });

    await expect(executeWebSearch({ input: { query: 'OpenAI' } } as any)).resolves.toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'WEB_SEARCH_PROVIDER_ERROR',
        errorMessage: expect.stringContaining('出口 IP/区域策略'),
      })
    );
  });

  it('rotates to next key when the first Tavily key fails with 401', async () => {
    process.env.TAVILY_API_KEY = 'bad-key-1, good-key-2';

    // First call with bad-key-1 returns 401
    mockedPost.mockRejectedValueOnce({ response: { status: 401 } });
    // Second call with good-key-2 succeeds
    mockedPost.mockResolvedValueOnce({
      data: {
        results: [
          {
            title: 'DeepSeek',
            url: 'https://deepseek.com',
            content: 'DeepSeek AI',
            score: 0.99,
          },
        ],
      },
    });

    const result = await executeWebSearch({ input: { query: 'DeepSeek' } } as any);

    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('tavily');
    expect(result.output?.resultCount).toBe(1);
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost).toHaveBeenNthCalledWith(
      1,
      'https://api.tavily.com/search',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bad-key-1' }),
      })
    );
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      'https://api.tavily.com/search',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer good-key-2' }),
      })
    );
  });

  it('fails over to Firecrawl when all Tavily keys fail', async () => {
    process.env.TAVILY_API_KEY = 'failing-tavily-key';
    process.env.FIRECRAWL_API_KEY = 'fc-key-1';

    // Tavily fails with 401
    mockedPost.mockRejectedValueOnce({ response: { status: 401 } });
    // Firecrawl succeeds
    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            title: 'Firecrawl Search Result',
            url: 'https://example.com/firecrawl',
            description: 'Scraped content description',
          },
        ],
      },
    });

    const result = await executeWebSearch({ input: { query: 'Agent Framework' } } as any);

    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('firecrawl');
    expect(result.output?.results[0].title).toBe('Firecrawl Search Result');
    expect(result.output?.warnings?.[0]).toContain("搜索通道 'tavily' 异常");
  });

  it('supports Exa provider when configured and prioritized', async () => {
    delete process.env.TAVILY_API_KEY;
    process.env.EXA_API_KEY = 'exa-test-key';
    process.env.SEARCH_PROVIDER_ORDER = 'exa';

    mockedPost.mockResolvedValueOnce({
      data: {
        results: [
          {
            title: 'Exa Result',
            url: 'https://exa.ai/news',
            text: 'Exa search snippet',
            score: 0.95,
          },
        ],
      },
    });

    const result = await executeWebSearch({ input: { query: 'AI Search' } } as any);

    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('exa');
    expect(result.output?.results[0].snippet).toBe('Exa search snippet');
    expect(mockedPost).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'exa-test-key' }),
      })
    );
  });

  it('supports DuckDuckGo free search fallback when enabled', async () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.EXA_API_KEY;
    process.env.DUCKDUCKGO_ENABLED = 'true';

    const mockHtml = `
      <div class="result results_links">
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fddg">DuckDuckGo Topic</a>
        <a class="result__snippet">DuckDuckGo Snippet Content</a>
      </div>
    `;
    mockedPost.mockResolvedValueOnce({ data: mockHtml });

    const result = await executeWebSearch({ input: { query: 'DuckDuckGo Info' } } as any);

    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('duckduckgo');
    expect(result.output?.results[0].url).toBe('https://example.org/ddg');
    expect(result.output?.results[0].snippet).toBe('DuckDuckGo Snippet Content');
    expect(result.output?.warnings).toContain('使用 DuckDuckGo 免凭据公开通道检索');
  });

  it('uses DuckDuckGo by default after Tavily is rejected', async () => {
    process.env.TAVILY_API_KEY = 'test-secret';
    delete process.env.DUCKDUCKGO_ENABLED;
    delete process.env.SEARCH_PROVIDER_ORDER;
    mockedPost.mockRejectedValueOnce({ response: { status: 403 } });
    mockedPost.mockResolvedValueOnce({
      data: `<div class="result results_links"><a class="result__a" href="https://example.org/news">OpenClaw 2</a><a class="result__snippet">Latest news</a></div>`,
    });

    const result = await executeWebSearch({ input: { query: '查找 openclaw 2 的新闻' } } as any);

    expect(result.success).toBe(true);
    expect(result.output?.provider).toBe('duckduckgo');
    expect(result.output?.warnings?.[0]).toContain("搜索通道 'tavily' 异常");
  });
});
