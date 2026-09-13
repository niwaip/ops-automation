import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InboxContentPreview } from './InboxContentPreview';

describe('InboxContentPreview', () => {
  const content = '邮件内容'.repeat(1000) + '\n[完整内容链接](https://example.com)';

  it('keeps collapsed content bounded without rendering full Markdown', () => {
    const html = renderToStaticMarkup(<InboxContentPreview content={content} expanded={false} />);
    expect(html.length).toBeLessThan(500);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('完整内容链接');
  });

  it('renders the complete text and links when expanded', () => {
    const html = renderToStaticMarkup(<InboxContentPreview content={content} expanded />);
    expect(html).toContain('完整内容链接');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('邮件内容'.repeat(1000));
  });
});
