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

describe('hoistHtmlPreviewBlock - Unify Header Banner and Preview Card', () => {
  it('hoists html code block from bottom to immediately beneath header banner', async () => {
    const { hoistHtmlPreviewBlock } = await import('@chat-web/components/MessageContentRenderer');
    const inputMarkdown = [
      '✨ **交互式页面已生成完毕！**',
      '- **输出文件**：`/workspace/index.html`',
      '- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。',
      '',
      '### 一、分析摘要',
      '这里是长达数百字的背景分析与详细指标解读...',
      '### 二、业务明细',
      '各部门工数统计与金额明细表...',
      '### 三、管理建议',
      '持续优化人员效能与工数核算...',
      '### 四、交互式 HTML 柱状图看板源码与物理交付',
      '物理文件已生成落盘至工作区：`/workspace/index.html`。',
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html><head><title>看板</title></head><body><svg><rect width="100" height="200"/></svg></body></html>',
      '```',
    ].join('\n');

    const result = hoistHtmlPreviewBlock(inputMarkdown);

    // 验证 ```html 代码块被提升到顶部 Banner 之后
    const bannerIndex = result.indexOf('✨ **交互式页面已生成完毕！**');
    const htmlBlockIndex = result.indexOf('```html\n<!DOCTYPE html>');
    const analysisIndex = result.indexOf('### 一、分析摘要');

    expect(bannerIndex).toBeGreaterThanOrEqual(0);
    expect(htmlBlockIndex).toBeGreaterThan(bannerIndex);
    // htmlBlock 必须位于分析正文之前，保证操作组件在第一屏立即可见
    expect(htmlBlockIndex).toBeLessThan(analysisIndex);
    // 确保原正文内容保持完整，仅代码块位置提升
    expect(result).toContain('### 四、交互式 HTML 柱状图看板源码与物理交付');
  });

  it('keeps markdown unchanged when html code block is already right below banner', async () => {
    const { hoistHtmlPreviewBlock } = await import('@chat-web/components/MessageContentRenderer');
    const inputMarkdown = [
      '✨ **交互式页面已生成完毕！**',
      '- **输出文件**：`/workspace/index.html`',
      '- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。',
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html><head><title>看板</title></head><body><svg><rect width="100" height="200"/></svg></body></html>',
      '```',
      '',
      '### 一、分析摘要',
      '这里是长达数百字的背景分析与详细指标解读...',
    ].join('\n');

    const result = hoistHtmlPreviewBlock(inputMarkdown);
    expect(result).toBe(inputMarkdown);
  });

  it('hoists when banner is plain text without markdown list markers', async () => {
    const { hoistHtmlPreviewBlock } = await import('@chat-web/components/MessageContentRenderer');
    const inputMarkdown = [
      '✨ 单页 HTML 报告已由系统基于会话内容自动整理生成！',
      '',
      '输出文件：/workspace/index.html',
      '操作提示：您可以在下方直接展开在线预览、全屏查看，或点击下载保存本地使用。',
      '💡 恢复说明：上游模型在写入收尾阶段未输出有效正文，系统已自动提取前序会话核心数据并编译为单页报告。',
      '',
      '### 一、数据统计',
      '各部门金额统计...',
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html><body><svg></svg></body></html>',
      '```',
    ].join('\n');

    const result = hoistHtmlPreviewBlock(inputMarkdown);
    const htmlBlockIndex = result.indexOf('```html');
    const statsIndex = result.indexOf('### 一、数据统计');

    expect(htmlBlockIndex).toBeGreaterThan(0);
    expect(htmlBlockIndex).toBeLessThan(statsIndex);
  });

  it('renders index.html and chart tip for SVG/chart html instead of presentation.html', () => {
    const chartHtml = '<!DOCTYPE html><html><body><svg><rect/></svg></body></html>';
    const html = renderToStaticMarkup(
      <HtmlPreviewBlock
        code={chartHtml}
        isStreaming={false}
      />
    );

    // 严禁误标为 presentation.html 或 演示文稿翻页提示
    expect(html).toContain('index.html');
    expect(html).not.toContain('presentation.html');
    expect(html).toContain('交互式图表与数据看板已就绪');
    expect(html).not.toContain('支持键盘翻页');
  });
});
