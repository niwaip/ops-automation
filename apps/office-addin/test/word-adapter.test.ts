import { WordAdapter } from '../src/host/adapters/word-adapter';
import { AISuggestion } from '../src/app/store';

jest.mock('../src/host/office/word/api', () => ({
  WordAPI: {
    replaceTableCellText: jest.fn(),
    replaceTableCellTextOnNextRow: jest.fn(),
    applyLoopTableMarkersOnNextRow: jest.fn(),
    replaceUnderlineByPosition: jest.fn(),
    replaceBlankWithContext: jest.fn(),
    replaceText: jest.fn(),
  },
}));

const {
  WordAPI: {
    replaceTableCellText: mockReplaceTableCellText,
    replaceTableCellTextOnNextRow: mockReplaceTableCellTextOnNextRow,
    applyLoopTableMarkersOnNextRow: mockApplyLoopTableMarkersOnNextRow,
    replaceUnderlineByPosition: mockReplaceUnderlineByPosition,
    replaceBlankWithContext: mockReplaceBlankWithContext,
    replaceText: mockReplaceText,
  },
} = jest.requireMock('../src/host/office/word/api') as {
  WordAPI: {
    replaceTableCellText: jest.Mock;
    replaceTableCellTextOnNextRow: jest.Mock;
    applyLoopTableMarkersOnNextRow: jest.Mock;
    replaceUnderlineByPosition: jest.Mock;
    replaceBlankWithContext: jest.Mock;
    replaceText: jest.Mock;
  };
};

function createSuggestion(overrides: Partial<AISuggestion> = {}): AISuggestion {
  return {
    id: 'suggestion-1',
    type: 'variable',
    elementPath: '【合同号：_____】',
    suggestedName: '{d.contract.contractNo_cn}',
    originalText: '合同号：',
    confidence: 0.98,
    applied: false,
    context: '合同号：A-2026-001',
    details: {
      source: 'ai',
      candidateId: 'frontend-word-query-67',
      wordAnchor: {
        type: 'text-range',
        paragraphIndex: 235,
        start: 4,
        end: 4,
        paragraphText: '合同号：',
      },
    },
    ...overrides,
  };
}

describe('WordAdapter.applySuggestion', () => {
  beforeEach(() => {
    mockReplaceTableCellText.mockReset();
    mockReplaceTableCellTextOnNextRow.mockReset();
    mockApplyLoopTableMarkersOnNextRow.mockReset();
    mockReplaceUnderlineByPosition.mockReset();
    mockReplaceBlankWithContext.mockReset();
    mockReplaceText.mockReset();
  });

  it('表格双语单元格写入时会在中日参数之间补换行', async () => {
    const adapter = new WordAdapter();
    const suggestion = createSuggestion({
      suggestedName: '{d.contract.partyA.name_cn}{d.contract.partyA.name_jp}',
      details: {
        source: 'ai',
        wordAnchor: {
          type: 'table-cell',
          tableIndex: 0,
          rowIndex: 0,
          cellIndex: 1,
        },
      },
    });

    mockReplaceTableCellText.mockResolvedValue(true);

    await expect(adapter.applySuggestion(suggestion)).resolves.toBeUndefined();

    expect(mockReplaceTableCellText).toHaveBeenCalledWith(
      0,
      0,
      1,
      '{d.contract.partyA.name_cn}\n{d.contract.partyA.name_jp}'
    );
  });

  it('带精确锚点的建议在锚点写入失败后不再退回到上下文替换', async () => {
    const adapter = new WordAdapter();
    const suggestion = createSuggestion();

    mockReplaceUnderlineByPosition.mockResolvedValue(false);
    mockReplaceBlankWithContext.mockResolvedValue({ success: true });
    mockReplaceText.mockResolvedValue(undefined);

    await expect(adapter.applySuggestion(suggestion)).rejects.toThrow(
      '锚点写入失败，已停止上下文回退以避免写入到其他位置'
    );

    expect(mockReplaceUnderlineByPosition).toHaveBeenCalledTimes(1);
    expect(mockReplaceBlankWithContext).not.toHaveBeenCalled();
    expect(mockReplaceText).not.toHaveBeenCalled();
  });

  it('无精确锚点时仍允许使用上下文回退', async () => {
    const adapter = new WordAdapter();
    const suggestion = createSuggestion({
      details: {
        source: 'ai',
      },
      underlineInfo: {
        paragraphIndex: 235,
        position: { start: 4, end: 4 },
        paragraphText: '合同号：',
      },
    });

    mockReplaceUnderlineByPosition.mockResolvedValue(false);
    mockReplaceBlankWithContext.mockResolvedValue({ success: true });

    await expect(adapter.applySuggestion(suggestion)).resolves.toBeUndefined();

    expect(mockReplaceUnderlineByPosition).toHaveBeenCalledTimes(1);
    expect(mockReplaceBlankWithContext).toHaveBeenCalledTimes(1);
  });
});
