jest.mock('@nestjs/common', () => ({ Injectable: () => () => undefined }), {
  virtual: true,
});

import { RecorderScriptExportService, UnresolvedRefLocatorError } from './recorder-script-export.service';

describe('RecorderScriptExportService ref fail-fast', () => {
  const service = new RecorderScriptExportService();

  it('throws UnresolvedRefLocatorError when locator.strategy is ref with no durable resolver upstream', () => {
    expect(() =>
      service.toPlaywrightLocatorExpression({ strategy: 'ref', value: 'e99' } as any)
    ).toThrow(UnresolvedRefLocatorError);
  });

  it('buildPlaywrightCommandLines for fill/click with unresolved ref yields a comment line, never page.locator("eNN")', () => {
    const fill: any = {
      tool: 'fill',
      params: { value: 'v' },
      locator: { strategy: 'ref', value: 'e99', generatedBy: 'system' },
      description: '填写',
    };
    const lines = service.buildPlaywrightCommandLines(fill, [], 1, 0);
    expect(lines.join('\n')).not.toContain('page.locator("e99")');
    expect(lines.join('\n')).toMatch(/unresolved transient ref locator/);
  });

  it('still throws when locator.strategy is ref and the outer try/catch is bypassed (preferred behaviour)', () => {
    expect(() =>
      service.toPlaywrightLocatorExpression({ strategy: 'ref', value: 'e28' } as any)
    ).toThrow(UnresolvedRefLocatorError);
  });
});