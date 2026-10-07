import axios from 'axios';
import { BadRequestException } from '@nestjs/common';
import {
  isLegacyWorkflowVersion,
  validateAiWorkflowDraftPlan,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft-plan.helpers';
import { createService } from './temporal-workflow-draft.test-helper';

jest.mock('axios');

const deps = {
  pickFirstNonEmptyString: (...values: unknown[]) =>
    values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) || '',
  buildWorkflowSemanticHint: () => '',
};

const activityResources: any[] = [
  {
    ref: 'builtin:structuredTransform',
    name: '固定规则转换',
    fn: 'structuredTransform',
    timeout: '90s',
    handler: 'api',
    config: {},
  },
  {
    ref: 'builtin:aiStructuredTransform',
    name: '遗留 AI 转换',
    fn: 'aiStructuredTransform',
    timeout: '90s',
    handler: 'api',
    config: {},
  },
];

function planWith(activityRef: string, version = 'v4.0.0', extraStepInput: any = {}): any {
  return {
    version,
    steps: [{ id: 'step-1', name: '模型总结', activityRef, input: extraStepInput }],
  };
}

describe('Temporal Workflow model capability boundary and validation consolidation', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isLegacyWorkflowVersion (R2 & R3: strict semver validation and segment matching)', () => {
    it.each([
      ['v1.0.0', true],
      ['v2.0.0', true],
      ['v3.0.0', true],
      ['1.0.0', true],
      ['v1', true],
      ['v2', true],
      ['v3', true],
      ['v4.0.0', false],
      ['v10.0.0', false],
      ['v20.0.0', false],
      ['v30.0.0', false],
      ['v1garbage', false],
      ['v1.garbage', false],
      ['v1..0', false],
      ['v2.foo', false],
      ['v3.', false],
      ['v1.0.0.1', false],
      ['unknown', false],
      ['', false],
    ])('evaluates version %s as legacy=%s', (version, expected) => {
      expect(isLegacyWorkflowVersion(version)).toBe(expected);
    });

    it('respects custom OPS_LEGACY_WORKFLOW_VERSIONS with precise segment boundaries', () => {
      const origEnv = process.env.OPS_LEGACY_WORKFLOW_VERSIONS;
      try {
        process.env.OPS_LEGACY_WORKFLOW_VERSIONS = 'v1.0.0,v2.5';
        expect(isLegacyWorkflowVersion('v1.0.0')).toBe(true);
        expect(isLegacyWorkflowVersion('v1.0.1')).toBe(false);
        expect(isLegacyWorkflowVersion('v1.0.0.1')).toBe(false);
        expect(isLegacyWorkflowVersion('v2.5.0')).toBe(true);
        expect(isLegacyWorkflowVersion('v2.5.9')).toBe(true);
        expect(isLegacyWorkflowVersion('v2.50.0')).toBe(false);
      } finally {
        if (origEnv !== undefined) {
          process.env.OPS_LEGACY_WORKFLOW_VERSIONS = origEnv;
        } else {
          delete process.env.OPS_LEGACY_WORKFLOW_VERSIONS;
        }
      }
    });

    it('rejects aiStructuredTransform for v10/v20/v30 and malformed versions in validatePlan', () => {
      const { aiDraftService } = createService();

      for (const ver of ['v10.0.0', 'v20.0.0', 'v30.0.0', 'v1.garbage', 'v1..0', 'v2.foo', 'v3.']) {
        const issues = aiDraftService.validatePlan(
          planWith('builtin:aiStructuredTransform', ver),
          activityResources,
        );
        expect(issues).toContainEqual(
          expect.stringContaining('使用了已弃用的 builtin:aiStructuredTransform'),
        );
      }
    });
  });

  describe('Activity boundary validation', () => {
    it.each(['llmOperationActivity', 'builtin:llmOperation'])(
      'rejects %s because LLM Operation is not an Activity',
      (activityRef) => {
        const issues = validateAiWorkflowDraftPlan(
          planWith(activityRef),
          [...activityResources, { ref: activityRef } as any],
          deps,
        );

        expect(issues).toContainEqual(
          expect.stringContaining('模型能力必须作为独立 llm_operation 计划节点由控制面直接执行'),
        );
      },
    );

    it('rejects legacy aiStructuredTransform for new workflow versions', () => {
      const issues = validateAiWorkflowDraftPlan(
        planWith('builtin:aiStructuredTransform'),
        activityResources,
        deps,
      );

      expect(issues).toContainEqual(
        expect.stringContaining('不能迁移为另一种 Activity'),
      );
    });

    it('validates capability boundary through TemporalWorkflowAiDraftService.validatePlan entry point', () => {
      const { aiDraftService } = createService();

      // 1. New version without version declaration rejects builtin:aiStructuredTransform
      const newVersionIssues = aiDraftService.validatePlan(
        planWith('builtin:aiStructuredTransform', ''),
        activityResources,
      );
      expect(newVersionIssues).toContainEqual(
        expect.stringContaining('使用了已弃用的 builtin:aiStructuredTransform'),
      );

      // 2. LLM Operation in activity is rejected
      const llmOpIssues = aiDraftService.validatePlan(
        planWith('llmOperationActivity', 'v1.0.0'),
        [...activityResources, { ref: 'llmOperationActivity' } as any],
      );
      expect(llmOpIssues).toContainEqual(
        expect.stringContaining('模型能力必须作为独立 llm_operation 计划节点由控制面直接执行'),
      );

      // 3. Legacy version v1.0.0 allows builtin:aiStructuredTransform (only reports missing config, not deprecated activity)
      const legacyIssues = aiDraftService.validatePlan(
        planWith('builtin:aiStructuredTransform', 'v1.0.0', {
          __structuredTransform: {
            contentType: 'json',
            contentTemplate: '{content}',
            instructionTemplate: '提取关键信息',
            outputMode: 'json',
          },
        }),
        activityResources,
      );
      expect(legacyIssues.some((issue: string) => issue.includes('已弃用'))).toBe(false);

      // 4. Retains existing input enum validation
      const enumValidationPlan = {
        version: 'v4.0.0',
        inputParams: {
          status: {
            type: 'string',
            enum: [123, 456], // numbers instead of strings
          },
        },
        steps: [
          {
            id: 'step-1',
            name: '固定规则转换',
            activityRef: 'builtin:structuredTransform',
            input: {
              __structuredTransform: {
                contentType: 'json',
                contentTemplate: '{content}',
                outputMode: 'text',
              },
            },
          },
        ],
      };
      const enumIssues = aiDraftService.validatePlan(enumValidationPlan as any, activityResources);
      expect(enumIssues).toContainEqual(
        expect.stringContaining('输入参数 status 的 enum 值类型必须与 type=string 一致'),
      );
    });
  });

  describe('End-to-end draft generation enforcement (R1)', () => {
    it('throws BadRequestException when model continuously returns forbidden builtin:aiStructuredTransform on new version', async () => {
      const { service, prisma } = createService();
      prisma.activity.findMany.mockResolvedValue([]);

      // Model keeps returning deprecated aiStructuredTransform in new version (v4.0.0)
      mockedAxios.post.mockResolvedValue({
        data: {
          result: JSON.stringify({
            version: 'v4.0.0',
            workflowName: 'forbidden-ai-transform',
            workflowDescription: '使用已被禁用的 AI 转换 Activity',
            workflowClassName: 'ForbiddenAiTransformWorkflow',
            workflowDefnName: 'forbidden-ai-transform',
            taskQueue: 'SKILL_TASK_QUEUE',
            steps: [
              {
                id: 'step_1',
                name: '非法模型活动',
                type: 'activity',
                activityRef: 'builtin:aiStructuredTransform',
                input: {
                  __structuredTransform: {
                    contentType: 'json',
                    contentTemplate: '{content}',
                    instructionTemplate: '总结',
                    outputMode: 'json',
                  },
                },
              },
            ],
          }),
        },
      } as any);

      await expect(
        service.generateAiWorkflowDraft({
          description: '生成天气分析工作流',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when model returns llmOperation as activity in draft', async () => {
      const { service, prisma } = createService();
      prisma.activity.findMany.mockResolvedValue([]);

      mockedAxios.post.mockResolvedValue({
        data: {
          result: JSON.stringify({
            version: 'v1.0.0',
            workflowName: 'forbidden-llm-activity',
            workflowDescription: '将 LLM 作为 Activity',
            workflowClassName: 'ForbiddenLlmActivityWorkflow',
            workflowDefnName: 'forbidden-llm-activity',
            taskQueue: 'SKILL_TASK_QUEUE',
            steps: [
              {
                id: 'step_1',
                name: '模型活动节点',
                type: 'activity',
                activityRef: 'builtin:llmOperation',
                input: {},
              },
            ],
          }),
        },
      } as any);

      await expect(
        service.generateAiWorkflowDraft({
          description: '生成工作流',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when model returns malformed version v1.garbage with builtin:aiStructuredTransform (R3 reproduction)', async () => {
      const { service, prisma } = createService();
      prisma.activity.findMany.mockResolvedValue([]);

      mockedAxios.post.mockResolvedValue({
        data: {
          result: JSON.stringify({
            version: 'v1.garbage',
            workflowName: 'malformed-version-activity',
            workflowDescription: '非法版本字符串携带旧活动',
            workflowClassName: 'MalformedVersionWorkflow',
            workflowDefnName: 'malformed-version-activity',
            taskQueue: 'SKILL_TASK_QUEUE',
            steps: [
              {
                id: 'step_1',
                name: '模型活动节点',
                type: 'activity',
                activityRef: 'builtin:aiStructuredTransform',
                input: {
                  __structuredTransform: {
                    contentType: 'json',
                    contentTemplate: '{content}',
                    instructionTemplate: '提取关键信息',
                    outputMode: 'json',
                    outputSchema: { result: 'string' },
                  },
                },
              },
            ],
          }),
        },
      } as any);

      await expect(
        service.generateAiWorkflowDraft({
          description: '生成工作流',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
