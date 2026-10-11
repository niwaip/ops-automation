import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import { splitReportDetails } from '@chat-web/lib/reportDetails';

const report = '收入偏差最大的是 **12月**。\n\n<details>\n<summary>查看来源与核算明细</summary>\n\n'
  + '[原始文件](/api/ai/chat/workspace-files/me/test.xlsx)\n\n'
  + '| 来源 | 证据 |\n|---|---|\n| 预算对比!C15 | `receipt-id` |\n\n</details>';

describe('Verified report presentation', () => {
  it('keeps the answer visible and native keyboard-accessible details closed by default', () => {
    const html = renderToStaticMarkup(<MessageContentRenderer content={report} mode="markdown" />);
    expect(html.indexOf('12月')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('<summary');
    expect(html).toContain('查看来源与核算明细');
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    expect(html).toContain('<table>');
    expect(html).toContain('预算对比!C15');
    expect(html).toContain('receipt-id');
    expect(html).toContain('download=""');
    expect(html).not.toContain('<iframe');
  });

  it('leaves report-like code examples as code, including backtick and tilde fences', () => {
    for (const fence of ['```', '~~~~']) {
      const code = `${fence}markdown\n${report}\n${fence}`;
      expect(splitReportDetails(code)).toEqual([{ kind: 'markdown', content: code }]);
    }
  });

  it('does not end a section on a closing marker inside a code fence', () => {
    const input = '<details>\n<summary>来源</summary>\n\n```html\n</details>\n```\n证据\n</details>';
    expect(splitReportDetails(input)).toEqual([{
      kind: 'details', title: '来源', content: '\n```html\n</details>\n```\n证据',
    }]);
  });

  it('does not interpret attributes, inline HTML, or incomplete sections', () => {
    for (const input of [
      '<details open onclick="alert(1)">\n<summary>来源</summary>\n正文\n</details>',
      '正文<details>\n<summary>来源</summary>\n正文\n</details>',
      '<details>\n<summary><img src=x onerror="alert(1)"></summary>\n正文\n</details>',
      '<details>\n<summary>来源</summary>\n正文',
      '    <details>\n    <summary>来源</summary>\n    正文\n    </details>',
    ]) expect(splitReportDetails(input).every((part) => part.kind === 'markdown')).toBe(true);
  });

  it('renders unsafe HTML and URLs in the body without enabling raw HTML', () => {
    const input = '<details>\n<summary>来源</summary>\n\n<script>alert(1)</script>\n\n'
      + '[危险链接](javascript:alert%281%29)\n\n</details>';
    const html = renderToStaticMarkup(<MessageContentRenderer content={input} mode="markdown" />);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('<details');
  });

  it('retains sources in plain text without showing the folding protocol', () => {
    const html = renderToStaticMarkup(<MessageContentRenderer content={report} mode="plain" />);
    expect(html).toContain('receipt-id');
    expect(html).toContain('查看来源与核算明细');
    expect(html).not.toContain('&lt;details&gt;');
  });
});
