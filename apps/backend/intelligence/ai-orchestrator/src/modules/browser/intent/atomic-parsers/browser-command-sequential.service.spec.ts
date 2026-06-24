import { BrowserCommandNavigationService } from '../profiles/browser-command-navigation.service';
import { BrowserCommandSearchService } from '../profiles/browser-command-search.service';
import { BrowserCommandSequentialService } from './browser-command-sequential.service';

describe('BrowserCommandSequentialService', () => {
  const service = new BrowserCommandSequentialService(
    new BrowserCommandNavigationService(),
    new BrowserCommandSearchService()
  );

  const helpers = {
    resolveUrl: (target: string) => {
      if (target === 'baidu.com') {
        return 'https://www.baidu.com';
      }
      if (target.startsWith('http://') || target.startsWith('https://')) {
        return target;
      }
      return `https://${target}`;
    },
    getKnownTargets: () => ({
      百度: 'https://www.baidu.com',
      baidu: 'https://www.baidu.com',
      'baidu.com': 'https://www.baidu.com',
    }),
  };

  it('parses sequential navigate-plus-search flow', () => {
    const result = service.parseSequentialCommands('打开 baidu.com 搜索 毛利率', {
      runtimeRules: [],
      ...helpers,
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: 'https://www.baidu.com' },
          description: '导航到 baidu.com',
        },
        {
          tool: 'search',
          params: { query: '毛利率' },
          description: '搜索 毛利率',
        },
      ],
      explanation: '将依次打开 https://www.baidu.com，搜索 毛利率',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-direct-url',
          resolvedTarget: 'baidu.com',
          resolvedUrl: 'https://www.baidu.com',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
        search: {
          status: 'success',
          reason: 'search-default-query',
          intentType: 'search',
          query: '毛利率',
          resultIndex: undefined,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('reuses runtime navigation profile inside sequential flow', () => {
    const result = service.parseSequentialCommands('打开 审批中心 搜索 审批单', {
      runtimeRules: [
        {
          id: 'nav-runtime-sequential',
          category: 'NAVIGATION',
          priority: 900,
          outputs: {
            profile_type: 'navigation_target',
            target_terms: ['审批中心'],
            destination_path: '/#approvals',
            intent_terms: ['打开'],
          },
        },
      ],
      currentPageUrl: 'http://192.168.100.143/#dashboard',
      ...helpers,
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: 'http://192.168.100.143/#approvals' },
          description: '导航到 审批中心',
        },
        {
          tool: 'search',
          params: { query: '审批单' },
          description: '搜索 审批单',
        },
      ],
      explanation: '将依次打开 http://192.168.100.143/#approvals，搜索 审批单',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-runtime-path',
          resolvedTarget: '审批中心',
          resolvedUrl: 'http://192.168.100.143/#approvals',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['nav-runtime-sequential'],
        },
        search: {
          status: 'success',
          reason: 'search-default-query',
          intentType: 'search',
          query: '审批单',
          resultIndex: undefined,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });
});
