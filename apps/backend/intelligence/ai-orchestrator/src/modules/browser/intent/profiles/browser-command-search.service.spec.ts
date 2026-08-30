import { BrowserCommandSearchService } from './browser-command-search.service';

describe('BrowserCommandSearchService', () => {
  const service = new BrowserCommandSearchService();

  it('parses default smart search followed by click result', () => {
    const result = service.parseSearchCommandDetailed('搜索 毛利率 然后点击第一个结果', {});

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'search',
            params: { query: '毛利率' },
            description: '搜索 毛利率',
          },
          {
            tool: 'click_result',
            params: { index: 1 },
            description: '点击第1个结果',
          },
        ],
        explanation: '将依次搜索 毛利率，点击第1个结果',
        parserMetadata: {
          search: {
            status: 'success',
            reason: 'search-default-sequential',
            intentType: 'search',
            query: '毛利率',
            resultIndex: 1,
            triggerTerm: '搜索',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('parses runtime smart search profile terms', () => {
    const result = service.parseSearchCommandDetailed(
      '站内搜 审批单',
      {},
      {
        runtimeRules: [
          {
            id: 'search-runtime-smart',
            category: 'SEARCH',
            outputs: {
              profile_type: 'search_intent',
              smart_search_terms: ['站内搜'],
            },
          } as any,
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'smart_search',
            params: { query: '审批单' },
            description: '智搜 审批单',
          },
        ],
        explanation: '将智能查找当前页面的搜索入口并搜索 审批单',
        parserMetadata: {
          search: {
            status: 'success',
            reason: 'search-runtime-query',
            intentType: 'smart_search',
            query: '审批单',
            resultIndex: undefined,
            triggerTerm: '站内搜',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['search-runtime-smart'],
          },
        },
      },
    });
  });

  it('parses explicit search engine query as deterministic search service output', () => {
    const result = service.parseSearchCommandDetailed('在百度搜索 毛利率', {});

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: { url: 'https://www.baidu.com' },
            description: '打开百度',
          },
          {
            tool: 'smart_search',
            params: { query: '毛利率' },
            description: '在百度搜索 毛利率',
          },
        ],
        explanation: '将依次打开百度，搜索 毛利率',
        parserMetadata: {
          search: {
            status: 'success',
            reason: 'search-default-engine',
            intentType: 'engine_search',
            query: '毛利率',
            resultIndex: undefined,
            triggerTerm: '百度',
            engine: 'baidu',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('keeps explicit engine search and result click as three ordered actions', () => {
    const result = service.parseSearchCommandDetailed(
      '在百度搜索 浏览器自动化 然后点击第一个结果',
      {}
    );

    expect(result.status).toBe('success');
    expect(result.response?.commands).toEqual([
      {
        tool: 'navigate',
        params: { url: 'https://www.baidu.com' },
        description: '打开百度',
      },
      {
        tool: 'smart_search',
        params: { query: '浏览器自动化' },
        description: '在百度搜索 浏览器自动化',
      },
      {
        tool: 'click_result',
        params: { index: 1 },
        description: '点击第1个结果',
      },
    ]);
  });
});
