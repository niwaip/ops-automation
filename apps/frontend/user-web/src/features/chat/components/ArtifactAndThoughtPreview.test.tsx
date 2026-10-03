import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HtmlPreviewBlock } from '@chat-web/components/HtmlPreviewBlock';
import { MarkdownPreviewBlock } from '@chat-web/components/MarkdownPreviewBlock';
import ThoughtProcessPanel from '@chat-web/components/ThoughtProcessPanel';

describe('HtmlPreviewBlock - Collapsed by Default', () => {
  it('does NOT expand iframe by default for interactive games (e.g. 五子棋, 贪吃蛇)', () => {
    const html = renderToStaticMarkup(
      <HtmlPreviewBlock
        code="<!DOCTYPE html><html><head><title>五子棋</title></head><body><canvas id='board'></canvas></body></html>"
        defaultTitle="五子棋"
      />
    );
    // 默认严禁展开 iframe
    expect(html).not.toContain('<iframe');
    // 默认展示展开操作按钮与标题
    expect(html).toContain('展开在线预览');
    expect(html).toContain('五子棋');
  });

  it('does NOT expand iframe by default for presentations or reports', () => {
    const html = renderToStaticMarkup(
      <HtmlPreviewBlock
        code="<!DOCTYPE html><html><head><title>项目进度报告</title></head><body><h1>报告</h1></body></html>"
        defaultTitle="项目进度报告"
      />
    );
    expect(html).not.toContain('<iframe');
    expect(html).toContain('展开在线预览');
  });

  it('renders iframe when defaultExpanded is explicitly true', () => {
    const html = renderToStaticMarkup(
      <HtmlPreviewBlock
        code="<!DOCTYPE html><html><body><h1>测试</h1></body></html>"
        defaultExpanded={true}
      />
    );
    expect(html).toContain('<iframe');
    expect(html).toContain('收起预览');
  });

  it('hides approxSize during streaming to avoid duplicate character count display', () => {
    const streamHtml = renderToStaticMarkup(
      <HtmlPreviewBlock
        code="<!DOCTYPE html><html><body><h1>生成中</h1></body></html>"
        defaultTitle="演示文稿"
        isStreaming={true}
      />
    );
    // 流式生成中严禁展示 KB 数值，避免与底部状态栏字数重复
    expect(streamHtml).not.toContain('KB');
    expect(streamHtml).toContain('生成中...');

    const finishedHtml = renderToStaticMarkup(
      <HtmlPreviewBlock
        code="<!DOCTYPE html><html><body><h1>已完成</h1></body></html>"
        defaultTitle="演示文稿"
        isStreaming={false}
      />
    );
    // 生成完成后才展示文件规格大小
    expect(finishedHtml).toContain('KB');
  });
});

describe('MarkdownPreviewBlock - Collapsed by Default', () => {
  it('does NOT render markdown body content by default', () => {
    const html = renderToStaticMarkup(
      <MarkdownPreviewBlock
        content="# 详细安装教程\n\n这是正文内容，绝不能默认泄露在聊天区！"
        fileName="DeepSeek-Harness-Guide.md"
      />
    );
    // 默认折叠：不显示正文
    expect(html).not.toContain('这是正文内容');
    // 默认展示展开操作按钮与文件名
    expect(html).toContain('展开在线预览');
    expect(html).toContain('DeepSeek-Harness-Guide.md');
  });

  it('renders markdown body content when defaultExpanded is explicitly true', () => {
    const html = renderToStaticMarkup(
      <MarkdownPreviewBlock
        content="# 详细安装教程\n\n这是正文内容"
        fileName="DeepSeek-Harness-Guide.md"
        defaultExpanded={true}
      />
    );
    expect(html).toContain('这是正文内容');
    expect(html).toContain('收起预览');
  });
});

describe('ThoughtProcessPanel - Clean Collapsed State', () => {
  it('renders clean collapsed header without leaking any thought content or summary', () => {
    const thoughts = [
      'The user wants a Gomoku web game.',
      'I need to create a single HTML file with complete CSS and JS.',
    ];
    const html = renderToStaticMarkup(
      <ThoughtProcessPanel
        thoughts={thoughts}
        expanded={false}
        onToggle={() => {}}
        isStreaming={false}
      />
    );

    // 折叠状态只显示标题
    expect(html).toContain('查看思考过程');
    expect(html).toContain('(2 步)');
    // 绝对不能漏出任何思考正文内容！
    expect(html).not.toContain('The user wants a Gomoku');
    expect(html).not.toContain('I need to create a single HTML');
    expect(html).not.toContain('chat-thoughts-summary');
  });

  it('renders complete thought steps when expanded', () => {
    const thoughts = ['First step thinking', 'Second step thinking'];
    const html = renderToStaticMarkup(
      <ThoughtProcessPanel
        thoughts={thoughts}
        expanded={true}
        onToggle={() => {}}
        isStreaming={false}
      />
    );

    expect(html).toContain('隐藏思考过程');
    expect(html).toContain('First step thinking');
    expect(html).toContain('Second step thinking');
  });
});
