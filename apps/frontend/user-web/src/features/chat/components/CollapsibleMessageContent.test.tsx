import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollapsibleMessageContent } from './CollapsibleMessageContent';

describe('CollapsibleMessageContent', () => {
  it('renders children content directly for user message without collapse wrapper', () => {
    const html = renderToStaticMarkup(
      <CollapsibleMessageContent role="user">
        <p>User question text</p>
      </CollapsibleMessageContent>
    );
    expect(html).toContain('User question text');
    expect(html).not.toContain('展开全文');
  });

  it('renders children content for assistant message', () => {
    const html = renderToStaticMarkup(
      <CollapsibleMessageContent role="assistant" contentLength={800}>
        <p>Detailed assistant reply content that spans many lines...</p>
      </CollapsibleMessageContent>
    );
    expect(html).toContain('Detailed assistant reply content that spans many lines...');
  });

  it('does not show expand button while streaming', () => {
    const html = renderToStaticMarkup(
      <CollapsibleMessageContent role="assistant" isStreaming={true} contentLength={1000}>
        <p>Streaming text...</p>
      </CollapsibleMessageContent>
    );
    expect(html).toContain('Streaming text...');
    expect(html).not.toContain('展开全文');
  });

  it('renders open details cleanly without forcing expand button', () => {
    const html = renderToStaticMarkup(
      <CollapsibleMessageContent role="assistant" contentLength={1000}>
        <p>Short preamble</p>
        <details open>
          <summary>查看来源与核算明细</summary>
          <p>Lots of detail rows and verification data...</p>
        </details>
      </CollapsibleMessageContent>
    );
    expect(html).toContain('查看来源与核算明细');
    expect(html).toContain('Lots of detail rows');
  });
});
