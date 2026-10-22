import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import type { PersonalSkillWorkflow } from './personal-skill-workflow.compiler';
import { sha256, workflowEnginePath } from './personal-skill-workflow-package.util';

/** Independent save-time replay using SheetJS; execution uses Python/openpyxl. */
export function validateWorkflowPackage(packageDir: string, inputPath?: string): void {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'execution.json'), 'utf8'));
  if (manifest.schema_version !== 1 || manifest.kind !== 'personal_skill_workflow' ||
      manifest.entrypoint !== 'scripts/run.py' || manifest.plan !== 'references/workflow.json') {
    throw new Error('非法执行入口或流程版本');
  }
  const engine = fs.readFileSync(path.join(packageDir, manifest.entrypoint));
  const bytes = fs.readFileSync(path.join(packageDir, manifest.plan));
  if (sha256(engine) !== sha256(fs.readFileSync(workflowEnginePath())) ||
      sha256(engine) !== manifest.engine_sha256 || sha256(bytes) !== manifest.plan_sha256) {
    throw new Error('执行程序或核算规则摘要不一致');
  }
  const plan: PersonalSkillWorkflow = JSON.parse(bytes.toString());
  if (plan.schema_version !== 1 || plan.engine !== 'spreadsheet-group-sum-v1' || !plan.group_by || !plan.measure ||
      !Array.isArray(plan.filters) || !plan.steps?.length || !plan.instructions?.length ||
      JSON.stringify(plan.verification) !== JSON.stringify({ source_hash: true, row_accounting: true, group_total: true })) {
    throw new Error('缺少可执行核算规则、步骤或验收条件');
  }
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('缺少来源附件，无法重放核算流程并验证保存结果');
  if (!/\.xls[mx]$/i.test(inputPath)) throw new Error('可验证核算流程目前仅支持 XLSX/XLSM 附件');
  const original = fs.readFileSync(inputPath);
  const workbook = XLSX.read(original, { type: 'buffer', cellFormula: true });
  const fields = [...new Set([plan.group_by, plan.measure, ...plan.filters.map((f) => f.field)])];
  const key = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
  const candidates: Array<{ sheet: XLSX.WorkSheet; header: number; columns: Record<string, number>; range: XLSX.Range; name: string }> = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error('来源工作表不存在');
    // Some exporters declare A1:A1 despite containing hundreds of physical cells.
    const cells = Object.keys(sheet).filter((k) => /^[A-Z]+[1-9]\d*$/.test(k)).map(XLSX.utils.decode_cell);
    if (!cells.length) continue;
    const range = { s: { r: 0, c: 0 }, e: { r: Math.max(...cells.map((c) => c.r)), c: Math.max(...cells.map((c) => c.c)) } };
    if ((range.e.r + 1) * (range.e.c + 1) > 250000) throw new Error('来源表格超出核算验证预算');
    for (let r = 0; r < Math.min(range.e.r + 1, 50); r++) {
      const columns: Record<string, number> = {};
      for (const field of fields) {
        const all = Array.from({ length: range.e.c + 1 }, (_, c) => c);
        const exact = all.filter((c) => key(sheet[XLSX.utils.encode_cell({ r, c })]?.v) === key(field));
        const matched = exact.length ? exact : all.filter((c) => key(sheet[XLSX.utils.encode_cell({ r, c })]?.v).replace(/[（(][^()（）]+[）)]$/, '') === key(field));
        if (matched.length === 1) columns[field] = matched[0]!;
      }
      if (Object.keys(columns).length === fields.length) candidates.push({ sheet, header: r, columns, range, name });
    }
  }
  if (candidates.length !== 1) throw new Error('不能定位唯一工作表和表头，核算流程未通过重放');
  const { sheet, header, columns, range, name } = candidates[0]!;
  let end = range.e.r;
  const metadataRows: number[] = [];
  for (let r = header + 1; r <= end; r++) {
    const first = sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
    if (!/^查询条件\s*[:：]\s*$/.test(String(first ?? '').trim())) continue;
    let safe = true;
    for (let tail = r; tail <= range.e.r; tail++) {
      const populated = Array.from({ length: range.e.c + 1 }, (_, c) => c)
        .filter((c) => sheet[XLSX.utils.encode_cell({ r: tail, c })]?.v != null &&
          String(sheet[XLSX.utils.encode_cell({ r: tail, c })]?.v).trim() !== '');
      const label = String(sheet[XLSX.utils.encode_cell({ r: tail, c: 0 })]?.v ?? '');
      if (populated.length && (populated.length !== 1 || populated[0] !== 0 || !/[:：]/.test(label))) safe = false;
      if (fields.some((f) => columns[f] !== 0 && sheet[XLSX.utils.encode_cell({ r: tail, c: columns[f]! })]?.v != null)) safe = false;
    }
    if (!safe) throw new Error('查询条件说明段与业务字段混杂，不能猜测核算范围');
    for (let tail = r; tail <= range.e.r; tail++) metadataRows.push(tail + 1);
    end = r - 1;
    break;
  }
  let included = 0, excluded = 0, total = BigInt(0);
  const groups = new Map<string, bigint>();
  for (let r = header + 1; r <= end; r++) {
    const read = (field: string) => sheet[XLSX.utils.encode_cell({ r, c: columns[field]! })];
    if (!Array.from({ length: range.e.c + 1 }, (_, c) => sheet[XLSX.utils.encode_cell({ r, c })]?.v).some((v) => v != null)) continue;
    const group = read(plan.group_by);
    if (!group || group.f || !String(group.v).trim()) throw new Error(`分组字段缺失或含公式：第${r + 1}行`);
    // Refuse totals here rather than silently use a different scope in the two engines.
    if (/^(合计|总计|小计|total|grand total)[:：]?$/i.test(String(group.v).trim())) throw new Error('来源包含合计行，请先明确业务范围');
    let rejected = false;
    for (const f of plan.filters) {
      const cell = read(f.field);
      if (!cell || cell.f || cell.v == null) throw new Error('筛选字段缺失或含公式');
      const value = String(cell.v).trim().toLowerCase();
      const values = f.values.map((v) => v.trim().toLowerCase());
      const pass = f.op === 'exclude_prefix' ? !values.some((v) => value.startsWith(v)) :
        f.op === 'in' ? values.includes(value) : f.op === 'not_in' ? !values.includes(value) : undefined;
      if (pass === undefined) throw new Error('不支持的筛选操作');
      if (!pass) { rejected = true; break; }
    }
    if (rejected) { excluded++; continue; }
    const amount = read(plan.measure);
    if (!amount || amount.f || !['n', 's'].includes(amount.t)) throw new Error('金额缺失、含公式或不是数值');
    const value = String(amount.v);
    const match = value.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match) throw new Error('金额不是明确有限数值');
    const decimals = match[3] || '', power = 20 + Number(match[4] || 0) - decimals.length;
    if (power < 0 || power > 100) throw new Error('金额精度超出可验证范围');
    const scaled = BigInt((match[1] === '-' ? '-' : '') + match[2] + decimals) * (BigInt(10) ** BigInt(power));
    const groupKey = String(group.v).trim();
    groups.set(groupKey, (groups.get(groupKey) || BigInt(0)) + scaled);
    total += scaled; included++;
  }
  if (!included && !excluded) throw new Error('没有可核算业务数据');
  if ([...groups.values()].reduce((s, v) => s + v, BigInt(0)) !== total) throw new Error('分组总额不一致');
  if (sha256(original) !== sha256(fs.readFileSync(inputPath))) throw new Error('验证期间来源附件发生变化');
  fs.writeFileSync(path.join(packageDir, 'references/validation.json'), JSON.stringify({
    schema_version: 1, status: 'replayed', verifier: 'sheetjs-bigint-v1',
    source_sha256: sha256(original), plan_sha256: sha256(bytes), sheet: name,
    source_rows: included + excluded, included_rows: included, excluded_rows: excluded,
    total_scaled_1e20: total.toString(), group_count: groups.size,
    skipped_metadata_rows: metadataRows,
  }, null, 2));
}
