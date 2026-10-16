import axios from 'axios';
import { executeWorkspaceExplorer } from '../src/modules/execution/adapters/workspace/workspace-explorer.handler';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockedGet = (axios as any).get as jest.Mock;

describe('executeWorkspaceExplorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails if query is empty', async () => {
    const res = await executeWorkspaceExplorer({ input: { query: '   ' } } as any);
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('WORKSPACE_EXPLORE_QUERY_REQUIRED');
  });

  it('extracts quoted keywords and searches exact target without false-positive subterm fallback', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/search-content')) {
        return { data: [] };
      }
      if (url.includes('/workspaces/search?q=')) {
        return { data: [{ id: '1', name: '现有文档.docx' }] };
      }
      return { data: [] };
    });

    const res = await executeWorkspaceExplorer({
      input: {
        query:
          '/doc 查找标题包含“E2E_WORK_MODE_NONEXISTENT_20261014”的文档，只查询，不创建或修改任何文件。若没有找到明确说明。',
      },
    } as any);

    expect(res.success).toBe(true);
    // Verified search-content called with target term
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('q=E2E_WORK_MODE_NONEXISTENT_20261014'),
      expect.anything()
    );
    // Verified subterm fallback was not triggered for generic terms like "文档"
    const calls = mockedGet.mock.calls.map((c) => c[0] as string);
    expect(calls.some((url) => url.includes('q=%E6%96%87%E6%A1%A3'))).toBe(false); // '文档'

    // Verified output schema conformance: NO results property in output!
    expect(res.output).toHaveProperty('query');
    expect(res.output).toHaveProperty('answer');
    expect(res.output).toHaveProperty('citations');
    expect(res.output).toHaveProperty('scannedFiles');
    expect(res.output).toHaveProperty('searchedFilesCount');
    expect(res.output).not.toHaveProperty('results');
  });

  it('returns valid schema without results property when matches are found', async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/search-content')) {
        return {
          data: [
            {
              id: 'doc-1',
              workspaceId: 'ws-1',
              name: '保密合同.docx',
              workspaceName: '部门空间',
              matches: [{ line: 12, snippet: '双方同意严格保密' }],
            },
          ],
        };
      }
      return { data: [] };
    });

    const res = await executeWorkspaceExplorer({
      input: { query: '/doc 保密合同' },
    } as any);

    expect(res.success).toBe(true);
    expect(res.output.citations).toHaveLength(1);
    expect(res.output.citations[0].fileName).toBe('保密合同.docx');
    expect(res.output.scannedFiles).toEqual(['保密合同.docx']);
    expect(res.output.searchedFilesCount).toBe(1);
    // Contract Schema Violation check: output MUST NOT have results property
    expect(res.output).not.toHaveProperty('results');

    // Strict validation against platform.workspace.explorer manifest output schema
    const { jsonSchemaValidator } = require('@ops/backend-runtime-capability-contract');
    const manifestSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['query', 'answer', 'citations', 'searchedFilesCount'],
      properties: {
        query: { type: 'string' },
        answer: { type: 'string' },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fileName: { type: 'string' },
              workspaceName: { type: 'string' },
              line: { type: 'integer' },
              snippet: { type: 'string' },
            },
          },
        },
        searchedFilesCount: { type: 'integer' },
        scannedFiles: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
    const validation = jsonSchemaValidator.validate(res.output, manifestSchema);
    expect(validation.valid).toBe(true);
    expect(validation.errors || []).toHaveLength(0);
  });

  it('scans fullTextPreview for all requested verification terms and formats raw verification layout', async () => {
    const fixtureMarkdown = [
      '# 星桥管理闭环AD1015',
      '',
      '本文件仅用于管理端上传、索引与知识问答的端到端测试，所有信息均为虚构。',
      '',
      '项目名称：星桥管理闭环AD1015。',
      '项目预算：52931元。',
      '负责人：测试员丁。',
      '验收口令：AD-Q8VN-6173。',
      '交付截止日：2026年11月12日。',
      '验收规则：完成四台模拟终端的联调，并归档三份虚构记录。',
      '',
      '唯一检索标记：AD1015Q8VN。',
    ].join('\n');

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes('/workspaces/search-content')) {
        return {
          data: [
            {
              id: 'doc-ad1015',
              workspaceId: 'ws-company',
              name: 'workspace-admin-loop-2026-10-15-fixture.md',
              workspaceName: '公司公共盘',
              workspaceType: 'company',
              matches: [
                { line: 1, snippet: '# 星桥管理闭环AD1015' },
                { line: 5, snippet: '项目名称：星桥管理闭环AD1015。' },
              ],
              fullTextPreview: fixtureMarkdown,
              digest: {
                summary: '星桥管理闭环验收样例，负责人测试员丁，预算52931元。',
              },
            },
          ],
        };
      }
      return { data: [] };
    });

    const res = await executeWorkspaceExplorer({
      input: {
        query:
          '/doc 在公司公共盘全文检索“星桥管理闭环AD1015”，从原文核对项目预算、负责人、验收口令、交付截止日、验收规则，逐项给出准确值及行号引用',
      },
    } as any);

    expect(res.success).toBe(true);
    const output = res.output as any;
    const citationLines = output.citations.map((c: any) => c.line);
    // Verified all 5 requested fields + initial matches are captured with exact line numbers
    expect(citationLines).toEqual([1, 5, 6, 7, 8, 9, 10]);

    // Check specific line content
    const line6 = output.citations.find((c: any) => c.line === 6);
    expect(line6.snippet).toContain('52931元');

    const line7 = output.citations.find((c: any) => c.line === 7);
    expect(line7.snippet).toContain('测试员丁');

    const line8 = output.citations.find((c: any) => c.line === 8);
    expect(line8.snippet).toContain('AD-Q8VN-6173');

    const line9 = output.citations.find((c: any) => c.line === 9);
    expect(line9.snippet).toContain('2026年11月12日');

    const line10 = output.citations.find((c: any) => c.line === 10);
    expect(line10.snippet).toContain('完成四台模拟终端的联调，并归档三份虚构记录');

    // Verified raw verification layout is prioritized over digest summary
    expect(output.answer).toContain('命中原文行（原文查证依据）');
    expect(output.answer).toContain('AI提炼摘要（供对照参考）');
    // Ensure "命中原文行" appears BEFORE "AI提炼摘要" in the answer
    const evidencePos = output.answer.indexOf('命中原文行（原文查证依据）');
    const summaryPos = output.answer.indexOf('AI提炼摘要（供对照参考）');
    expect(evidencePos).toBeGreaterThan(-1);
    expect(summaryPos).toBeGreaterThan(evidencePos);
  });
});
