import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PersonalSkillAuthoringService } from './personal-skill-authoring.service';
import { validateAuthoredSkill } from './personal-skill-authoring-contract';
import { authoredSkillMarkdown } from './personal-skill-authored-markdown.util';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';
import { PersonalSkillStoreService } from './personal-skill-store.service';
import type { SkillSource } from './personal-skill.types';

const rule = '按照 部门编号 分组统计金额 的合计， 不包含WBS编号 中ex，sy，sp，ip，ib，sz开头的数据';
function source(text = rule): SkillSource {
  return { source: { kind: 'sandbox_turn', sessionId: 's', messageId: 'a' }, objective: text,
    confirmedInstructions: [text], userMessages: [{ id: 'u1', text }], inputs: [{ name: 'input.xlsx', type: 'xlsx' }],
    reusableSteps: [], reusableFiles: [], outputContract: [] };
}
function design(text = rule): any {
  const evidence = { message_id: 'u1', quote: text };
  return { status: 'ready', description: '按部门编号汇总金额并排除指定WBS前缀', when_to_use: '处理按部门编号汇总金额的新明细附件',
    procedure: ['定位业务字段', '按确认口径筛选并汇总', '核对条数与总额后呈现'],
    group_by: { field: '部门编号', evidence }, measure: { field: '金额', evidence },
    filters: [{ field: 'WBS编号', op: 'exclude_prefix', values: ['ex', 'sy', 'sp', 'ip', 'ib', 'sz'], evidence }],
    covered_message_ids: ['u1'] };
}

describe('LLM skill authoring with source evidence', () => {
  it('produces an executable workflow with a concise progressive-disclosure entrypoint', () => {
    const result = validateAuthoredSkill(design(), source());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('missing workflow');
    expect(result.source.workflow?.filters[0]?.values).toHaveLength(6);
    const md = authoredSkillMarkdown(result.source, '部门统计', 'dept-summary');
    expect(md).toContain('references/authoring.json'); expect(md).toContain('references/workflow.json');
    expect(md.length).toBeLessThan(2000);
  });

  it('handles semantic wording outside the deterministic parser without inventing execution code', () => {
    const wording = '请将金额按部门编号归集，WBS编号以ex，sy，sp，ip，ib，sz开头的记录不要计入';
    const result = validateAuthoredSkill(design(wording), source(wording));
    expect(result.status === 'ready' && result.source.workflow?.group_by).toBe('部门编号');
  });

  it.each(['fake_quote', 'extra_filter', 'missing_prefix', 'missing_message', 'arbitrary_code'])(
    'rejects %s before any workflow installation', (change) => {
      const d = design();
      if (change === 'fake_quote') d.measure.evidence = { message_id: 'u1', quote: '只保留有偿项目' };
      if (change === 'extra_filter') d.filters.push({ field: '有偿无偿', op: 'in', values: ['有偿'], evidence: { message_id: 'u1', quote: rule } });
      if (change === 'missing_prefix') d.filters[0].values.pop();
      if (change === 'missing_message') d.covered_message_ids = [];
      if (change === 'arbitrary_code') d.script = 'import os';
      expect(() => validateAuthoredSkill(d, source())).toThrow();
    });

  it('returns concrete questions when the user has not fixed a calculation basis', () => {
    expect(validateAuthoredSkill({ status: 'needs_input', questions: ['按部门编号还是部门名称分组？'] }, source()))
      .toEqual({ status: 'needs_input', questions: ['按部门编号还是部门名称分组？'] });
  });

  it.each(['scope', 'internal_variable'])('rejects a skill entry with %s problems', (problem) => {
    const d = design();
    if (problem === 'scope') d.when_to_use = '适用于任意数值字段的通用汇总';
    else d.procedure = ['从ATTACHMENT_FIELDS定位字段'];
    expect(() => validateAuthoredSkill(d, source())).toThrow();
  });

  it('calls the selected model and records bounded authoring usage', async () => {
    const client = { chatCompletion: jest.fn().mockResolvedValue({ content: JSON.stringify(design()), finishReason: 'stop', usage: { total_tokens: 900 } }) };
    const models: any = { getClient: jest.fn().mockReturnValue(client), stripThinkingTags: (s: string) => s,
      resolveModelEntity: () => ({ id: 'chosen-model' }) };
    const result = await new PersonalSkillAuthoringService(models).author(source(), 'chosen-model');
    expect(models.getClient).toHaveBeenCalledWith('chosen-model');
    expect(client.chatCompletion).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 30000, maxOutputTokens: 2400 }));
    expect(result.status === 'ready' && result.source.authoring?.model).toBe('chosen-model');
  });

  it('repairs one malformed proposal, never silently falls back to incomplete rules', async () => {
    const client = { chatCompletion: jest.fn().mockResolvedValueOnce({ content: '{}', finishReason: 'stop' })
      .mockResolvedValueOnce({ content: JSON.stringify(design()), finishReason: 'stop' }) };
    const models: any = { getClient: () => client, stripThinkingTags: (s: string) => s, resolveModelEntity: () => null };
    expect((await new PersonalSkillAuthoringService(models).author(source())).status).toBe('ready');
    expect(client.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('does not install a truncated proposal after the bounded repair budget', async () => {
    const client = { chatCompletion: jest.fn().mockResolvedValue({ content: JSON.stringify(design()), finishReason: 'length' }) };
    const models: any = { getClient: () => client, stripThinkingTags: (s: string) => s, resolveModelEntity: () => null };
    await expect(new PersonalSkillAuthoringService(models).author(source())).rejects.toThrow('未完整结束');
    expect(client.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('keeps an ambiguous capture uninstalled and exposes needs_input', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'authoring-questions-'));
    const previous = process.env.PROJECT_ROOT; process.env.PROJECT_ROOT = root;
    try {
      const store = new PersonalSkillStoreService();
      const author: any = { author: async () => ({ status: 'needs_input', questions: ['需要汇总哪个字段？'] }) };
      const capture = new PersonalSkillCaptureService({ extractSource: async () => source() } as any,
        new PersonalSkillGeneratorService(), new PersonalSkillValidatorService(), store, author);
      const task = await capture.createCapture('u', { displayName: '统计', sourceRef: source().source });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(capture.getCaptureStatus('u', task.captureId).status).toBe('needs_input');
      expect(await store.listSkills('u')).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.PROJECT_ROOT; else process.env.PROJECT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
