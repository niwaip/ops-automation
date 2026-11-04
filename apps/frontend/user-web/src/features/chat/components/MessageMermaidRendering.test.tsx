import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MessageContentRenderer, { isMermaidBlock } from '@chat-web/components/MessageContentRenderer';
import { sanitizeMermaidCode } from '@chat-web/components/MermaidBlock';

describe('MessageContentRenderer Mermaid Diagram Rendering', () => {
  it('correctly detects mermaid blocks by class name and code patterns', () => {
    expect(isMermaidBlock('language-mermaid', 'graph LR\n A --> B')).toBe(true);
    expect(isMermaidBlock('language-graph', 'A --> B')).toBe(true);
    expect(isMermaidBlock('language-flowchart', 'flowchart TD\n A --> B')).toBe(true);

    // 无 language 标记，但以标准 Mermaid 关键字开头
    expect(isMermaidBlock('', 'graph LR\n User[提问] --> AI[回答]')).toBe(true);
    expect(isMermaidBlock(undefined, 'graph TD\n A --> B')).toBe(true);
    expect(isMermaidBlock('language-text', 'sequenceDiagram\n Alice->>Bob: Hello')).toBe(true);
    expect(isMermaidBlock('', 'flowchart TD\n Start --> Stop')).toBe(true);
    expect(isMermaidBlock('', 'classDiagram\n Animal <|-- Duck')).toBe(true);

    // 常规代码块不被误判
    expect(isMermaidBlock('language-python', 'def graph(): pass')).toBe(false);
    expect(isMermaidBlock('language-javascript', 'const x = 1;')).toBe(false);
    expect(isMermaidBlock('', '普通的段落文本，没有任何代码')).toBe(false);
  });

  it('sanitizes unquoted parentheses in mermaid node labels to prevent syntax errors', () => {
    const raw = `graph LR
    User[用户自然语言提问] --> AI[LangChain4j AI Agent]
    AI --> Chart[前端图表渲染 (ECharts/Vue)]`;

    const sanitized = sanitizeMermaidCode(raw);
    expect(sanitized).toContain('Chart["前端图表渲染 (ECharts/Vue)"]');
    expect(sanitized).toContain('User[用户自然语言提问]');
  });

  it('renders MermaidBlock container instead of raw code block for mermaid syntax', () => {
    const content = `1. 核心架构图\n\n\`\`\`mermaid\ngraph LR\n    User[用户自然语言提问] --> AI[LangChain4j AI Agent]\n    AI --> RAG[RAG 语义建模 / 知识库]\n\`\`\``;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('mermaid-block-container');
    expect(html).toContain('架构与流程图 (Mermaid)');
    expect(html).toContain('图表');
    expect(html).toContain('源码');
  });

  it('renders MermaidBlock container for unlabelled code blocks starting with graph LR', () => {
    const content = `1. 核心架构图\n\n\`\`\`\ngraph LR\n    User[用户自然语言提问] --> AI[LangChain4j AI Agent]\n    AI --> Chart[前端图表渲染 (ECharts/Vue)]\n\`\`\``;
    const html = renderToStaticMarkup(<MessageContentRenderer content={content} mode="markdown" />);

    expect(html).toContain('mermaid-block-container');
    expect(html).toContain('架构与流程图 (Mermaid)');
  });
});
