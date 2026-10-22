import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { compilePersonalSkillWorkflow } from './personal-skill-workflow.compiler';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';
import type { SkillSource } from './personal-skill.types';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillStoreService } from './personal-skill-store.service';

const rule = '按照 部门编号 分组统计金额 的合计， 不包含WBS编号 中ex，sy，sp，ip，ib，sz开头的数据';
const source = (instructions = [rule]): SkillSource => ({
  source: { kind: 'sandbox_turn', sessionId: 's', messageId: 'm' }, objective: rule,
  confirmedInstructions: instructions, inputs: [{ name: 'input.xlsx', type: 'xlsx' }],
  reusableSteps: [], reusableFiles: [], outputContract: [],
});

describe('Executable personal calculation workflows', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-workflow-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('preserves every prefix and does not infer a paid filter from the skill name', () => {
    const plan = compilePersonalSkillWorkflow(source())!;
    expect(plan.group_by).toBe('部门编号'); expect(plan.measure).toBe('金额');
    expect(plan.filters).toEqual([{ field: 'WBS编号', op: 'exclude_prefix', values: ['ex', 'sy', 'sp', 'ip', 'ib', 'sz'] }]);
    expect(plan.steps).toHaveLength(6);
  });

  it('compiles explicit equality filters and refuses an uncompiled restriction', () => {
    expect(compilePersonalSkillWorkflow(source(['请按部门汇总金额', '仅统计有偿无偿为有偿']))?.filters)
      .toEqual([{ field: '有偿无偿', op: 'in', values: ['有偿'] }]);
    expect(() => compilePersonalSkillWorkflow(source(['按部门汇总金额', '排除外包人员'])))
      .toThrow('尚未完整编译');
    expect(() => compilePersonalSkillWorkflow(source(['按部门汇总金额', '按地区汇总金额'])))
      .toThrow('冲突');
  });

  it('replays a generated package on physical source rows before accepting it', async () => {
    const input = path.join(root, 'renamed.xlsx'), pkg = path.join(root, 'pkg');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['业务标题'], [], ['金额(K)', 'WBS编号', '部门编号', '有偿无偿'],
      [10.1, 'ok-1', 'A', '无偿'], [20.2, 'OK-2', 'A', '有偿'], [999, 'EX-9', 'B', '有偿'],
    ]), '新表名');
    XLSX.writeFile(book, input);
    await new PersonalSkillGeneratorService().generateSkillPackage(source(), '部门别有偿统计', 'dept-summary', pkg);
    const validator = new PersonalSkillValidatorService();
    expect((await validator.validatePackage(pkg)).valid).toBe(false);
    const checked = await validator.validatePackage(pkg, input);
    expect(checked.errors).toEqual([]);
    const replay = JSON.parse(fs.readFileSync(path.join(pkg, 'references/validation.json'), 'utf8'));
    expect(replay.included_rows).toBe(2); expect(replay.excluded_rows).toBe(1);
    expect(replay.total_scaled_1e20).toBe('3030000000000000000000');
    fs.appendFileSync(path.join(pkg, 'references/workflow.json'), ' ');
    expect((await validator.validatePackage(pkg, input)).valid).toBe(false);
  });

  it('refuses claimed file delivery without a saved generation step', () => {
    const request = source(); request.outputContract = [{ type: 'xlsx' }];
    expect(() => compilePersonalSkillWorkflow(request)).toThrow('交付文件生成步骤');
  });

  it('captures rules without a visible code block, replays the attachment, and installs a verifiable package', async () => {
    const previous = process.env.PROJECT_ROOT; process.env.PROJECT_ROOT = root;
    try {
      const store = new PersonalSkillStoreService();
      const workspace = path.join(store.getUserKnowledgeDir('u'), '..', 'workspace', '.sessions', 's');
      fs.mkdirSync(workspace, { recursive: true });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
        ['部门编号', '金额(K)', 'WBS编号'], ['A', 17.5, 'OK1'], ['A', 999, 'SY1'],
      ]), '数据');
      XLSX.writeFile(book, path.join(workspace, 'input.xlsx'));
      const capture = new PersonalSkillCaptureService({ extractSource: async () => source() } as any,
        new PersonalSkillGeneratorService(), new PersonalSkillValidatorService(), store);
      const task = await capture.createCapture('u', { displayName: '部门别有偿统计', sourceRef: source().source });
      for (let i = 0; i < 50 && !['ready', 'failed'].includes(capture.getCaptureStatus('u', task.captureId).status); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const status = capture.getCaptureStatus('u', task.captureId);
      expect(status.error).toBeUndefined(); expect(status.status).toBe('ready');
      expect(status.executionMode).toBe('verified_workflow');
      const record = store.loadCatalog('u')[status.skillId!]!;
      expect(record.hasScript).toBe(true); expect(record.requiresExecution).toBe(true);
      const detail = await store.getSkill('u', record.skillId);
      expect(detail?.referenceFiles.some((f) => f.name === 'workflow.json')).toBe(true);
      expect(detail?.referenceFiles.some((f) => f.name === 'validation.json')).toBe(true);
      await expect(store.createVersion('u', record.skillId, { modificationInstruction: '仅统计有偿无偿为有偿' }))
        .rejects.toThrow('重新编译');
    } finally {
      if (previous === undefined) delete process.env.PROJECT_ROOT; else process.env.PROJECT_ROOT = previous;
    }
  });
});
