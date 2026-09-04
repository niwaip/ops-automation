import { WorkbenchTodoParserService } from '../src/modules/workbench-todo/workbench-todo-parser.service';
import { TodoPriority, TodoSourceType } from '../src/modules/workbench-todo/dto/workbench-todo.dto';

describe('WorkbenchTodoParserService', () => {
  let service: WorkbenchTodoParserService;

  beforeEach(() => {
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
});
