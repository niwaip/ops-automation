import { describe, it, expect } from 'vitest';
import { pdfProgress } from './pdfProgress';

describe('PDF progress', () => {
  it('reports actual page checks and does not announce delivery on render completion', () => {
    expect(pdfProgress('🔎 [PDF 验收] 正在检查第2/4页')).toBe('页面验收：正在检查第2/4页');
    expect(pdfProgress('✓ 工具 [render_pdf] 执行完成')).toContain('核对渲染结果');
    expect(pdfProgress('🔎 [PDF 验收] 第2页：未通过')).toContain('未通过');
    expect(pdfProgress('web_search')).toBeUndefined();
  });
});
