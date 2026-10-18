import { RecorderParameterService } from './recorder-parameter.service';

describe('RecorderParameterService', () => {
  let service: RecorderParameterService;

  beforeEach(() => {
    service = new RecorderParameterService();
  });

  describe('shouldExposeStartUrlParameter', () => {
    it('returns false by default to ensure starting website URL is fixed rather than variable', () => {
      expect(
        service.shouldExposeStartUrlParameter([
          { tool: 'navigate', params: { url: 'https://juejin.cn' } } as any,
        ])
      ).toBe(false);
    });
  });

  describe('extractOrdinalIndexFromText', () => {
    it('extracts index from Chinese search result descriptions', () => {
      expect(service.extractOrdinalIndexFromText('打开第二条结果')).toBe('2');
      expect(service.extractOrdinalIndexFromText('打开第二条记录：一个人+AI做情侣食谱小程序，30天纯赚')).toBe('2');
      expect(service.extractOrdinalIndexFromText('点击第二条结果链接')).toBe('2');
      expect(service.extractOrdinalIndexFromText('点击第3个搜索结果')).toBe('3');
      expect(service.extractOrdinalIndexFromText('选择第一项结果')).toBe('1');
      expect(service.extractOrdinalIndexFromText('点击第三篇文章')).toBe('3');
      expect(service.extractOrdinalIndexFromText('选择第2条数据')).toBe('2');
    });

    it('returns undefined for non-result descriptions', () => {
      expect(service.extractOrdinalIndexFromText('点击第一条待处理案件详情')).toBeUndefined();
      expect(service.extractOrdinalIndexFromText('点击登录按钮')).toBeUndefined();
      expect(service.extractOrdinalIndexFromText(undefined)).toBeUndefined();
    });
  });

  describe('inferSkillParameters', () => {
    it('does not expose startUrl when includeStartUrl is false', () => {
      const params = service.inferSkillParameters(
        [
          { tool: 'navigate', params: { url: 'https://juejin.cn' } } as any,
          {
            tool: 'click',
            params: { target: 'e173' },
            description: '点击第二条结果链接',
          } as any,
        ],
        { includeStartUrl: false }
      );

      expect(params.find((p) => p.name === 'startUrl')).toBeUndefined();
      expect(params.find((p) => p.name === 'resultIndex')).toEqual(
        expect.objectContaining({
          name: 'resultIndex',
          exampleValue: '2',
        })
      );
    });

    it('extracts resultIndex from click_result command', () => {
      const params = service.inferSkillParameters(
        [
          { tool: 'navigate', params: { url: 'https://juejin.cn' } } as any,
          {
            tool: 'click_result',
            params: { index: 2 },
            description: '点击第2条结果',
          } as any,
        ],
        { includeStartUrl: false }
      );

      expect(params.find((p) => p.name === 'resultIndex')).toEqual(
        expect.objectContaining({
          name: 'resultIndex',
          exampleValue: '2',
        })
      );
    });
  });
});
