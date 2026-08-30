import { extractUrlFromInput } from './recognizer-url-extractor';

describe('extractUrlFromInput', () => {
  it('preserves an explicit multi-level https URL', () => {
    expect(extractUrlFromInput('请打开 https://zhuanlan.zhihu.com/p/12345。')).toBe(
      'https://zhuanlan.zhihu.com/p/12345'
    );
  });

  it('accepts schemeless multi-level domains', () => {
    expect(extractUrlFromInput('打开 zhuanlan.zhihu.com/p/12345')).toBe(
      'https://zhuanlan.zhihu.com/p/12345'
    );
  });

  it('accepts arbitrary valid top-level domains instead of a fixed allowlist', () => {
    expect(extractUrlFromInput('访问 example.dev/article?id=1')).toBe(
      'https://example.dev/article?id=1'
    );
  });

  it('does not fabricate a URL from an irreversible display-name slug', () => {
    expect(extractUrlFromInput('打开_https_zhuanlan_zhihu_com_p_12345')).toBeUndefined();
  });
});
