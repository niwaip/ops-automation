import { BadRequestException } from '@nestjs/common';
import { TemporalWorkflowValidationContractService } from '../src/workflow-registry/validation/temporal-workflow-validation-contract.service';
import type { WorkflowDsl } from '../src/modules/temporal-workflow/temporal-workflow.types';

describe('TemporalWorkflowValidationContractService', () => {
  const service = new TemporalWorkflowValidationContractService();
  const workflowDsl: WorkflowDsl = {
    name: 'HotboardWorkflow',
    taskQueue: 'SKILL_TASK_QUEUE',
    steps: [],
    inputParams: {
      type: { type: 'string', required: true, defaultValue: 'weibo' },
      time: {
        type: 'integer',
        format: 'unix-milliseconds',
        required: false,
        description: '时光机模式毫秒时间戳',
      },
      keyword: { type: 'string', required: false },
      time_start: { type: 'integer', format: 'unix-milliseconds', required: false },
      time_end: { type: 'integer', format: 'unix-milliseconds', required: false },
      limit: { type: 'integer', required: false },
    },
    validation: {
      scenarios: [
        { id: 'current', label: '当前热榜', parameters: ['type'], requiredParameters: ['type'] },
        {
          id: 'history',
          label: '时光机',
          parameters: ['type', 'time'],
          requiredParameters: ['type', 'time'],
        },
        {
          id: 'search',
          label: '搜索',
          parameters: ['type', 'keyword', 'time_start', 'time_end', 'limit'],
          requiredParameters: ['type', 'keyword', 'time_start', 'time_end'],
        },
      ],
      assertions: [
        {
          path: '$.result.result.businessData.result.list',
          operator: 'minItems',
          value: 1,
          scenarioIds: ['current', 'history'],
        },
        {
          path: '$.result.result.businessData.result.results',
          operator: 'minItems',
          value: 1,
          scenarioIds: ['search'],
        },
      ],
    },
  };

  it('does not inject example values and converts ISO date-time to integer milliseconds', () => {
    const normalized = service.normalizeInput(workflowDsl, {
      __validationScenario: 'search',
      type: 'weibo',
      keyword: 'AI',
      time_start: '2026-08-01T00:00:00.000Z',
      time_end: '2026-08-12T00:00:00.000Z',
      limit: '10',
    });

    expect(normalized.input).toEqual({
      type: 'weibo',
      keyword: 'AI',
      time_start: 1785542400000,
      time_end: 1786492800000,
      limit: 10,
    });
    expect(normalized.scenario?.id).toBe('search');
  });

  it('rejects parameters from another mutually exclusive validation scenario', () => {
    expect(() =>
      service.normalizeInput(workflowDsl, {
        __validationScenario: 'current',
        type: 'weibo',
        keyword: 'AI',
      })
    ).toThrow(BadRequestException);
  });

  it('rejects a successful runtime shell when scenario business data is empty', () => {
    const result = service.validateResult(
      workflowDsl,
      {
        result: {
          result: { businessData: { result: { list: [], snapshot_time: 0, update_time: '' } } },
        },
      },
      workflowDsl.validation?.scenarios?.[0]
    );

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('minItems');
  });

  it('accepts meaningful scenario-specific business output', () => {
    const result = service.validateResult(
      workflowDsl,
      {
        result: {
          result: {
            businessData: { result: { list: [{ title: 'AI 新闻', url: 'https://example.com' }] } },
          },
        },
      },
      workflowDsl.validation?.scenarios?.[0]
    );

    expect(result).toEqual({ success: true, errors: [] });
  });

  it('evaluates compiler-owned logical assertions from businessData', () => {
    const result = service.validateResult(
      {
        ...workflowDsl,
        validation: {
          assertions: [
            { field: 'items', fieldPath: '$', operator: 'minItems', value: 1 },
            { field: 'market', fieldPath: '$.box_office', operator: 'nonEmpty' },
          ],
        },
      },
      {
        result: {
          result: {
            businessData: {
              items: [{ movie_name: '测试电影' }],
              market: { box_office: '100万' },
            },
          },
        },
      }
    );

    expect(result).toEqual({ success: true, errors: [] });
  });

  it('accepts persisted AI aliases for required fields and numeric minimums', () => {
    const result = service.validateResult(
      {
        ...workflowDsl,
        validation: {
          assertions: [
            { field: 'total_items', operator: 'min', value: 1 },
            { field: 'updated_at', operator: 'required' as never, value: true },
            { field: 'market', operator: 'required' as never, value: true },
          ],
        },
      },
      {
        result: {
          result: {
            businessData: {
              total_items: 54,
              updated_at: 1786610154046,
              market: { box_office: '8627.4万' },
            },
          },
        },
      }
    );

    expect(result).toEqual({ success: true, errors: [] });
  });
});
