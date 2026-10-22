import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersonalSkillSourceAdapter } from './personal-skill-source.adapter';
import { PersonalSkillGeneratorService } from './personal-skill-generator.service';
import { PersonalSkillValidatorService } from './personal-skill-validator.service';
import { PersonalSkillStoreService } from './personal-skill-store.service';
import { PersonalSkillCaptureService } from './personal-skill-capture.service';
import { PersonalSkillController } from './personal-skill.controller';
import type { SkillSource } from './personal-skill.types';

describe('PersonalSkill End-to-End Suite', () => {
  let tmpRoot: string;
  let sourceAdapter: PersonalSkillSourceAdapter;
  let generator: PersonalSkillGeneratorService;
  let validator: PersonalSkillValidatorService;
  let store: PersonalSkillStoreService;
  let captureService: PersonalSkillCaptureService;
  let controller: PersonalSkillController;

  const mockChatConversationService: any = {
    getChatHistory: jest.fn(),
  };

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-personal-skills-test-'));
    process.env.PROJECT_ROOT = tmpRoot;
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    sourceAdapter = new PersonalSkillSourceAdapter(mockChatConversationService);
    generator = new PersonalSkillGeneratorService();
    validator = new PersonalSkillValidatorService();
    store = new PersonalSkillStoreService();
    captureService = new PersonalSkillCaptureService(sourceAdapter, generator, validator, store);
    controller = new PersonalSkillController(captureService, store);
  });

  describe('PersonalSkillSourceAdapter', () => {
    it('extracts instructions, corrections, inputs, and script code from chat turn', async () => {
      mockChatConversationService.getChatHistory.mockResolvedValue([
        {
          id: 'msg-1',
          role: 'user',
          content: '请按部门汇总金额',
          files: [{ fileName: 'dept_data.xlsx', filePath: '/workspace/dept_data.xlsx' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: '这是初步结果，总金额为 100 万元。',
        },
        {
          id: 'msg-3',
          role: 'user',
          content: '不对，不要包含外包人员，重新计算',
        },
        {
          id: 'msg-4',
          role: 'assistant',
          content:
            '已剔除外包人员，计算完成。生成了结果文件 summary.xlsx。\n```python\nimport pandas as pd\ndf = pd.read_excel("dept_data.xlsx")\ndf = df[df["type"] != "outsource"]\nres = df.groupby("dept")["amount"].sum().reset_index()\nres.to_excel("summary.xlsx", index=False)\n```',
        },
      ]);

      const source = await sourceAdapter.extractSource('user-1', {
        kind: 'sandbox_turn',
        sessionId: 'sess-1',
        messageId: 'msg-4',
      });

      expect(source.confirmedInstructions.length).toBeGreaterThan(0);
      expect(source.corrections?.length).toBeGreaterThan(0);
      expect(source.corrections?.[0]?.userCorrection).toContain('不要包含外包人员');
      expect(source.scriptCode).toContain('import pandas as pd');
      expect(source.outputContract.some((o) => o.type === 'xlsx')).toBe(true);
    });
  });

  describe('PersonalSkillGenerator & Validator', () => {
    it('generates standard skill package with parameterized scripts and rules', async () => {
      const mockSource: SkillSource = {
        source: { kind: 'sandbox_turn', sessionId: 'sess-1' },
        objective: '按部门排版并剔除外包人员',
        confirmedInstructions: ['按部门排版表格', '剔除外包人员'],
        corrections: [{ userCorrection: '不要包含外包人员' }],
        inputs: [{ name: 'dept_data.xlsx', type: 'xlsx', required: true }],
        reusableSteps: [{ description: '执行汇总脚本' }],
        reusableFiles: [],
        outputContract: [{ type: 'xlsx' }],
        scriptCode:
          'import pandas as pd\ndf = pd.read_excel("dept_data.xlsx")\ndf.to_excel("output.xlsx")',
      };

      const stagingDir = path.join(tmpRoot, 'test-staging');
      const { hasScript, deliverables } = await generator.generateSkillPackage(
        mockSource,
        '按部门无偿统计',
        'dept-amount-summary',
        stagingDir
      );

      expect(hasScript).toBe(true);
      expect(deliverables).toContain('.xlsx');

      const skillMd = fs.readFileSync(path.join(stagingDir, 'SKILL.md'), 'utf-8');
      expect(skillMd).toContain('name: dept-amount-summary');
      expect(skillMd).toContain('zh_name: "按部门无偿统计"');
      expect(skillMd).toContain('不要包含外包人员');

      const runPy = fs.readFileSync(path.join(stagingDir, 'scripts', 'run.py'), 'utf-8');
      expect(runPy).toContain('argparse');
      expect(runPy).toContain('input_path');
      expect(runPy).toContain('output_path');

      const rulesJson = JSON.parse(
        fs.readFileSync(path.join(stagingDir, 'references', 'rules.json'), 'utf-8')
      );
      expect(rulesJson.slug).toBe('dept-amount-summary');

      // 验证器测试
      const validation = await validator.validatePackage(stagingDir);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });
  });

  describe('PersonalSkillStoreService & CaptureService Pipeline', () => {
    it('executes full pipeline: capture, atomic install, versioning, copy, export, delete', async () => {
      mockChatConversationService.getChatHistory.mockResolvedValue([
        {
          id: 'msg-1',
          role: 'user',
          content: '请整理表格格式',
          files: [{ fileName: 'report.xlsx' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content:
            '完成。\n```python\nimport pandas as pd\ndf = pd.read_excel("report.xlsx")\ndf.to_excel("out.xlsx")\n```',
        },
      ]);

      // 1. 发起捕获
      const captureResult = await captureService.createCapture('test-user-42', {
        sourceRef: { kind: 'sandbox_turn', sessionId: 'sess-42' },
        displayName: '财务月度汇总',
        idempotencyKey: 'idemp-key-1',
      });
      expect(captureResult.captureId).toBeDefined();

      // 等待异步处理完成
      let status = captureService.getCaptureStatus('test-user-42', captureResult.captureId);
      for (let i = 0; i < 20; i++) {
        if (status.status === 'ready' || status.status === 'failed') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
        status = captureService.getCaptureStatus('test-user-42', captureResult.captureId);
      }
      expect(status.status).toBe('ready');
      expect(status.skillId).toBeDefined();

      const skillId = status.skillId!;

      // 2. 查询列表与详情
      const list = await store.listSkills('test-user-42');
      expect(list.length).toBe(1);
      expect(list[0]?.displayName).toBe('财务月度汇总');

      const detail = await store.getSkill('test-user-42', skillId);
      expect(detail).not.toBeNull();
      expect(detail?.version).toBe(1);
      expect(detail?.scriptFiles.length).toBe(1);

      // 3. 幂等性测试
      const idempotent = await captureService.createCapture('test-user-42', {
        sourceRef: { kind: 'sandbox_turn', sessionId: 'sess-42' },
        displayName: '财务月度汇总',
        idempotencyKey: 'idemp-key-1',
      });
      expect(idempotent.captureId).toBe(captureResult.captureId);

      // 4. 创建新版本
      const updated = await store.createVersion('test-user-42', skillId, {
        modificationInstruction: '增加新的列映射规则',
      });
      expect(updated.version).toBe(2);

      // 5. 复制为新技能
      const copied = await store.copySkill('test-user-42', skillId, '财务季度汇总', 'finance-quarterly');
      expect(copied.displayName).toBe('财务季度汇总');
      expect(copied.slug).toBe('finance-quarterly');

      // 6. 导出 ZIP
      const zipBuffer = await store.exportSkillZip('test-user-42', skillId);
      expect(zipBuffer.length).toBeGreaterThan(0);

      // 7. 删除技能
      const deleted = await store.deleteSkill('test-user-42', skillId);
      expect(deleted).toBe(true);
      const afterDelete = await store.getSkill('test-user-42', skillId);
      expect(afterDelete).toBeNull();
    });
  });

  describe('PersonalSkillController API', () => {
    it('handles list and get skill requests', async () => {
      const mockReq: any = {
        headers: { 'x-user-id': 'controller-user' },
      };

      const emptyList = await controller.listSkills(mockReq);
      expect(Array.isArray(emptyList)).toBe(true);
      expect(emptyList.length).toBe(0);
    });
  });
});
