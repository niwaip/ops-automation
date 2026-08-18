import { describe, expect, it } from 'vitest';
import { normalizeTabSeparatedTable } from './tableNormalizer';

describe('normalizeTabSeparatedTable', () => {
  it('converts multi-space separated weather table text into GFM markdown table', () => {
    const rawInput = `2026年8月17日天气情况:

    时段    天气  气温 体感 降水概率  风速  湿度 紫外线
早晨 06:00 烟雾霾 10°C 7°C 4%    19 km/h 61% 0
中午 12:00 晴朗  20°C 20°C 1%   32 km/h 33% 9
傍晚 18:00 晴朗  16°C 16°C 3%   26 km/h 49% 0

全天无降水`;

    const normalized = normalizeTabSeparatedTable(rawInput);
    expect(normalized).toContain('| 时段 | 天气 | 气温 | 体感 | 降水概率 | 风速 | 湿度 | 紫外线 |');
    expect(normalized).toContain('| --- | --- | --- | --- | --- | --- | --- | --- |');
    expect(normalized).toContain('| 早晨 06:00 | 烟雾霾 | 10°C | 7°C | 4% | 19 km/h | 61% | 0 |');
    expect(normalized).toContain('| 中午 12:00 | 晴朗 | 20°C | 20°C | 1% | 32 km/h | 33% | 9 |');
  });

  it('converts tab-separated text into GFM markdown table', () => {
    const rawInput = `时段\t天气\t气温
早晨 06:00\t烟霾\t10°C
中午 12:00\t晴\t20°C`;

    const normalized = normalizeTabSeparatedTable(rawInput);
    expect(normalized).toContain('| 时段 | 天气 | 气温 |');
    expect(normalized).toContain('| --- | --- | --- |');
    expect(normalized).toContain('| 早晨 06:00 | 烟霾 | 10°C |');
  });
});
