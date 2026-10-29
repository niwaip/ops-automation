/** User-facing PDF stages are derived from actual runtime events. */
export function pdfProgress(line: string): string | undefined {
  const review = line.match(/\[PDF 验收\]\s*(.+)$/u);
  if (review) return `页面验收：${review[1]}`;
  if (/工具\s*\[render_pdf\]\s*执行完成/u.test(line)) return '候选生成步骤结束，正在核对渲染结果';
  if (/正在调用工具:\s*render_pdf\(/u.test(line)) return '正在生成候选 PDF';
  return undefined;
}
