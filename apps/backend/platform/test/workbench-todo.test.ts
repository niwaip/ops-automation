import axios from 'axios';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  WorkbenchTodoParserService,
  TodoPriority,
  TodoSourceType,
  QueryWorkbenchTodoDto,
} from '@ops/workbench/todo';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WorkbenchTodoParserService', () => {
  let service: WorkbenchTodoParserService;

  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockRejectedValue(new Error('AI Orchestrator offline'));
    service = new WorkbenchTodoParserService();
  });

  it('should extract 5W1H elements from text using heuristics', async () => {
    const rawText = '明天下午5点前麻烦 @张三 导出运维报表并备份数据库，因为下周有安全审计，这是P0紧急任务';
    const result = service.extractWithHeuristics(rawText);

    expect(result.who).toContain('张三');
    expect(result.when).toBe('明天下午');
    expect(result.priority).toBe(TodoPriority.high);
    expect(result.what).toContain('导出运维报表');
  });

  it('should infer low priority when text indicates non-urgent task', () => {
    const rawText = '后续有空的时候排期看一下这个参考文档';
    const result = service.extractWithHeuristics(rawText);
    expect(result.priority).toBe(TodoPriority.low);
  });

  it('should match suggested workflows by keyword', async () => {
    const workflows = [
      { id: 'wf-db-backup', name: '备份数据库工作流', description: '自动备份 Postgres' },
      { id: 'wf-report', name: '周报生成与邮件发送', description: '生成月报周报' },
    ];

    const preview = await service.extractTodoPreview(
      {
        text: '请在下周一前备份数据库并检查磁盘空间',
        sourceType: TodoSourceType.chat,
      },
      workflows
    );

    expect(preview.suggestedWorkflowId).toBe('wf-db-backup');
    expect(preview.suggestedWorkflowName).toBe('备份数据库工作流');
    expect(preview.sourceType).toBe(TodoSourceType.chat);
  });

  it('should use AI extraction when AI Orchestrator returns structured 5W1H JSON', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        response: JSON.stringify({
          what: '备份数据库',
          why: '下周审计',
          who: ['李四'],
          when: '明天上午',
          priority: 'high',
          suggestedWorkflowId: 'wf-db-backup',
          suggestedWorkflowName: '备份数据库工作流',
        }),
      },
    } as any);

    const workflows = [
      { id: 'wf-db-backup', name: '备份数据库工作流', description: '自动备份 Postgres' },
    ];

    const preview = await service.extractTodoPreview(
      {
        text: '李四负责明天上午备份数据库以备下周审计',
        sourceType: TodoSourceType.chat,
      },
      workflows
    );

    expect(preview.title).toBe('备份数据库');
    expect(preview.suggestedWorkflowId).toBe('wf-db-backup');
  });
});

describe('QueryWorkbenchTodoDto validation', () => {
  it('should allow pageSize up to 500 and reject pageSize above 500', () => {

    const dto100 = plainToInstance(QueryWorkbenchTodoDto, { pageSize: '100' });
    expect(validateSync(dto100)).toHaveLength(0);

    const dto200 = plainToInstance(QueryWorkbenchTodoDto, { pageSize: '200' });
    expect(validateSync(dto200)).toHaveLength(0);

    const dto500 = plainToInstance(QueryWorkbenchTodoDto, { pageSize: '500' });
    expect(validateSync(dto500)).toHaveLength(0);

    const dto600 = plainToInstance(QueryWorkbenchTodoDto, { pageSize: '600' });
    const errors600 = validateSync(dto600);
    expect(errors600.length).toBeGreaterThan(0);
    expect(errors600[0].constraints?.max).toContain('pageSize must not be greater than 500');
  });
});
