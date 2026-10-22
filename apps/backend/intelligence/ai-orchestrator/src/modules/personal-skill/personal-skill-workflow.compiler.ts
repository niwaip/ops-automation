import type { SkillSource } from './personal-skill.types';

export interface PersonalSkillWorkflow {
  schema_version: 1;
  engine: 'spreadsheet-group-sum-v1';
  group_by: string;
  measure: string;
  filters: Array<{ field: string; op: 'exclude_prefix' | 'in' | 'not_in'; values: string[] }>;
  instructions: string[];
  steps: string[];
  verification: { source_hash: true; row_accounting: true; group_total: true };
}

/** Compile explicit rules only. Skill names and assistant prose are not business rules. */
export function isCalculationSkillSource(source: SkillSource): boolean {
  const text = [...source.confirmedInstructions, ...(source.userMessages || []).map((m) => m.text)].join('；');
  return source.inputs.some((i) => ['xlsx', 'xlsm', 'csv', 'xls'].includes(i.type)) &&
    (/(汇总|合计|求和|核算|统计|计算|平均|加权|计数|比率|归集|归并|加总|累计|总额|sum|group)/i.test(text) ||
      /groupby|\.sum\s*\(|\.mean\s*\(|\.agg\s*\(/i.test(source.scriptCode || ''));
}

export function compilePersonalSkillWorkflow(source: SkillSource): PersonalSkillWorkflow | undefined {
  const instructions = [...new Set([
    ...source.confirmedInstructions,
    ...(source.corrections || []).map((c) => c.userCorrection),
  ].map((s) => s.trim()).filter(Boolean))];
  const text = instructions.join('；');
  const spreadsheet = source.inputs.some((i) => ['xlsx', 'xlsm', 'csv', 'xls'].includes(i.type));
  const calculation = /(汇总|合计|求和|核算|统计|计算|平均|加权|计数|比率|sum|group\s*by)/i.test(text) ||
    /groupby|\.sum\s*\(|\.mean\s*\(|\.agg\s*\(/i.test(source.scriptCode || '');
  if (!spreadsheet || !calculation) return undefined;
  if (source.outputContract.some((o) => !['xlsx', 'json', 'csv'].includes(o.type))) {
    throw new Error('核算流程暂不支持该交付格式；需补充可执行流程，不能仅保存文字说明');
  }
  if (source.outputContract.length) {
    throw new Error('核算流程尚未定义交付文件生成步骤，不能将文本核算保存为文件生成技能');
  }
  const cleanField = (s: string) => s.replace(/[【】「」“”"'`]/g, '').trim();
  const field = '[A-Za-z0-9_\u4e00-\u9fff()（）]+';
  const patterns = [
    new RegExp(`(?:按照|按)\\s*(${field})\\s*分组\\s*(?:统计|汇总|求和)\\s*(${field}?)(?:\\s*的)?\\s*(?:合计|求和|总和)`),
    new RegExp(`(?:按照|按)\\s*(${field})\\s*(?:分组)?\\s*汇总\\s*(${field})`),
  ];
  let group = '', measure = '';
  const filters: PersonalSkillWorkflow['filters'] = [];
  for (const instruction of instructions) {
    const normalized = instruction.replace(/[【】「」“”"'`]/g, '');
    for (let clause of normalized.split(/[，,；;。\n]+(?=\s*(?:不包含|排除|剔除|仅统计|只统计|仅保留|按照|按))/)) {
      clause = clause.trim().replace(/^(?:请帮我|请|麻烦|帮我)\s*/, '');
      const aggregation = patterns.map((p) => clause.match(p)).find(Boolean);
      if (aggregation) {
        const g = cleanField(aggregation[1]!), m = cleanField(aggregation[2]!);
        if ((group && group !== g) || (measure && measure !== m)) throw new Error('存在冲突的分组或求和规则，请先确认最终口径');
        group = g; measure = m;
        clause = clause.replace(aggregation[0], '').replace(/^[\s，,的]+|[\s，,]+$/g, '');
      }
      if (!clause) continue;
      const prefix = clause.match(new RegExp(`^(?:不包含|排除|剔除)\\s*(${field})\\s*(?:中|以)\\s*([A-Za-z0-9_\\s,，、]+)\\s*开头的数据$`));
      const equality = clause.match(new RegExp(`^(仅统计|只统计|仅保留|排除|剔除|不包含)\\s*(${field})\\s*(?:为|等于)\\s*([^，,；;]+?)(?:的数据|的记录)?$`));
      if (prefix) {
        filters.push({ field: cleanField(prefix[1]!), op: 'exclude_prefix',
          values: prefix[2]!.split(/[\s,，、]+/).filter(Boolean) });
      } else if (equality) {
        filters.push({ field: cleanField(equality[2]!),
          op: /排除|剔除|不包含/.test(equality[1]!) ? 'not_in' : 'in', values: [equality[3]!.trim()] });
      } else {
        throw new Error(`核算规则尚未完整编译：${clause}。请明确字段、筛选操作和取值，不能保存为仅供模型猜测的核算技能`);
      }
    }
  }
  if (!group || !measure) throw new Error('核算技能缺少明确的分组字段或求和字段，不能仅保存文字说明');
  return createGroupSumWorkflow(group, measure, filters, instructions);
}

export function createGroupSumWorkflow(group: string, measure: string,
  filters: PersonalSkillWorkflow['filters'], instructions: string[]): PersonalSkillWorkflow {
  return {
    schema_version: 1, engine: 'spreadsheet-group-sum-v1', group_by: group, measure,
    filters: [...new Map(filters.map((f) => [JSON.stringify(f), f])).values()], instructions,
    steps: ['绑定本轮唯一附件并计算摘要', '按必需字段定位唯一表头与工作表，排除独立的表尾查询条件说明段',
      '全量读取业务行并逐条执行筛选', '按分组字段用 Decimal 汇总原单位金额',
      '核对输入未变、行数守恒、分组金额与总额一致', '只从已验证回执呈现结果'],
    verification: { source_hash: true, row_accounting: true, group_total: true },
  };
}
