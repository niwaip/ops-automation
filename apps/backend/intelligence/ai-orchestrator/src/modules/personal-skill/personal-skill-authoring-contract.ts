import type { SkillSource } from './personal-skill.types';
import { compilePersonalSkillWorkflow, createGroupSumWorkflow, PersonalSkillWorkflow } from './personal-skill-workflow.compiler';

export interface SkillAuthoringInput { id: string; text: string }
export type SkillAuthoringDecision =
  | { status: 'ready'; source: SkillSource }
  | { status: 'needs_input'; questions: string[] };

export function authoringMessages(source: SkillSource): SkillAuthoringInput[] {
  const messages = source.userMessages?.length ? source.userMessages : source.confirmedInstructions.map((text, i) => ({ id: `rule-${i}`, text }));
  if (!messages.length || messages.length > 40 || JSON.stringify(messages).length > 24000) {
    throw new Error('技能来源过长或缺失，请先整理本次需要保存的明确业务口径');
  }
  return messages;
}

const object = (v: any): v is Record<string, any> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
function text(v: any, max: number): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /```|<\/?(?:script|tool|system)|ATTACHMENT_FIELDS|USER_SOURCE/i.test(v)) throw new Error('模型返回了非法、依赖内部变量或过长的技能说明');
  return v.trim();
}
function keys(v: any, allowed: string[]): void {
  if (!object(v) || Object.keys(v).some((k) => !allowed.includes(k))) throw new Error('模型返回了未知技能字段或执行操作');
}
const fieldKey = (s: string) => s.replace(/[（(][^()（）]*[）)]/g, '').replace(/\s+/g, '').toLowerCase();

export function validateAuthoredSkill(raw: unknown, source: SkillSource): SkillAuthoringDecision {
  if (!object(raw)) throw new Error('模型未返回技能设计 JSON');
  if (raw.status === 'needs_input' || raw.status === 'unsupported') {
    keys(raw, ['status', 'questions']);
    if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 3) throw new Error('缺少具体的待确认问题');
    return { status: 'needs_input', questions: raw.questions.map((q: any) => text(q, 240)) };
  }
  keys(raw, ['status', 'description', 'when_to_use', 'procedure', 'group_by', 'measure', 'filters', 'covered_message_ids']);
  if (raw.status !== 'ready') throw new Error('未知技能设计状态');
  const messages = authoringMessages(source);
  if (!Array.isArray(raw.covered_message_ids) || messages.some((m) => !raw.covered_message_ids.includes(m.id)) ||
      raw.covered_message_ids.some((id: any) => !messages.some((m) => m.id === id))) {
    throw new Error('模型未逐条覆盖本次用户指令及纠偏');
  }
  const evidence: any[] = [];
  function binding(value: any, filter = false): string {
    keys(value, filter ? ['field', 'op', 'values', 'evidence'] : ['field', 'evidence']);
    const field = text(value.field, 80);
    keys(value.evidence, ['message_id', 'quote']);
    const quote = text(value.evidence.quote, 2000);
    const message = messages.find((m) => m.id === value.evidence.message_id);
    if (!message || !message.text.includes(quote)) throw new Error('规则引用不是用户原话');
    const core = fieldKey(field).replace(/编号|代码|名称|标识/g, '');
    if (!core || !fieldKey(quote).includes(core)) throw new Error('规则字段没有用户原话依据');
    evidence.push({ field, ...value.evidence });
    return field;
  }
  const group = binding(raw.group_by), measure = binding(raw.measure);
  if (!Array.isArray(raw.filters) || raw.filters.length > 16) throw new Error('非法筛选列表');
  const filters: PersonalSkillWorkflow['filters'] = raw.filters.map((f: any) => {
    const field = binding(f, true), quote = f.evidence.quote.toLowerCase();
    if (!['exclude_prefix', 'in', 'not_in'].includes(f.op) || !Array.isArray(f.values) || !f.values.length || f.values.length > 32) {
      throw new Error('筛选操作尚未实现或缺少取值');
    }
    const values = f.values.map((v: any) => text(v, 120));
    if (values.some((v: string) => !quote.includes(v.toLowerCase()))) throw new Error('模型增加了用户未指定的筛选值');
    const negative = /不包含|排除|剔除|不统计|不要|除去|不为|不等于|exclude|without|except|!=/.test(quote);
    if (f.op === 'exclude_prefix' && (!negative || !/开头|前缀|prefix|starts/.test(quote))) throw new Error('前缀排除缺少原话依据');
    if (f.op === 'not_in' && !negative) throw new Error('排除规则缺少原话依据');
    if (f.op === 'in' && (negative || !/仅|只|包含|保留|为|等于|only|include|=/.test(quote))) throw new Error('模型从技能名称推断了未确认的筛选条件');
    return { field, op: f.op, values };
  });
  // When an independent deterministic parse is available, the model must agree.
  let baseline: PersonalSkillWorkflow | undefined;
  try { baseline = compilePersonalSkillWorkflow(source); } catch { /* Semantic authoring handles unsupported wording. */ }
  const canonical = (p: Pick<PersonalSkillWorkflow, 'group_by' | 'measure' | 'filters'>) => JSON.stringify({
    group_by: fieldKey(p.group_by), measure: fieldKey(p.measure), filters: p.filters.map((f) => ({
      field: fieldKey(f.field), op: f.op, values: [...new Set(f.values.map((v) => v.trim().toLowerCase()))].sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
  if (baseline && canonical(baseline) !== canonical({ group_by: group, measure, filters })) throw new Error('模型提炼改变了已明确的核算口径');
  if (!Array.isArray(raw.procedure) || !raw.procedure.length || raw.procedure.length > 5) throw new Error('技能入口应精简为最多5条方法，详细参数保存在引用文件');
  const description = text(raw.description, 180), when = text(raw.when_to_use, 300);
  if (![description, when].every((s) => fieldKey(s).includes(fieldKey(group)) && fieldKey(s).includes(fieldKey(measure)))) {
    throw new Error('技能描述和适用范围必须明确实际分组、求和字段，不能泛化为其他任务');
  }
  if (source.outputContract.length) throw new Error('尚未实现来源要求的文件交付步骤，不能保存为可执行核算技能');
  const workflow = createGroupSumWorkflow(group, measure, filters, messages.map((m) => m.text));
  return { status: 'ready', source: { ...source, workflow, authoring: {
    schema_version: 1, model: '', description, when_to_use: when,
    procedure: raw.procedure.map((p: any) => text(p, 240)), evidence, duration_ms: 0,
  } } };
}
