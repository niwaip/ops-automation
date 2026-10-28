import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MessageContentRenderer from '@chat-web/components/MessageContentRenderer';

describe('MessageContentRenderer Math Formula Rendering', () => {
  it('renders display block formula with CJK text using KaTeX', () => {
    const content = `计算公式为：\n\n$$\\text{净利润增长率} = \\frac{\\text{2024H2} - \\text{2024H1}}{\\text{2024H1}} \\times 100\\%$$\n\n分析结论：下半年保持增长。`;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('<math');
    expect(html).toContain('净利润增长率');
    expect(html).toContain('2024H2');
  });

  it('normalizes single-line $$ formula on its own line to block display', () => {
    const content = `计算公式为：\n$$ \\text{净利润增长率} = \\frac{\\text{2024H2} - \\text{2024H1}}{\\text{2024H1}} \\times 100\\% $$\n后续分析`;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
  });

  it('normalizes LaTeX standard delimiters \\[ ... \\] and \\( ... \\)', () => {
    const content = `公式为：\n\\[ \\frac{A}{B} \\]\n内联公式：\\( x^2 + y^2 = z^2 \\)`;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('annotation encoding="application/x-tex">x^2 + y^2 = z^2');
  });

  it('preserves math-like delimiters inside code fences and inline code', () => {
    const content = `示例代码：\n\`\`\`python\nformula = "\\[ \\frac{1}{2} \\]"\n\`\`\`\n以及行内代码 \`$$E = mc^2$$\``;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('\\[ \\frac{1}{2} \\]');
    expect(html).toContain('$$E = mc^2$$');
    // Inside pre/code it should NOT have been transformed into katex
    expect(html).not.toContain('class="katex"');
  });

  it('gracefully handles malformed LaTeX without throwing errors', () => {
    const content = `未闭合公式：\n$$\\frac{1}{$$\n结束`;
    expect(() => {
      renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);
    }).not.toThrow();

    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);
    expect(html).toContain('katex-error');
  });

  it('renders raw content in plain mode without converting to KaTeX DOM', () => {
    const content = `$$ \\text{公式} $$`;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="plain" />);

    expect(html).toContain('$$ \\text{公式} $$');
    expect(html).not.toContain('class="katex"');
  });
});
