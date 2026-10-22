import { selectPersonalSkillSourceTurn } from './personal-skill-source-turn.util';
import { PersonalSkillSourceAdapter } from './personal-skill-source.adapter';

describe('personal skill source binding', () => {
  const history: any[] = [
    { id: 'u1', role: 'user', content: '按部门汇总金额，排除WBS以ex和sy开头的记录',
      metadata: { files: [{ fileName: 'source_data.xlsx' }] } },
    { id: 'a1', role: 'assistant', content: '总金额 100。来源：source\\_data.xlsx。' },
    { id: 'u2', role: 'user', content: '保存为 部门别有偿统计 的skill' },
    { id: 'a2', role: 'assistant', content: '已生成部门别有偿统计.xlsx' },
  ];

  it('skips the failed save turn and preserves the original business instructions', async () => {
    const adapter = new PersonalSkillSourceAdapter({ getChatHistory: async () => history } as any);
    const source = await adapter.extractSource('owner', { kind: 'sandbox_turn', sessionId: 's' });
    expect(source.source.messageId).toBe('a1');
    expect(source.confirmedInstructions).toEqual(['按部门汇总金额，排除WBS以ex和sy开头的记录']);
    expect(source.outputContract).toEqual([]);
    expect(source.scriptCode).toBeUndefined();
  });

  it('binds an explicit user message to its assistant result', () => {
    expect(selectPersonalSkillSourceTurn(history, 'u1')).toBe(1);
    expect(selectPersonalSkillSourceTurn(history, 'a1')).toBe(1);
  });
  it.each(['missing', 'u2', 'a2'])('rejects unusable explicit source %s', (id) => {
    expect(() => selectPersonalSkillSourceTurn(history, id)).toThrow();
  });
  it('rejects a known failed business turn', () => {
    const failed = [history[0], { ...history[1], metadata: { executionTrace: { exitCode: 1 } } }];
    expect(() => selectPersonalSkillSourceTurn(failed)).toThrow();
  });
  it('does not take inputs from later unrelated work', async () => {
    const adapter = new PersonalSkillSourceAdapter({ getChatHistory: async () => [...history,
      { role: 'user', content: '其他任务', metadata: { files: [{ fileName: 'later.pdf' }] } }] } as any);
    const source = await adapter.extractSource('owner', { kind: 'sandbox_turn', sessionId: 's', messageId: 'a1' });
    expect(source.inputs.map((i) => i.name)).toEqual(['source_data.xlsx']);
  });
  it('preserves every comma-separated value and ignores encoded source download links', async () => {
    const input = '工数实绩明细_20261020134124.xlsx';
    const instructions = '按部门编号汇总金额，不包含WBS编号中ex，sy，sp，ip，ib，sz开头的数据';
    const adapter = new PersonalSkillSourceAdapter({ getChatHistory: async () => [
      { role: 'user', content: instructions, metadata: { files: [{ fileName: input }] } },
      { id: 'answer', role: 'assistant', content: `原始文件：[来源](/api/files/${encodeURIComponent(input)})` },
    ] } as any);
    const source = await adapter.extractSource('owner', { kind: 'sandbox_turn', sessionId: 's' });
    expect(source.confirmedInstructions).toEqual([instructions]);
    expect(source.outputContract).toEqual([]);
  });
});
