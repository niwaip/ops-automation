import { LLM_OPERATION_TEMPLATES } from './llm-operation.registry';
import {
  listActiveSystemOperationIds,
  SYSTEM_OPERATION_DEFINITIONS,
} from './system-operation-definitions';

describe('system LLM operation catalog', () => {
  it('exposes the consolidated standard LLM operation catalog', () => {
    expect(listActiveSystemOperationIds()).toEqual([
      'extract_structured_fields',
      'generate_text',
      'summarize_list',
      'summarize_text',
      'transform_text',
    ]);
    expect(SYSTEM_OPERATION_DEFINITIONS.classify_intent_label.status).toBe('deprecated');
    expect(SYSTEM_OPERATION_DEFINITIONS.rewrite_to_markdown.status).toBe('deprecated');
    expect(SYSTEM_OPERATION_DEFINITIONS.merge_multi_source_notes.status).toBe('deprecated');
  });

  it('keeps standard generation tool-free and allows optional trusted context', () => {
    const operation = LLM_OPERATION_TEMPLATES.generate_text;
    const prompt = operation.buildPrompt({
      instruction: '给出穿衣建议',
      context: '上海 31°C，体感 36°C，局部阵雨',
    });

    expect(prompt.systemPrompt).toContain('不得调用工具、访问外部系统或产生副作用');
    expect(prompt.userPrompt).toContain('给出穿衣建议');
    expect(prompt.userPrompt).toContain('上海 31°C');
    expect(operation.inputSchema).toMatchObject({
      required: ['instruction'],
      properties: {
        instruction: { 'x-ops-input-role': 'instruction' },
        context: { 'x-ops-input-role': 'content' },
      },
    });
  });

  it('builds a tool-free generic text transformation prompt and stable output', () => {
    const operation = LLM_OPERATION_TEMPLATES.transform_text;
    const prompt = operation.buildPrompt({
      content: 'Hello world',
      instruction: '翻译成中文并整理为 Markdown',
    });

    expect(prompt.systemPrompt).toContain('不得搜索、调用工具、访问外部信息');
    expect(prompt.userPrompt).toContain('翻译成中文并整理为 Markdown');
    expect(prompt.systemPrompt).toContain('只返回处理后的正文');
    expect(operation.parseAndValidateOutput('# 你好，世界')).toEqual({
      content: '# 你好，世界',
    });
    expect(operation.parseAndValidateOutput('{"answer":"# 你好，世界"}')).toEqual({
      content: '# 你好，世界',
    });
    expect(operation.inputSchema).toMatchObject({
      required: ['content', 'instruction'],
      properties: {
        content: { 'x-ops-input-role': 'content' },
        instruction: { 'x-ops-input-role': 'instruction' },
      },
    });
    const inputProperties = operation.inputSchema?.properties as Record<string, unknown>;
    expect(Object.keys(inputProperties)).toEqual(['content', 'instruction']);
  });

  it('requires an explicit extraction field list', () => {
    expect(LLM_OPERATION_TEMPLATES.extract_structured_fields.inputSchema).toMatchObject({
      required: ['text', 'target_fields'],
      properties: {
        target_fields: { type: 'array', minItems: 1, maxItems: 50 },
      },
    });
  });
});
