jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { BrowserCommandNavigationService } from './browser-command-navigation.service';

describe('BrowserCommandNavigationService', () => {
  const service = new BrowserCommandNavigationService();
  const helpers = {
    resolveUrl: (input: string) => {
      if (/^https?:\/\//i.test(input)) {
        return input;
      }
      if (input === '百度') {
        return 'https://www.baidu.com';
      }
      return `https://${input}`;
    },
    getKnownTargets: () => ({
      百度: 'https://www.baidu.com',
      百度首页: 'https://www.baidu.com',
    }),
  };

  it('parses runtime navigation profile into host-relative route', () => {
    const result = service.parseNavigationCommandDetailed(
      '打开审批中心',
      {
        currentPageUrl: 'http://192.168.100.143/#dashboard',
      },
      helpers,
      {
        runtimeRules: [
          {
            id: 'nav-runtime-approvals',
            category: 'NAVIGATION',
            outputs: {
              profile_type: 'navigation_target',
              target_terms: ['审批中心', '审批页面'],
              destination_path: '/#approvals',
              intent_terms: ['打开', '进入'],
            },
          },
        ],
      }
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: {
              url: 'http://192.168.100.143/#approvals',
            },
            description: '导航到 审批中心',
          },
        ],
        explanation: '将导航到 http://192.168.100.143/#approvals',
        parserMetadata: {
          navigation: {
            status: 'success',
            reason: 'navigation-runtime-path',
            resolvedTarget: '审批中心',
            resolvedUrl: 'http://192.168.100.143/#approvals',
            usedRuntimeProfile: true,
            matchedRuntimeRuleIds: ['nav-runtime-approvals'],
          },
        },
      },
    });
  });

  it('parses known site target without runtime profile', () => {
    const result = service.parseNavigationCommandDetailed('打开 百度', {}, helpers);

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: {
              url: 'https://www.baidu.com',
            },
            description: '导航到 百度',
          },
        ],
        explanation: '将导航到 https://www.baidu.com',
        parserMetadata: {
          navigation: {
            status: 'success',
            reason: 'navigation-known-site',
            resolvedTarget: '百度',
            resolvedUrl: 'https://www.baidu.com',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('does not hijack in-page open detail intent', () => {
    const result = service.parseNavigationCommandDetailed('打开详情', {}, helpers);

    expect(result).toEqual({
      status: 'no_match',
    });
  });

  it('classifies direct url navigation separately', () => {
    const result = service.parseNavigationCommandDetailed('打开 https://example.com/docs', {}, helpers);

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: {
              url: 'https://example.com/docs',
            },
            description: '导航到 https://example.com/docs',
          },
        ],
        explanation: '将导航到 https://example.com/docs',
        parserMetadata: {
          navigation: {
            status: 'success',
            reason: 'navigation-direct-url',
            resolvedTarget: 'https://example.com/docs',
            resolvedUrl: 'https://example.com/docs',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });

  it('classifies direct relative path navigation separately', () => {
    const result = service.parseNavigationCommandDetailed(
      '打开 /#approvals',
      { currentPageUrl: 'http://192.168.100.143/#dashboard' },
      helpers
    );

    expect(result).toEqual({
      status: 'success',
      response: {
        success: true,
        commands: [
          {
            tool: 'navigate',
            params: {
              url: 'http://192.168.100.143/#approvals',
            },
            description: '导航到 /#approvals',
          },
        ],
        explanation: '将导航到 http://192.168.100.143/#approvals',
        parserMetadata: {
          navigation: {
            status: 'success',
            reason: 'navigation-direct-path',
            resolvedTarget: '/#approvals',
            resolvedUrl: 'http://192.168.100.143/#approvals',
            usedRuntimeProfile: false,
            matchedRuntimeRuleIds: [],
          },
        },
      },
    });
  });
});
