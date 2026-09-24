import { describe, expect, it } from 'vitest';
import { normalizeTabSeparatedTable } from './tableNormalizer';

describe('normalizeTabSeparatedTable', () => {
  it('converts multi-space separated weather table text into GFM markdown table', () => {
    const rawInput = `2026年8月17日天气情况:

    时段    天气    气温    体感    降水概率    风速    湿度    紫外线
早晨 06:00  烟雾霾  10°C    7°C     4%      19 km/h  61%    0
中午 12:00  晴朗    20°C    20°C    1%      32 km/h  33%    9
傍晚 18:00  晴朗    16°C    16°C    3%      26 km/h  49%    0

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

  it('converts ASCII/Unicode box-drawing tables inside code blocks into clean GFM tables', () => {
    const rawInput = `二、 部门业务与成本效益深度剖析

\`\`\`
【前三季度各部门利润贡献与支出占比】
┌─────────────────────────┬──────────┬──────────┬──────────┬───────────┐
│ 部门名称                │ 实际支出 │ 主营收入 │ 利润贡献 │ 预算执行率│
├─────────────────────────┼──────────┼──────────┼──────────┼───────────┤
│ D03 企业大客户销售部    │  792 万元│ 4,280万元│+3,488万元│   96.59%  │ (营收支柱)
│ D02 全球市场与增长部    │  715 万元│ 1,850万元│+1,135万元│  105.15%  │ (超支预警/高ROI)
│ D04 客户成功与技术支持  │  328 万元│   890万元│  +562万元│   93.71%  │ (稳定贡献)
└─────────────────────────┴──────────┴──────────┴──────────┴───────────┘
\`\`\`

1. 营收与盈利引擎：大客户销售贡献度极高`;

    const normalized = normalizeTabSeparatedTable(rawInput);
    expect(normalized).not.toContain('┌─────────────────────────');
    expect(normalized).toContain('**【前三季度各部门利润贡献与支出占比】**');
    expect(normalized).toContain('| 部门名称 | 实际支出 | 主营收入 | 利润贡献 | 预算执行率 | 备注 |');
    expect(normalized).toContain('| --- | --- | --- | --- | --- | --- |');
    expect(normalized).toContain('| D03 企业大客户销售部 | 792 万元 | 4,280万元 | +3,488万元 | 96.59% | (营收支柱) |');
    expect(normalized).toContain('1. 营收与盈利引擎：大客户销售贡献度极高');
  });

  it('preserves code blocks containing html and javascript with logical OR without corrupting them', () => {
    const rawHtmlBlock = `已为您生成 HTML 报告：

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>微博热点报告</title>
</head>
<body>
    <script>
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
            nextSlide();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            prevSlide();
        }
    </script>
</body>
</html>
\`\`\`

请查收！`;

    const normalized = normalizeTabSeparatedTable(rawHtmlBlock);
    expect(normalized).toContain('```html\n<!DOCTYPE html>');
    expect(normalized).toContain('```\n\n请查收！');
    expect(normalized).not.toContain('**<!DOCTYPE html>');
    expect(normalized).not.toContain('| if (e.key ===');
  });
});
